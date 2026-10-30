import mongoose from "mongoose";

const personSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    role: { type: String, trim: true, default: "" },
    file: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const slotSchema = new mongoose.Schema(
  {
    date: { type: String, default: "" },
    time: { type: String, default: "" },
    ampm: { type: String, enum: ["AM", "PM"], default: "AM" },
  },
  { _id: false, strict: false }
);

const movieSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["normal", "featured", "releaseSoon", "latestTrailers"],
      default: "normal",
      index: true,
    },
    movieName: { type: String, required: true, trim: true, minlength: 2, maxlength: 200 },
    categories: [{ type: String, trim: true, maxlength: 40 }],
    genres: { type: [{ type: String, trim: true, maxlength: 40 }], default: [], validate: { validator: (genres) => genres.length > 0, message: "At least one genre is required." } },
    releaseDate: { type: Date, default: null, validate: { validator: (value) => value == null || !Number.isNaN(new Date(value).getTime()), message: "Release date must be valid." } },
    language: { type: String, trim: true, default: "Hindi", maxlength: 40 },
    year: { type: Number, min: 1888, max: 2200, default: null },
    poster: { type: String, trim: true, default: "" },
    trailerUrl: { type: String, trim: true, default: "" },
    videoUrl: { type: String, trim: true, default: "" },
    rating: { type: Number, min: 0, max: 10, default: 0 },
    duration: { type: Number, min: 0, default: 0 },
    description: { type: String, trim: true, default: "", minlength: 10, maxlength: 5000 },
    story: { type: String, trim: true, default: "", maxlength: 10000 },
    slots: { type: [slotSchema], default: [] },
    seatPrices: {
      standard: { type: Number, min: 0, default: 250 },
      recliner: { type: Number, min: 0, default: 375 },
    },
    auditorium: { type: String, trim: true, default: "Audi 1" },
    cast: { type: [personSchema], default: [] },
    directors: { type: [personSchema], default: [] },
    producers: { type: [personSchema], default: [] },
    latestTrailer: { type: mongoose.Schema.Types.Mixed, default: null },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, strict: true }
);

movieSchema.pre("validate", function syncMovieGenres(next) {
  if ((!this.genres || this.genres.length === 0) && this.categories?.length) this.genres = this.categories;
  if ((!this.categories || this.categories.length === 0) && this.genres?.length) this.categories = this.genres;
  next();
});

movieSchema.index(
  { movieName: "text", categories: "text", genres: "text", description: "text" },
  { name: "imovies_movie_search_text", default_language: "none", language_override: "searchLanguage" }
);
movieSchema.index({ movieName: 1, active: 1 });

export default mongoose.models.Movie || mongoose.model("Movie", movieSchema);
