import { Router } from "express";
import { addFavorite, getFavorites, getMyBookings, getProfile, removeFavorite, updateProfile } from "../controllers/userController.js";
import { requireAuth, csrfProtection } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);
router.get("/me", asyncHandler(getProfile));
router.patch("/me", csrfProtection, asyncHandler(updateProfile));
router.get("/me/favorites", asyncHandler(getFavorites));
router.put("/me/favorites/:movieId", csrfProtection, asyncHandler(addFavorite));
router.delete("/me/favorites/:movieId", csrfProtection, asyncHandler(removeFavorite));
router.get("/me/bookings", asyncHandler(getMyBookings));
export default router;
