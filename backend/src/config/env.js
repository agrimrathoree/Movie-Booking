import dotenv from "dotenv";

dotenv.config();

const origins = (process.env.FRONTEND_ORIGINS || "http://localhost:5173,http://localhost:5174")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || "",
  frontendOrigins: origins,
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "8h",
  cookieSameSite: (process.env.COOKIE_SAME_SITE || "lax").toLowerCase(),
  cookieSecure: process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
  seatLockMinutes: Math.max(1, Number(process.env.SEAT_LOCK_MINUTES) || 10),
  cancellationCutoffHours: Math.max(0, Number(process.env.CANCELLATION_CUTOFF_HOURS) || 2),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    password: process.env.SMTP_PASSWORD || "",
    from: process.env.SMTP_FROM || "",
  },
};

export function validateEnvironment() {
  if (!env.mongoUri) throw new Error("MONGODB_URI must be configured in backend/.env.");
  if (env.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }
  if (env.cookieSameSite === "none" && !env.cookieSecure) {
    throw new Error("COOKIE_SECURE=true is required when COOKIE_SAME_SITE=none.");
  }
  if (!["lax", "strict", "none"].includes(env.cookieSameSite)) {
    throw new Error("COOKIE_SAME_SITE must be lax, strict, or none.");
  }
}
