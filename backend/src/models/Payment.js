import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    provider: { type: String, enum: ["stripe"], default: "stripe" },
    providerSessionId: { type: String, default: "", unique: true, sparse: true, index: true },
    providerPaymentId: { type: String, default: "" },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending", index: true },
    lastEventId: { type: String, default: "" },
    paidAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
