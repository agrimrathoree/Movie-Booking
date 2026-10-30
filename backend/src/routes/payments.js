import { Router } from "express";
import { createOrder, getPaymentSession, stripeWebhook } from "../controllers/paymentController.js";
import { requireAuth, csrfProtection } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.post("/webhook", asyncHandler(stripeWebhook));
router.use(requireAuth);
router.post("/create-order", csrfProtection, asyncHandler(createOrder));
router.get("/sessions/:sessionId", asyncHandler(getPaymentSession));
export default router;
