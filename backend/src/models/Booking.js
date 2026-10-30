import mongoose from "mongoose";

const bookingSeatSchema = new mongoose.Schema(
  {
    seatId: { type: String, required: true, trim: true, uppercase: true },
    type: { type: String, enum: ["standard", "recliner"], required: true },
    price: { type: Number, min: 0, required: true },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingReference: { type: String, required: true, unique: true, sparse: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    showId: { type: mongoose.Schema.Types.ObjectId, ref: "Show", required: true, index: true },
    movie: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "Movie" },
      title: { type: String, default: "" },
      poster: { type: String, default: "" },
      category: { type: String, default: "" },
      durationMins: { type: Number, default: 0 },
      year: { type: Number, default: null },
      rating: { type: Number, default: null },
    },
    showtime: { type: Date, required: true, index: true },
    holdExpiresAt: { type: Date, default: null, index: true },
    auditorium: { type: String, required: true, trim: true },
    theater: { name: { type: String, default: "" }, city: { type: String, default: "" } },
    seats: { type: [bookingSeatSchema], required: true, validate: (seats) => seats.length > 0 },
    basePrice: { type: Number, default: 0 },
    amount: { type: Number, required: true, min: 0 },
    amountPaise: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["pending", "confirmed", "cancelled"], default: "pending", index: true },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending", index: true },
    paymentMethod: { type: String, default: "stripe" },
    paymentIntentId: { type: String, default: "" },
    cancellationReason: { type: String, default: "" },
    cancelledAt: { type: Date, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, strict: false }
);

bookingSchema.index({ showId: 1, status: 1, createdAt: -1 });
export default mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
