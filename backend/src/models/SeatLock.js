import mongoose from "mongoose";

const seatLockSchema = new mongoose.Schema(
  {
    showId: { type: mongoose.Schema.Types.ObjectId, ref: "Show", required: true },
    seatId: { type: String, required: true, trim: true, uppercase: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    holdId: { type: String, required: true, index: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null, index: true },
    status: { type: String, enum: ["locked", "booked"], default: "locked", index: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

seatLockSchema.index({ showId: 1, seatId: 1 }, { unique: true });
seatLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.models.SeatLock || mongoose.model("SeatLock", seatLockSchema);
