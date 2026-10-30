import { Router } from "express";
import mongoose from "mongoose";
import Show from "../models/Show.js";
import { seatAvailability } from "../controllers/bookingController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.get("/", asyncHandler(async (req, res) => {
  const filter = { active: true, startsAt: { $gt: new Date() } };
  if (req.query.movieId && !mongoose.isValidObjectId(String(req.query.movieId))) return res.status(400).json({ success: false, message: "Invalid movie ID." });
  if (req.query.theaterId && !mongoose.isValidObjectId(String(req.query.theaterId))) return res.status(400).json({ success: false, message: "Invalid theater ID." });
  if (req.query.movieId) filter.movieId = req.query.movieId;
  if (req.query.theaterId) filter.theaterId = req.query.theaterId;
  if (req.query.date) {
    const date = new Date(String(req.query.date) + "T00:00:00");
    if (!Number.isNaN(date.getTime())) {
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      filter.startsAt = { $gte: date, $lt: end, $gt: new Date() };
    }
  }
  const items = await Show.find(filter).populate("movieId", "movieName poster duration rating").populate("theaterId", "name city address").sort({ startsAt: 1 }).limit(100).lean();
  return res.json({ success: true, items });
}));
router.get("/:showId", asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.showId)) return res.status(400).json({ success: false, message: "Invalid show ID." });
  const show = await Show.findOne({ _id: req.params.showId, active: true }).populate("movieId").populate("theaterId").lean();
  if (!show) return res.status(404).json({ success: false, message: "Show not found." });
  return res.json({ success: true, show });
}));
router.get("/:showId/seats", asyncHandler(seatAvailability));
export default router;
