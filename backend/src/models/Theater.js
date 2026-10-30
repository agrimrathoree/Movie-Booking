import mongoose from "mongoose";

const theaterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    theatreName: { type: String, trim: true, maxlength: 120, default: "" },
    theatreId: { type: String, trim: true, maxlength: 80, default: undefined },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    location: { type: String, trim: true, maxlength: 300, default: "" },
    address: { type: String, trim: true, default: "", maxlength: 300 },
    screens: [{ name: { type: String, trim: true, required: true }, active: { type: Boolean, default: true } }],
    // Legacy pricing/layout fields remain optional; live occupancy is stored per show in SeatLock.
    balconySeatPrice: { type: Number, min: 0, default: undefined },
    middleSeatPrice: { type: Number, min: 0, default: undefined },
    lowerSeatPrice: { type: Number, min: 0, default: undefined },
    balconySeats: { type: mongoose.Schema.Types.Mixed, default: undefined },
    middleSeats: { type: mongoose.Schema.Types.Mixed, default: undefined },
    lowerSeats: { type: mongoose.Schema.Types.Mixed, default: undefined },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

theaterSchema.pre("validate", function syncLegacyTheaterNames(next) {
  if (!this.theatreName) this.theatreName = this.name;
  if (!this.name && this.theatreName) this.name = this.theatreName;
  if (!this.location) this.location = this.address || this.city;
  next();
});

theaterSchema.index({ name: 1, city: 1 }, { unique: true });
theaterSchema.index({ theatreId: 1 }, { unique: true, sparse: true });
export default mongoose.models.Theater || mongoose.model("Theater", theaterSchema);
