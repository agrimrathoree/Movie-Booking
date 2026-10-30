import { Router } from "express";
import rateLimit from "express-rate-limit";
import { currentUser, csrfToken, login, logout, register } from "../controllers/authController.js";
import { requireAuth, csrfProtection } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many sign-in attempts. Try again later." } });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many account attempts. Try again later." } });

router.get("/csrf", csrfToken);
router.use(csrfProtection);
router.post("/register", registerLimiter, asyncHandler(register));
router.post("/login", loginLimiter, asyncHandler(login));
router.get("/me", requireAuth, asyncHandler(currentUser));
router.post("/logout", requireAuth, asyncHandler(logout));
export default router;
