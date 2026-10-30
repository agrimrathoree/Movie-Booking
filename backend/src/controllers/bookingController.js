import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import SeatLock from "../models/SeatLock.js";
import { env } from "../config/env.js";
import { lockSeats, cancelConfirmedBooking, cancelPendingBooking, findOwnedBooking } from "../services/bookingService.js";

export async function lockShowSeats(req, res) {
  const result = await lockSeats({ user: req.user, showId: req.body?.showId, requestedSeats: req.body?.seatIds });
  return res.status(201).json({
    success: true,
    booking: { id: String(result.booking._id), reference: result.booking.bookingReference, status: result.booking.status, amount: result.total, currency: "INR", expiresAt: result.expiresAt, seats: result.seats },
    holdId: result.holdId,
  });
}

export async function releaseBooking(req, res) {
  const booking = await findOwnedBooking(req.user._id, req.params.id);
  if (booking.status === "pending") await cancelPendingBooking(booking);
  return res.json({ success: true });
}

export async function listBookings(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
  const filter = {};
  if (req.query.status && ["pending", "confirmed", "cancelled"].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.paymentStatus && ["pending", "paid", "failed", "refunded"].includes(req.query.paymentStatus)) filter.paymentStatus = req.query.paymentStatus;
  const [items, total] = await Promise.all([
    Booking.find(filter).populate("userId", "fullName email").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Booking.countDocuments(filter),
  ]);
  return res.json({ success: true, items, page, limit, total });
}

export async function getBooking(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid booking ID." });
  const booking = await Booking.findOne({ _id: req.params.id, userId: req.user._id }).lean();
  if (!booking) return res.status(404).json({ success: false, message: "Booking not found." });
  return res.json({ success: true, booking });
}

export async function cancelBooking(req, res) {
  const booking = await findOwnedBooking(req.user._id, req.params.id);
  if (booking.status === "pending") {
    await cancelPendingBooking(booking, "Cancelled by customer.");
    return res.json({ success: true, booking });
  }
  if (booking.status === "cancelled") return res.json({ success: true, booking });
  if (booking.paymentStatus !== "paid") return res.status(409).json({ success: false, message: "This booking cannot be cancelled." });
  const cutoff = env.cancellationCutoffHours * 60 * 60 * 1000;
  if (booking.showtime.getTime() - Date.now() <= cutoff) return res.status(409).json({ success: false, message: "Bookings can be cancelled only before the cancellation cutoff." });
  await cancelConfirmedBooking(booking);
  return res.json({ success: true, booking });
}

export async function seatAvailability(req, res) {
  if (!mongoose.isValidObjectId(req.params.showId)) return res.status(400).json({ success: false, message: "Invalid show ID." });
  const show = await Show.findOne({ _id: req.params.showId, active: true })
    .populate("movieId", "movieName poster seatPrices duration")
    .populate("theaterId", "name city address")
    .lean();
  if (!show) return res.status(404).json({ success: false, message: "Show not found." });
  const locks = await SeatLock.find({
    showId: show._id,
    $or: [{ status: "booked" }, { status: "locked", expiresAt: { $gt: new Date() } }],
  }).select("seatId status expiresAt").lean();
  const occupied = new Map(locks.map((lock) => [lock.seatId, lock]));
  const seats = [];
  for (const row of show.seatLayout) {
    for (let number = 1; number <= row.count; number += 1) {
      const seatId = row.row + number;
      const lock = occupied.get(seatId);
      seats.push({ seatId, type: row.type, price: show.seatPrices[row.type], state: lock?.status === "booked" ? "booked" : lock ? "locked" : "available", expiresAt: lock?.status === "locked" ? lock.expiresAt : null });
    }
  }
  return res.json({
    success: true,
    show: {
      id: String(show._id),
      startsAt: show.startsAt,
      auditorium: show.auditorium,
      movie: show.movieId,
      theater: show.theaterId,
    },
    seats,
  });
}
