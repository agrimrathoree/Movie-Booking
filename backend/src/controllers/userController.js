import mongoose from "mongoose";
import User from "../models/User.js";
import Movie from "../models/Movie.js";
import Booking from "../models/Booking.js";

function publicProfile(user) {
  return { id: String(user._id), fullName: user.fullName, username: user.username, email: user.email, phone: user.phone || "", birthDate: user.birthDate || null, role: user.role };
}

export async function getProfile(req, res) {
  return res.json({ success: true, user: publicProfile(req.user) });
}

export async function updateProfile(req, res) {
  const fullName = String(req.body?.fullName || "").trim();
  const phone = String(req.body?.phone || "").replace(/\D/g, "");
  if (fullName.length < 2 || fullName.length > 100) return res.status(400).json({ success: false, message: "Enter your name." });
  if (phone && (phone.length < 10 || phone.length > 15)) return res.status(400).json({ success: false, message: "Enter a valid phone number." });
  const birthDate = req.body?.birthDate ? new Date(req.body.birthDate) : null;
  if (req.body?.birthDate && (Number.isNaN(birthDate.getTime()) || birthDate >= new Date())) return res.status(400).json({ success: false, message: "Enter a valid birth date." });
  const user = await User.findByIdAndUpdate(req.user._id, { fullName, phone, birthDate }, { new: true }).select("_id fullName username email phone birthDate role");
  return res.json({ success: true, user: publicProfile(user) });
}

export async function getFavorites(req, res) {
  const user = await User.findById(req.user._id).populate({ path: "favorites", match: { active: { $ne: false } } });
  return res.json({ success: true, items: user.favorites.filter(Boolean) });
}

export async function addFavorite(req, res) {
  const movieId = String(req.params.movieId);
  if (!mongoose.isValidObjectId(movieId)) return res.status(400).json({ success: false, message: "Invalid movie ID." });
  if (!(await Movie.exists({ _id: movieId, active: { $ne: false } }))) return res.status(404).json({ success: false, message: "Movie not found." });
  await User.updateOne({ _id: req.user._id }, { $addToSet: { favorites: movieId } });
  return res.json({ success: true });
}

export async function removeFavorite(req, res) {
  const movieId = String(req.params.movieId);
  if (!mongoose.isValidObjectId(movieId)) return res.status(400).json({ success: false, message: "Invalid movie ID." });
  await User.updateOne({ _id: req.user._id }, { $pull: { favorites: movieId } });
  return res.json({ success: true });
}

export async function getMyBookings(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const filter = { userId: req.user._id };
  const [items, total] = await Promise.all([
    Booking.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Booking.countDocuments(filter),
  ]);
  return res.json({ success: true, items, page, limit, total });
}
