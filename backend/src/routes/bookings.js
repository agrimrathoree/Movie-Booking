import { Router } from "express";
import { cancelBooking, getBooking, lockShowSeats, releaseBooking } from "../controllers/bookingController.js";
import { getMyBookings } from "../controllers/userController.js";
import { requireAuth, csrfProtection } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);
router.post("/lock-seats", csrfProtection, asyncHandler(lockShowSeats));
router.get("/my-bookings", asyncHandler(getMyBookings));
router.get("/:id", asyncHandler(getBooking));
router.delete("/:id/lock", csrfProtection, asyncHandler(releaseBooking));
router.post("/:id/cancel", csrfProtection, asyncHandler(cancelBooking));
export default router;
