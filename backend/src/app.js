import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { restrictOrigin, sanitizeBody } from "./middleware/sanitize.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import movieRoutes from "./routes/movies.js";
import theaterRoutes from "./routes/theaters.js";
import showRoutes from "./routes/shows.js";
import bookingRoutes from "./routes/bookings.js";
import paymentRoutes from "./routes/payments.js";
import adminRoutes from "./routes/admin.js";
import reviewRoutes from "./routes/reviews.js";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", env.nodeEnv === "production" ? 1 : false);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
}));
app.use(restrictOrigin(env.frontendOrigins));
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.frontendOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-CSRF-Token", "Authorization"],
}));
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));
app.use(cookieParser());
app.use("/uploads", express.static(fileURLToPath(new URL("../uploads/", import.meta.url)), { fallthrough: true, maxAge: "1d" }));
app.use("/api/payments/webhook", express.raw({ type: "application/json", limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(sanitizeBody);
morgan.token("safe-url", (req) => req.originalUrl.replace(/\/sessions\/[^/?]+/g, "/sessions/[redacted]"));
app.use(morgan(":method :safe-url :status :response-time ms"));

app.get("/api/health", (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  return res.status(connected ? 200 : 503).json({
    success: connected,
    status: connected ? "ready" : "database_disconnected",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/movies", movieRoutes);
app.use("/api/theaters", theaterRoutes);
app.use("/api/shows", showRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/reviews", reviewRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
