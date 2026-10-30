import Stripe from "stripe";
import { env } from "../config/env.js";
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import PaymentEvent from "../models/PaymentEvent.js";
import SeatLock from "../models/SeatLock.js";
import { sendBookingNotice } from "./notifications.js";
import User from "../models/User.js";
import { publishSeatChanges } from "./socket.js";

let stripeClient;
export function getStripe() {
  if (!env.stripeSecretKey) return null;
  if (!stripeClient) stripeClient = new Stripe(env.stripeSecretKey);
  return stripeClient;
}

export async function completeCheckout(session, eventId = "") {
  if (session.payment_status !== "paid") return null;
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) throw Object.assign(new Error("Payment is missing its booking reference."), { status: 400 });
  const booking = await Booking.findById(bookingId);
  if (!booking) throw Object.assign(new Error("Booking was not found."), { status: 404 });
  const payment = await Payment.findOne({ bookingId: booking._id });
  if (!payment || payment.providerSessionId !== session.id) {
    throw Object.assign(new Error("Checkout session does not match this booking."), { status: 400 });
  }
  if (session.amount_total !== booking.amountPaise || String(session.currency || "").toUpperCase() !== booking.currency) {
    throw Object.assign(new Error("Checkout amount or currency does not match this booking."), { status: 400 });
  }
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "";
  if (booking.paymentStatus === "paid" && booking.status === "confirmed") {
    await Payment.updateOne({ bookingId: booking._id }, {
      $set: { status: "paid", providerPaymentId: paymentIntentId, paidAt: booking.updatedAt || new Date(), lastEventId: eventId },
    });
    return booking;
  }

  const locks = await SeatLock.find({ bookingId: booking._id });
  const allBooked = locks.length === booking.seats.length && locks.every((lock) => lock.status === "booked");
  const allFreshlyLocked = locks.length === booking.seats.length && locks.every((lock) => lock.status === "locked" && lock.expiresAt && lock.expiresAt > new Date());
  const canFinishLockUpgrade = locks.length === booking.seats.length && locks.every((lock) =>
    lock.status === "booked" || (lock.status === "locked" && lock.expiresAt && lock.expiresAt > new Date())
  );
  let seatLocksReady = allBooked;
  if (allFreshlyLocked || canFinishLockUpgrade) {
    const stillLockedCount = locks.filter((lock) => lock.status === "locked").length;
    const upgraded = await SeatLock.updateMany(
      { bookingId: booking._id, status: "locked", expiresAt: { $gt: new Date() } },
      { $set: { status: "booked", expiresAt: null } }
    );
    seatLocksReady = upgraded.modifiedCount === stillLockedCount;
    if (!seatLocksReady) {
      // Webhook retries can race with one another, or resume an interrupted multi-document update.
      const latestLocks = await SeatLock.find({ bookingId: booking._id });
      seatLocksReady = latestLocks.length === booking.seats.length && latestLocks.every((lock) => lock.status === "booked");
    }
  }
  if (!seatLocksReady) {
    const stripe = getStripe();
    if (stripe && paymentIntentId) await stripe.refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey: "imovies-expired-hold-" + booking._id });
    await SeatLock.deleteMany({ bookingId: booking._id });
    const cancelled = await Booking.findOneAndUpdate(
      { _id: booking._id, status: { $in: ["pending", "cancelled"] } },
      { $set: { status: "cancelled", paymentStatus: "refunded", holdExpiresAt: null, paymentIntentId, cancellationReason: "The seat hold expired before payment was confirmed." } },
      { new: true }
    );
    await Payment.updateOne({ bookingId: booking._id }, {
      $set: { status: "refunded", providerPaymentId: paymentIntentId, refundedAt: new Date(), lastEventId: eventId },
    });
    publishSeatChanges(booking.showId, booking.seats.map((seat) => ({ seatId: seat.seatId, state: "available" })));
    return cancelled || await Booking.findById(booking._id);
  }

  const confirmed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: "pending", paymentStatus: "pending" },
    { $set: { status: "confirmed", paymentStatus: "paid", holdExpiresAt: null, paymentIntentId } },
    { new: true }
  );
  if (!confirmed) {
    const latest = await Booking.findById(booking._id);
    if (latest?.status === "confirmed" && latest.paymentStatus === "paid") {
      await Payment.updateOne({ bookingId: booking._id }, {
        $set: { status: "paid", providerPaymentId: paymentIntentId, paidAt: latest.updatedAt || new Date(), lastEventId: eventId },
      });
      return latest;
    }
    return latest;
  }
  booking.status = confirmed.status;
  booking.paymentStatus = confirmed.paymentStatus;
  booking.paymentIntentId = paymentIntentId;
  await Payment.updateOne({ bookingId: booking._id }, {
    status: "paid",
    providerPaymentId: booking.paymentIntentId,
    paidAt: new Date(),
    lastEventId: eventId,
  });
  publishSeatChanges(booking.showId, booking.seats.map((seat) => ({ seatId: seat.seatId, state: "booked" })));
  const user = await User.findById(booking.userId).select("email fullName");
  await sendBookingNotice(
    booking,
    user,
    "Your iMovies tickets are confirmed",
    "Your booking " + booking.bookingReference + " is confirmed. Seats: " + booking.seats.map((seat) => seat.seatId).join(", ") + "."
  );
  return booking;
}

export async function releasePendingBooking(booking, reason = "Payment was not completed.") {
  if (!booking || booking.status !== "pending") return;
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: "pending", paymentStatus: "pending" },
    { $set: { status: "cancelled", paymentStatus: "failed", holdExpiresAt: null, cancellationReason: reason } },
    { new: true }
  );
  if (!updated) return;
  await SeatLock.deleteMany({ bookingId: booking._id });
  await Payment.updateOne({ bookingId: booking._id, status: "pending" }, { $set: { status: "failed" } });
  publishSeatChanges(booking.showId, booking.seats.map((seat) => ({ seatId: seat.seatId, state: "available" })));
}

export async function processStripeEvent(event) {
  if (await PaymentEvent.exists({ eventId: event.id })) return { duplicate: true };
  let booking;
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    await completeCheckout(event.data.object, event.id);
  } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    const bookingId = event.data.object.metadata?.bookingId;
    const payment = bookingId ? await Payment.findOne({ bookingId, providerSessionId: event.data.object.id }) : null;
    booking = payment ? await Booking.findById(payment.bookingId) : null;
    await releasePendingBooking(booking, "Checkout expired or payment failed.");
  }
  try {
    await PaymentEvent.create({ eventId: event.id, type: event.type });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  return { duplicate: false };
}
