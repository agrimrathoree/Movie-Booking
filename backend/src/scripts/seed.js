import bcrypt from "bcryptjs";
import { connectDatabase, ensureDatabaseIndexes } from "../config/database.js";
import Movie from "../models/Movie.js";
import Theater from "../models/Theater.js";
import Show from "../models/Show.js";
import User from "../models/User.js";

const sampleMovies = [
  { movieName: "Fighter", poster: "FM1.png", categories: ["Action", "Drama"], language: "Hindi", year: 2024, rating: 7.8, duration: 140, description: "High-octane aerial action and a tale of duty and brotherhood set among fighter pilots.", seatPrices: { standard: 250, recliner: 375 }, type: "featured" },
  { movieName: "Peddi", poster: "FM2.png", categories: ["Comedy", "Drama"], language: "Hindi", year: 2025, rating: 6.9, duration: 125, description: "A family drama with warm humor, traditions and a wedding plan that changes everything.", seatPrices: { standard: 220, recliner: 330 } },
  { movieName: "Baaghi 4", poster: "FM3.png", categories: ["Action", "Thriller"], language: "Hindi", year: 2025, rating: 7.2, duration: 130, description: "A relentless action thriller about an ex-commando fighting for justice.", seatPrices: { standard: 240, recliner: 360 }, type: "featured" },
  { movieName: "Kantara", poster: "FM4.png", categories: ["Drama", "Action"], language: "Kannada", year: 2022, rating: 8.5, duration: 150, description: "A folk-driven tale of land, tradition and survival.", seatPrices: { standard: 240, recliner: 360 } },
  { movieName: "Param Sundari", poster: "FM5.png", categories: ["Romance", "Comedy"], language: "Hindi", year: 2025, rating: 7, duration: 120, description: "A colorful romantic drama about self-discovery, modern love and cultural celebration.", seatPrices: { standard: 200, recliner: 300 } },
  { movieName: "Maalik", poster: "FM6.png", categories: ["Crime", "Thriller"], language: "Hindi", year: 2025, rating: 7.4, duration: 128, description: "A small-town cop uncovers a deep-rooted conspiracy.", seatPrices: { standard: 210, recliner: 315 } },
];

async function seed() {
  await connectDatabase();
  await ensureDatabaseIndexes();
  let movies = await Movie.find({ active: { $ne: false } }).sort({ createdAt: 1 }).limit(12);
  if (!movies.length) {
    movies = await Movie.insertMany(sampleMovies);
    console.log("Added the sample movie catalog.");
  } else {
    console.log("Kept the existing movie catalog.");
  }

  let theaters = await Theater.find({ active: true }).limit(20);
  if (!theaters.length) {
    theaters = await Theater.insertMany([
      { name: "iMovies Downtown", city: "Lucknow", address: "Hazratganj, Lucknow", screens: [{ name: "Audi 1" }, { name: "Audi 2" }, { name: "Audi 3" }] },
      { name: "iMovies Riverside", city: "Lucknow", address: "Gomti Nagar, Lucknow", screens: [{ name: "Audi 1" }, { name: "Audi 2" }] },
    ]);
    console.log("Added sample theaters.");
  } else {
    console.log("Kept the existing theaters.");
  }

  const existingShows = await Show.countDocuments();
  if (!existingShows) {
    const now = new Date();
    const startDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const slots = [4 * 60 + 30, 9 * 60, 14 * 60];
    const shows = [];
    for (const movie of movies) {
      const theater = theaters[0];
      for (let day = 0; day < 7; day += 1) {
        for (let slot = 0; slot < slots.length; slot += 1) {
          const startsAt = new Date(startDay.getTime() + day * 86400000 + slots[slot] * 60000);
          const screen = theater.screens[slot % theater.screens.length].name;
          shows.push({
            movieId: movie._id,
            theaterId: theater._id,
            startsAt,
            auditorium: screen,
            seatPrices: {
              standard: Number(movie.seatPrices?.standard) || 250,
              recliner: Number(movie.seatPrices?.recliner) || 375,
            },
          });
        }
      }
    }
    await Show.insertMany(shows, { ordered: false });
    console.log("Added future sample showtimes and seat layouts.");
  } else {
    console.log("Kept the existing show schedule.");
  }

  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || "");
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 12) throw new Error("ADMIN_PASSWORD must contain at least 12 characters.");
    if (!(await User.exists({ email: adminEmail }))) {
      const localPart = adminEmail.split("@")[0].toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 30);
      const username = localPart.length >= 3 ? localPart : "movieadmin";
      if (await User.exists({ username })) throw new Error("The admin username already exists; create the administrator through a separate account before seeding.");
      await User.create({
        fullName: process.env.ADMIN_NAME || "Movie Admin",
        username,
        email: adminEmail,
        password: await bcrypt.hash(adminPassword, 12),
        role: "admin",
      });
      console.log("Created the administrator account.");
    } else {
      console.log("Kept the existing account for the configured admin email.");
    }
  } else {
    console.log("ADMIN_EMAIL/ADMIN_PASSWORD not supplied; no admin account was created.");
  }

  await (await import("mongoose")).default.disconnect();
}

seed().catch(async (error) => {
  console.error(error.message);
  const mongoose = await import("mongoose");
  await mongoose.default.disconnect().catch(() => {});
  process.exitCode = 1;
});
