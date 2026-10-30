import mongoose from "mongoose";

const paymentEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.models.PaymentEvent || mongoose.model("PaymentEvent", paymentEventSchema);
