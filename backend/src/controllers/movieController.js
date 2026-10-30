import mongoose from "mongoose";
import Movie from "../models/Movie.js";
import Show from "../models/Show.js";

function movieInput(body = {}, { requireReleaseDate = false } = {}) {
  const movieName = String(body.movieName || body.title || "").trim();
  if (movieName.length < 2 || movieName.length > 200) throw Object.assign(new Error("Movie title must be 2–200 characters."), { status: 400 });
  const categories = Array.isArray(body.genres || body.categories) ? (body.genres || body.categories) : String(body.genres || body.categories || body.category || "").split(",");
  const normalizedCategories = [...new Set(categories.map((value) => String(value).trim()).filter(Boolean))];
  if (!normalizedCategories.length) throw Object.assign(new Error("At least one movie genre is required."), { status: 400 });
  const standard = Number(body.seatPrices?.standard ?? body.standardPrice ?? 250);
  const recliner = Number(body.seatPrices?.recliner ?? body.reclinerPrice ?? Math.round(standard * 1.5));
  const description = String(body.description || body.story || "").trim();
  const releaseDate = body.releaseDate ? new Date(body.releaseDate) : undefined;
  if (requireReleaseDate && !releaseDate) throw Object.assign(new Error("Release date is required."), { status: 400 });
  if (description.length < 10) throw Object.assign(new Error("Movie description must contain at least 10 characters."), { status: 400 });
  if (releaseDate && Number.isNaN(releaseDate.getTime())) throw Object.assign(new Error("Release date must be valid."), { status: 400 });
  if (!Number.isFinite(standard) || standard < 0 || !Number.isFinite(recliner) || recliner < 0) throw Object.assign(new Error("Ticket prices must be valid non-negative amounts."), { status: 400 });
  return {
    movieName,
    categories: normalizedCategories,
    genres: normalizedCategories,
    releaseDate,
    language: String(body.language || "Hindi").trim(),
    year: body.year ? Number(body.year) : null,
    poster: String(body.poster || "").trim(),
    trailerUrl: String(body.trailerUrl || "").trim(),
    rating: Number(body.rating) || 0,
    duration: Number(body.duration) || 0,
    description,
    story: String(body.story || body.description || "").trim(),
    type: ["normal", "featured", "releaseSoon", "latestTrailers"].includes(body.type) ? body.type : "normal",
    seatPrices: { standard, recliner },
  };
}

function escapeRegex(value) {
  return value.replaceAll("\\", "\\\\").replaceAll(".", "\\.").replaceAll("*", "\\*").replaceAll("+", "\\+").replaceAll("?", "\\?").replaceAll("^", "\\^").replaceAll("$", "\\$").replaceAll("{", "\\{").replaceAll("}", "\\}").replaceAll("(", "\\(").replaceAll(")", "\\)").replaceAll("|", "\\|").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

export async function listMovies(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(60, Math.max(1, Number.parseInt(req.query.limit, 10) || 24));
  const filter = { active: { $ne: false } };
  if (req.query.genre) filter.categories = { $in: [String(req.query.genre).trim()] };
  if (req.query.category) filter.categories = { $in: [String(req.query.category).trim()] };
  if (req.query.language) filter.language = new RegExp("^" + escapeRegex(String(req.query.language).trim()) + "$", "i");
  if (req.query.type && ["normal", "featured", "releaseSoon", "latestTrailers"].includes(req.query.type)) filter.type = req.query.type;
  const search = String(req.query.search || req.query.q || "").trim().slice(0, 100);
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ movieName: pattern }, { categories: pattern }, { description: pattern }, { language: pattern }];
  }
  const [items, total] = await Promise.all([
    Movie.find(filter).sort({ type: 1, movieName: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    Movie.countDocuments(filter),
  ]);
  return res.json({ success: true, items, page, limit, total });
}

export async function getMovieById(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid movie ID." });
  const movie = await Movie.findOne({ _id: req.params.id, active: { $ne: false } }).lean();
  if (!movie) return res.status(404).json({ success: false, message: "Movie not found." });
  return res.json({ success: true, movie });
}

export async function createMovie(req, res) {
  const movie = await Movie.create(movieInput(req.body, { requireReleaseDate: true }));
  return res.status(201).json({ success: true, movie });
}

export async function updateMovie(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid movie ID." });
  const movie = await Movie.findByIdAndUpdate(req.params.id, movieInput(req.body), { new: true, runValidators: true });
  if (!movie) return res.status(404).json({ success: false, message: "Movie not found." });
  return res.json({ success: true, movie });
}

export async function deleteMovie(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid movie ID." });
  const activeShows = await Show.countDocuments({ movieId: req.params.id, startsAt: { $gt: new Date() }, active: true });
  if (activeShows) return res.status(409).json({ success: false, message: "Remove or reschedule future shows before archiving this movie." });
  const movie = await Movie.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!movie) return res.status(404).json({ success: false, message: "Movie not found." });
  return res.json({ success: true });
}
