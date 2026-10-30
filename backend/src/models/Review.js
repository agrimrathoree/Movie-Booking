import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema({
  movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie", required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true, trim: true, minlength: 2, maxlength: 2000 },
}, { timestamps: true });

reviewSchema.index({ movieId: 1, userId: 1 }, { unique: true });
reviewSchema.index({ movieId: 1, createdAt: -1 });

export default mongoose.models.Review || mongoose.model("Review", reviewSchema);
