import { Router } from "express";
import { createReview, deleteReview, listMovieReviews, updateReview } from "../controllers/reviewController.js";
import { requireAuth, csrfProtection } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.get("/movie/:movieId", asyncHandler(listMovieReviews));
router.post("/movie/:movieId", requireAuth, csrfProtection, asyncHandler(createReview));
router.patch("/:id", requireAuth, csrfProtection, asyncHandler(updateReview));
router.delete("/:id", requireAuth, csrfProtection, asyncHandler(deleteReview));
export default router;
