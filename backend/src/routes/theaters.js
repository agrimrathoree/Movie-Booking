import { Router } from "express";
import Theater from "../models/Theater.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.get("/", asyncHandler(async (req, res) => {
  const filter = { active: true };
  if (req.query.city) filter.city = String(req.query.city).trim();
  const items = await Theater.find(filter).sort({ city: 1, name: 1 }).lean();
  return res.json({ success: true, items });
}));
export default router;
