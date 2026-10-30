import { Router } from "express";
import { createMovie, deleteMovie, getMovieById, listMovies, updateMovie } from "../controllers/movieController.js";
import { requireAdmin, requireAuth, csrfProtection } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.get("/", asyncHandler(listMovies));
router.get("/:id", asyncHandler(getMovieById));
router.use(csrfProtection);
router.post("/", requireAuth, requireAdmin, asyncHandler(createMovie));
router.patch("/:id", requireAuth, requireAdmin, asyncHandler(updateMovie));
router.delete("/:id", requireAuth, requireAdmin, asyncHandler(deleteMovie));
export default router;
