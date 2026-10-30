import mongoose from "mongoose";
import Theater from "../models/Theater.js";
import Show from "../models/Show.js";
import Movie from "../models/Movie.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";

export async function dashboardStats(req, res) {
  const [movies, theaters, shows, bookings, paid, users, gross] = await Promise.all([
    Movie.countDocuments({ active: true }),
    Theater.countDocuments({ active: true }),
    Show.countDocuments({ active: true, startsAt: { $gt: new Date() } }),
    Booking.countDocuments(),
    Booking.countDocuments({ paymentStatus: "paid" }),
    User.countDocuments({ role: "user" }),
    Booking.aggregate([{ $match: { paymentStatus: "paid" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
  ]);
  return res.json({ success: true, stats: { movies, theaters, upcomingShows: shows, bookings, paidBookings: paid, users, gross: gross[0]?.total || 0 } });
}

export async function listAdminMovies(req, res) {
  const items = await Movie.find().sort({ createdAt: -1 }).limit(300).lean();
  return res.json({ success: true, items });
}

export async function listAdminShows(req, res) {
  const items = await Show.find().populate("movieId", "movieName").populate("theaterId", "name city").sort({ startsAt: -1 }).limit(300).lean();
  return res.json({ success: true, items });
}

export async function listAdminTheaters(req, res) {
  const items = await Theater.find().sort({ city: 1, name: 1 }).lean();
  return res.json({ success: true, items });
}

export async function createTheater(req, res) {
  const name = String(req.body?.name || req.body?.theatreName || "").trim();
  const city = String(req.body?.city || req.body?.location || "").trim();
  if (!name || !city) return res.status(400).json({ success: false, message: "Theater name and city are required." });
  const screenNames = Array.isArray(req.body?.screens) ? req.body.screens : ["Audi 1"];
  const screens = [...new Set(screenNames.map((item) => String(item).trim()).filter(Boolean))].map((screen) => ({ name: screen }));
  const theater = await Theater.create({
    name, theatreName: name, theatreId: req.body?.theatreId ? String(req.body.theatreId).trim() : undefined,
    city, location: String(req.body?.location || req.body?.address || city).trim(), address: String(req.body?.address || "").trim(), screens,
    balconySeatPrice: req.body?.balconySeatPrice, middleSeatPrice: req.body?.middleSeatPrice, lowerSeatPrice: req.body?.lowerSeatPrice,
    balconySeats: req.body?.balconySeats, middleSeats: req.body?.middleSeats, lowerSeats: req.body?.lowerSeats,
  });
  return res.status(201).json({ success: true, theater });
}

export async function updateTheater(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid theater ID." });
  const current = await Theater.findById(req.params.id);
  if (!current) return res.status(404).json({ success: false, message: "Theater not found." });
  const name = String(req.body?.name ?? current.name).trim();
  const city = String(req.body?.city ?? current.city).trim();
  const address = String(req.body?.address ?? current.address).trim();
  if (!name || !city) return res.status(400).json({ success: false, message: "Theater name and city are required." });
  let screens = current.screens;
  if (req.body?.screens !== undefined) {
    if (!Array.isArray(req.body.screens)) return res.status(400).json({ success: false, message: "Screens must be an array." });
    screens = [...new Set(req.body.screens.map((item) => typeof item === "string" ? item.trim() : String(item?.name || "").trim()).filter(Boolean))].map((screen) => ({ name: screen }));
    const inUse = await Show.exists({ theaterId: current._id, active: true, auditorium: { $nin: screens.map((screen) => screen.name) } });
    if (inUse) return res.status(409).json({ success: false, message: "A screen used by an active show cannot be removed." });
  }
  current.name = name;
  current.city = city;
  current.address = address;
  current.screens = screens;
  await current.save();
  return res.json({ success: true, theater: current });
}

export async function archiveTheater(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid theater ID." });
  const hasUpcomingShows = await Show.exists({ theaterId: req.params.id, active: true, startsAt: { $gt: new Date() } });
  if (hasUpcomingShows) return res.status(409).json({ success: false, message: "Archive upcoming shows before archiving this theater." });
  const theater = await Theater.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!theater) return res.status(404).json({ success: false, message: "Theater not found." });
  return res.json({ success: true });
}

export async function createShow(req, res) {
  const { movieId, theaterId, startsAt, auditorium } = req.body || {};
  if (!mongoose.isValidObjectId(movieId) || !mongoose.isValidObjectId(theaterId)) return res.status(400).json({ success: false, message: "Choose a valid movie and theater." });
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime()) || start <= new Date()) return res.status(400).json({ success: false, message: "Choose a future showtime." });
  const [movie, theater] = await Promise.all([Movie.findOne({ _id: movieId, active: true }), Theater.findOne({ _id: theaterId, active: true })]);
  if (!movie || !theater) return res.status(404).json({ success: false, message: "Movie or theater not found." });
  const screen = String(auditorium || theater.screens[0]?.name || "Audi 1").trim();
  if (!theater.screens.some((item) => item.name === screen)) return res.status(400).json({ success: false, message: "Choose a screen configured for this theater." });
  const seatPrices = { standard: Number(req.body?.seatPrices?.standard ?? movie.seatPrices.standard), recliner: Number(req.body?.seatPrices?.recliner ?? movie.seatPrices.recliner) };
  if (Object.values(seatPrices).some((price) => !Number.isFinite(price) || price < 0)) return res.status(400).json({ success: false, message: "Seat prices must be valid non-negative amounts." });
  const show = await Show.create({ movieId, theaterId, startsAt: start, auditorium: screen, seatPrices });
  return res.status(201).json({ success: true, show });
}

export async function archiveShow(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid show ID." });
  const hasBookings = await Booking.exists({ showId: req.params.id, status: { $in: ["pending", "confirmed"] } });
  if (hasBookings) return res.status(409).json({ success: false, message: "This show has active bookings and cannot be archived." });
  const show = await Show.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!show) return res.status(404).json({ success: false, message: "Show not found." });
  return res.json({ success: true });
}

export async function updateShow(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid show ID." });
  const show = await Show.findById(req.params.id);
  if (!show) return res.status(404).json({ success: false, message: "Show not found." });
  if (await Booking.exists({ showId: show._id, status: { $in: ["pending", "confirmed"] } })) {
    return res.status(409).json({ success: false, message: "A show with active bookings cannot be rescheduled or repriced." });
  }
  const movieId = req.body?.movieId ?? show.movieId;
  const theaterId = req.body?.theaterId ?? show.theaterId;
  const startsAt = new Date(req.body?.startsAt ?? show.startsAt);
  if (!mongoose.isValidObjectId(movieId) || !mongoose.isValidObjectId(theaterId) || Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) return res.status(400).json({ success: false, message: "Choose valid movie, theater, and future showtime values." });
  const [movie, theater] = await Promise.all([Movie.findOne({ _id: movieId, active: true }), Theater.findOne({ _id: theaterId, active: true })]);
  if (!movie || !theater) return res.status(404).json({ success: false, message: "Movie or theater not found." });
  const auditorium = String(req.body?.auditorium ?? show.auditorium).trim();
  if (!theater.screens.some((screen) => screen.name === auditorium)) return res.status(400).json({ success: false, message: "Choose a screen configured for this theater." });
  const prices = { standard: Number(req.body?.seatPrices?.standard ?? show.seatPrices.standard), recliner: Number(req.body?.seatPrices?.recliner ?? show.seatPrices.recliner) };
  if (Object.values(prices).some((price) => !Number.isFinite(price) || price < 0)) return res.status(400).json({ success: false, message: "Seat prices must be non-negative amounts." });
  show.movieId = movieId;
  show.theaterId = theaterId;
  show.startsAt = startsAt;
  show.auditorium = auditorium;
  show.seatPrices = prices;
  await show.save();
  return res.json({ success: true, show });
}
