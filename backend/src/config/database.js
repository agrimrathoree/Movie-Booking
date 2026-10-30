import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  mongoose.set("strictQuery", true);
  mongoose.set("autoIndex", false);
  mongoose.connection.on("disconnected", () => console.warn(JSON.stringify({ level: "warn", event: "mongodb_disconnected" })));
  mongoose.connection.on("error", (error) => console.error(JSON.stringify({ level: "error", event: "mongodb_connection_error", message: error.message })));
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10000 });
  console.log(JSON.stringify({ level: "info", event: "mongodb_connected", database: mongoose.connection.name }));
  return mongoose.connection;
}

export async function ensureDatabaseIndexes() {
  const models = await Promise.all([
    import("../models/User.js"),
    import("../models/Movie.js"),
    import("../models/Theater.js"),
    import("../models/Show.js"),
    import("../models/SeatLock.js"),
    import("../models/Booking.js"),
    import("../models/Payment.js"),
    import("../models/PaymentEvent.js"),
    import("../models/Review.js"),
  ]);
  const movieModel = models.find((module) => module.default.modelName === "Movie").default;
  const currentIndexes = await movieModel.collection.indexes();
  const oldMovieTextIndexNames = new Set([
    "movieName_text_categories_text_description_text",
    "movieName_text_categories_text_genres_text_description_text",
  ]);
  const oldMovieTextIndex = currentIndexes.find((index) => oldMovieTextIndexNames.has(index.name));
  if (oldMovieTextIndex) await movieModel.collection.dropIndex(oldMovieTextIndex.name);
  await Promise.all(models.map((module) => module.default.createIndexes()));
}
