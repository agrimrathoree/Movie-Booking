import crypto from "node:crypto";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Movie from "../models/Movie.js";
import Show from "../models/Show.js";
import SeatLock from "../models/SeatLock.js";
import Theater from "../models/Theater.js";
import { env } from "../config/env.js";
import { isSeatInLayout, normalizeSeatIds, priceSeats, sumSeatPrices } from "../utils/bookingRules.js";
import { publishSeatChanges } from "./socket.js";
import { sendBookingNotice } from "./notifications.js";
import User from "../models/User.js";
import { getStripe } from "./paymentService.js";
import Payment from "../models/Payment.js";

export async function getShowOrThrow(showId) {
  if (!mongoose.isValidObjectId(showId)) throw Object.assign(new Error("Invalid show ID."), { status: 400 });
  const show = await Show.findOne({ _id: showId, active: true }).populate("movieId").populate("theaterId");
  if (!show) throw Object.assign(new Error("Show not found."), { status: 404 });
  return show;
}

export async function lockSeats({ user, showId, requestedSeats }) {
  const show = await getShowOrThrow(showId);
  if (show.startsAt <= new Date()) throw Object.assign(new Error("This show has already started."), { status: 400 });
  const seatIds = normalizeSeatIds(requestedSeats);
  if (seatIds.length === 0 || seatIds.length > 10) throw Object.assign(new Error("Choose between 1 and 10 seats."), { status: 400 });
  if (seatIds.length !== requestedSeats.length) throw Object.assign(new Error("Seat IDs must be unique."), { status: 400 });
  if (!seatIds.every((seatId) => isSeatInLayout(seatId, show.seatLayout))) {
    throw Object.assign(new Error("One or more seats are not part of this show."), { status: 400 });
  }

  const now = new Date();
  await SeatLock.deleteMany({ showId: show._id, seatId: { $in: seatIds }, status: "locked", expiresAt: { $lte: now } });
  const holdId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + env.seatLockMinutes * 60 * 1000);
  const prices = priceSeats(seatIds, show.seatLayout, show.seatPrices);
  const total = sumSeatPrices(prices);
  const movie = show.movieId;
  const theater = show.theaterId;
  const reference = "IM" + crypto.randomBytes(6).toString("hex").toUpperCase();

  let booking;
  try {
    await SeatLock.insertMany(seatIds.map((seatId) => ({
      showId: show._id,
      seatId,
      ownerId: user._id,
      holdId,
      status: "locked",
      expiresAt,
    })), { ordered: true });

    booking = await Booking.create({
      bookingReference: reference,
      userId: user._id,
      showId: show._id,
      movie: {
        id: movie._id,
        title: movie.movieName,
        poster: movie.poster,
        category: movie.categories?.[0] || "",
        durationMins: movie.duration || 0,
        year: movie.year,
        rating: movie.rating,
      },
      showtime: show.startsAt,
      holdExpiresAt: expiresAt,
      auditorium: show.auditorium,
      theater: { name: theater.name, city: theater.city },
      seats: prices,
      basePrice: show.seatPrices.standard,
      amount: total,
      amountPaise: Math.round(total * 100),
      currency: "INR",
      status: "pending",
      paymentStatus: "pending",
    });
    const linkedLocks = await SeatLock.updateMany({ showId: show._id, holdId }, { $set: { bookingId: booking._id } });
    if (linkedLocks.matchedCount !== seatIds.length) throw new Error("Could not attach the seat hold to its booking.");
    publishSeatChanges(show._id, seatIds.map((seatId) => ({ seatId, state: "locked", expiresAt })));
    return { booking, holdId, expiresAt, total, seats: prices };
  } catch (error) {
    if (booking?._id) await Booking.deleteOne({ _id: booking._id, status: "pending" });
    await SeatLock.deleteMany({ showId: show._id, holdId, ownerId: user._id });
    if (error.code === 11000) {
      const current = await SeatLock.find({ showId: show._id, seatId: { $in: seatIds }, status: "booked" }).select("seatId");
      const locked = await SeatLock.find({ showId: show._id, seatId: { $in: seatIds }, status: "locked", expiresAt: { $gt: new Date() } }).select("seatId");
      throw Object.assign(new Error("One or more seats were just taken. Refresh the seat map and choose again."), {
        status: 409,
        occupied: [...current, ...locked].map((seat) => seat.seatId),
      });
    }
    throw error;
  }
}

export async function cancelPendingBooking(booking, message) {
  if (booking.status !== "pending") return;
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: "pending", paymentStatus: "pending" },
    { $set: { status: "cancelled", paymentStatus: "failed", holdExpiresAt: null, cancellationReason: message || "Booking cancelled before payment." } },
    { new: true }
  );
  if (!updated) return;
  await SeatLock.deleteMany({ bookingId: booking._id });
  await Payment.updateOne({ bookingId: booking._id, status: "pending" }, { $set: { status: "failed" } });
  publishSeatChanges(booking.showId, booking.seats.map((seat) => ({ seatId: seat.seatId, state: "available" })));
}

export async function cancelConfirmedBooking(booking) {
  const show = await Show.findById(booking.showId);
  const cutoff = env.cancellationCutoffHours * 60 * 60 * 1000;
  if (!show || show.startsAt.getTime() - Date.now() <= cutoff) {
    throw Object.assign(new Error("Bookings can be cancelled only before the cancellation cutoff."), { status: 409 });
  }
  const stripe = getStripe();
  if (!stripe || !booking.paymentIntentId) {
    throw Object.assign(new Error("Refunds are unavailable until Stripe is configured."), { status: 503 });
  }
  await stripe.refunds.create(
    { payment_intent: booking.paymentIntentId },
    { idempotencyKey: "imovies-cancel-" + booking._id }
  );
  booking.status = "cancelled";
  booking.paymentStatus = "refunded";
  booking.cancelledAt = new Date();
  booking.cancellationReason = "Cancelled by customer.";
  await booking.save();
  await SeatLock.deleteMany({ bookingId: booking._id, status: "booked" });
  await Payment.updateOne({ bookingId: booking._id }, { $set: { status: "refunded", refundedAt: new Date() } });
  publishSeatChanges(booking.showId, booking.seats.map((seat) => ({ seatId: seat.seatId, state: "available" })));
  const user = await User.findById(booking.userId).select("email fullName");
  await sendBookingNotice(booking, user, "Your iMovies booking was cancelled", "Booking " + booking.bookingReference + " was cancelled and a refund was requested.");
}

export async function findOwnedBooking(userId, bookingId) {
  if (!mongoose.isValidObjectId(bookingId)) throw Object.assign(new Error("Invalid booking ID."), { status: 400 });
  const booking = await Booking.findOne({ _id: bookingId, userId });
  if (!booking) throw Object.assign(new Error("Booking not found."), { status: 404 });
  return booking;
}

export async function createCheckout(booking, origin) {
  const stripe = getStripe();
  if (!stripe) throw Object.assign(new Error("Online checkout is not configured. Add Stripe test keys to the backend environment."), { status: 503 });
  if (booking.status !== "pending" || booking.paymentStatus !== "pending") {
    throw Object.assign(new Error("This booking is no longer awaiting payment."), { status: 409 });
  }
  const locks = await SeatLock.countDocuments({ bookingId: booking._id, status: "locked", expiresAt: { $gt: new Date() } });
  if (locks !== booking.seats.length) {
    await cancelPendingBooking(booking, "The seat hold expired before checkout.");
    throw Object.assign(new Error("Your seat hold expired. Select the seats again."), { status: 409 });
  }
  let payment = await Payment.findOne({ bookingId: booking._id });
  if (payment?.providerSessionId) {
    const existing = await stripe.checkout.sessions.retrieve(payment.providerSessionId);
    if (existing.status === "open" && existing.url) return { url: existing.url, sessionId: existing.id };
  }
  const checkoutExpiry = new Date(Date.now() + 35 * 60 * 1000);
  await SeatLock.updateMany({ bookingId: booking._id, status: "locked", expiresAt: { $gt: new Date() } }, { $set: { expiresAt: checkoutExpiry } });
  booking.holdExpiresAt = checkoutExpiry;
  await booking.save();
  const expiresAt = Math.floor(checkoutExpiry.getTime() / 1000);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    expires_at: expiresAt,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "inr",
        unit_amount: booking.amountPaise,
        product_data: { name: booking.movie.title + " tickets", description: "Seats " + booking.seats.map((seat) => seat.seatId).join(", ") },
      },
    }],
    success_url: origin + "/checkout/return?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: origin + "/checkout/return?cancelled=1&booking=" + booking._id,
    metadata: { bookingId: String(booking._id), bookingReference: booking.bookingReference },
  }, { idempotencyKey: "imovies-booking-" + booking._id });
  if (!payment) payment = new Payment({ bookingId: booking._id, amountPaise: booking.amountPaise, currency: "INR" });
  payment.providerSessionId = session.id;
  payment.status = "pending";
  await payment.save();
  return { url: session.url, sessionId: session.id };
}

export async function expirePendingBookings() {
  const now = new Date();
  const expired = await Booking.find({
    status: "pending",
    paymentStatus: "pending",
    holdExpiresAt: { $lte: now },
  }).select("_id showId seats");
  for (const booking of expired) {
    const cancelled = await Booking.findOneAndUpdate(
      { _id: booking._id, status: "pending", paymentStatus: "pending", holdExpiresAt: { $lte: now } },
      { $set: { status: "cancelled", paymentStatus: "failed", holdExpiresAt: null, cancellationReason: "Seat hold expired before payment." } },
      { new: true }
    );
    if (!cancelled) continue;
    await SeatLock.deleteMany({ bookingId: booking._id });
    await Payment.updateOne({ bookingId: booking._id, status: "pending" }, { $set: { status: "failed" } });
    publishSeatChanges(booking.showId, booking.seats.map((seat) => ({ seatId: seat.seatId, state: "available" })));
  }
  return expired.length;
}
