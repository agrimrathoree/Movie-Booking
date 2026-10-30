import mongoose from "mongoose";
import Review from "../models/Review.js";
import Movie from "../models/Movie.js";

export async function listMovieReviews(req, res) {
  const movieId = String(req.params.movieId || "");
  if (!mongoose.isValidObjectId(movieId)) return res.status(400).json({ success: false, message: "Invalid movie ID." });
  if (!(await Movie.exists({ _id: movieId, active: { $ne: false } }))) return res.status(404).json({ success: false, message: "Movie not found." });
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const [items, total] = await Promise.all([
    Review.find({ movieId }).populate("userId", "fullName username").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Review.countDocuments({ movieId }),
  ]);
  return res.json({ success: true, items, page, limit, total });
}

export async function createReview(req, res) {
  const movieId = String(req.params.movieId || "");
  const rating = Number(req.body?.rating);
  const comment = String(req.body?.comment || "").trim();
  if (!mongoose.isValidObjectId(movieId)) return res.status(400).json({ success: false, message: "Invalid movie ID." });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 2 || comment.length > 2000) return res.status(400).json({ success: false, message: "Provide a rating from 1 to 5 and a 2–2000 character review." });
  if (!(await Movie.exists({ _id: movieId, active: { $ne: false } }))) return res.status(404).json({ success: false, message: "Movie not found." });
  const review = await Review.create({ movieId, userId: req.user._id, rating, comment });
  return res.status(201).json({ success: true, review });
}

export async function updateReview(req, res) {
  const rating = Number(req.body?.rating);
  const comment = String(req.body?.comment || "").trim();
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid review ID." });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 2 || comment.length > 2000) return res.status(400).json({ success: false, message: "Provide a rating from 1 to 5 and a 2–2000 character review." });
  const filter = { _id: req.params.id };
  if (req.user.role !== "admin") filter.userId = req.user._id;
  const review = await Review.findOneAndUpdate(filter, { rating, comment }, { new: true, runValidators: true });
  if (!review) return res.status(404).json({ success: false, message: "Review not found." });
  return res.json({ success: true, review });
}

export async function deleteReview(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid review ID." });
  const filter = { _id: req.params.id };
  if (req.user.role !== "admin") filter.userId = req.user._id;
  const review = await Review.findOneAndDelete(filter);
  if (!review) return res.status(404).json({ success: false, message: "Review not found." });
  return res.json({ success: true });
}
