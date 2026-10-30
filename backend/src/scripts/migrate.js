import mongoose from "mongoose";
import { connectDatabase, ensureDatabaseIndexes } from "../config/database.js";

async function migrate() {
  await connectDatabase();
  const db = mongoose.connection.db;
  const users = db.collection("users");
  const allUsers = await users.find({}, { projection: { _id: 1, username: 1, email: 1 } }).toArray();
  const seenUsernames = new Set();
  const seenEmails = new Set();
  let updatedUsers = 0;

  for (const user of allUsers) {
    const email = String(user.email || "").trim().toLowerCase();
    if (email) {
      if (seenEmails.has(email)) throw new Error("Duplicate user email detected. Resolve duplicate email accounts before applying unique indexes; no records were changed.");
      seenEmails.add(email);
    }
    let username = String(user.username || "").trim().toLowerCase();
    if (!username || seenUsernames.has(username) || !/^[a-z0-9_.-]{3,40}$/.test(username)) {
      username = "user_" + String(user._id).slice(-12).toLowerCase();
    }
    if (seenUsernames.has(username)) throw new Error("Unable to produce a unique legacy username. Review user records manually; no records were deleted.");
    seenUsernames.add(username);
    if (username !== user.username) {
      await users.updateOne({ _id: user._id }, { $set: { username } });
      updatedUsers += 1;
    }
  }

  const movies = db.collection("movies");
  const oldMovies = await movies.find({
    $or: [
      { movieName: { $exists: false }, title: { $type: "string" } },
      { categories: { $exists: false }, category: { $exists: true } },
      { language: { $exists: false } },
    ],
  }).toArray();
  let updatedMovies = 0;
  for (const movie of oldMovies) {
    const fields = {};
    if (!movie.movieName && typeof movie.title === "string") fields.movieName = movie.title;
    if (!movie.categories && movie.category) fields.categories = Array.isArray(movie.category) ? movie.category : [String(movie.category)];
    if (!movie.language) fields.language = "Hindi";
    if (Object.keys(fields).length) {
      await movies.updateOne({ _id: movie._id }, { $set: fields });
      updatedMovies += 1;
    }
  }

  await ensureDatabaseIndexes();
  console.log("Migration complete. Updated " + updatedUsers + " user profiles and " + updatedMovies + " movie records; no records were deleted.");
}

migrate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect();
});
