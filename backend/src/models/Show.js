import mongoose from "mongoose";

const showSchema = new mongoose.Schema(
  {
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie", required: true, index: true },
    theaterId: { type: mongoose.Schema.Types.ObjectId, ref: "Theater", required: true, index: true },
    startsAt: { type: Date, required: true, index: true },
    auditorium: { type: String, trim: true, required: true, maxlength: 80 },
    seatLayout: {
      type: [{ row: { type: String, required: true }, count: { type: Number, min: 1, max: 30, required: true }, type: { type: String, enum: ["standard", "recliner"], required: true } }],
      default: () => [
        { row: "A", count: 8, type: "standard" },
        { row: "B", count: 8, type: "standard" },
        { row: "C", count: 8, type: "standard" },
        { row: "D", count: 8, type: "recliner" },
        { row: "E", count: 8, type: "recliner" },
      ],
    },
    seatPrices: {
      standard: { type: Number, min: 0, required: true },
      recliner: { type: Number, min: 0, required: true },
    },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

showSchema.index({ movieId: 1, theaterId: 1, startsAt: 1 }, { unique: true });
export default mongoose.models.Show || mongoose.model("Show", showSchema);
