import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    username: { type: String, required: true, trim: true, lowercase: true, maxlength: 40 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, default: "", maxlength: 20 },
    birthDate: { type: Date, default: null },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ["user", "admin"], default: "user", index: true },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: "Movie" }],
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ username: 1 }, { unique: true, sparse: true });

export default mongoose.models.User || mongoose.model("User", userSchema);
