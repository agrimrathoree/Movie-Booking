import Stripe from "stripe";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import { env } from "../config/env.js";
import { createCheckout } from "../services/bookingService.js";
import { getStripe, processStripeEvent, completeCheckout, releasePendingBooking } from "../services/paymentService.js";

export async function createOrder(req, res) {
  const bookingId = String(req.body?.bookingId || "");
  if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ success: false, message: "A valid booking ID is required." });
  const booking = await Booking.findOne({ _id: bookingId, userId: req.user._id });
  if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });
  const checkout = await createCheckout(booking, req.get("origin") || env.frontendOrigins[0]);
  return res.json({ success: true, checkout });
}

export async function getPaymentSession(req, res) {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ success: false, message: "Online payments are not configured." });
  const payment = await Payment.findOne({ providerSessionId: String(req.params.sessionId || "") });
  if (!payment) return res.status(404).json({ success: false, message: "Checkout session not found." });
  const booking = await Booking.findOne({ _id: payment.bookingId, userId: req.user._id });
  if (!booking) return res.status(404).json({ success: false, message: "Checkout session not found." });
  const session = await stripe.checkout.sessions.retrieve(payment.providerSessionId);
  if (session.payment_status === "paid") await completeCheckout(session);
  else if (session.status === "expired" && booking.status === "pending") await releasePendingBooking(booking, "Checkout expired.");
  const refreshed = await Booking.findById(booking._id).lean();
  return res.json({ success: true, status: refreshed.paymentStatus, booking: { id: String(refreshed._id), reference: refreshed.bookingReference, status: refreshed.status, paymentStatus: refreshed.paymentStatus } });
}

export async function stripeWebhook(req, res) {
  if (!env.stripeSecretKey || !env.stripeWebhookSecret) return res.status(503).json({ success: false, message: "Stripe webhook is not configured." });
  let event;
  try {
    const stripe = new Stripe(env.stripeSecretKey);
    event = stripe.webhooks.constructEvent(req.body, req.get("stripe-signature"), env.stripeWebhookSecret);
  } catch {
    return res.status(400).json({ success: false, message: "Invalid Stripe webhook signature." });
  }
  await processStripeEvent(event);
  return res.json({ received: true });
}
