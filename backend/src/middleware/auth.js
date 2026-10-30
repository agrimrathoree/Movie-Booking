import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { env } from "../config/env.js";

export const AUTH_COOKIE = "imovies_session";
export const CSRF_COOKIE = "imovies_csrf";

export function issueSession(user, res) {
  const token = jwt.sign(
    { sub: String(user._id), version: user.tokenVersion || 0 },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSession(res) {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: "/",
  });
}

export async function requireAuth(req, res, next) {
  try {
    const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = bearer || req.cookies?.[AUTH_COOKIE];
    if (!token) return res.status(401).json({ success: false, message: "Sign in to continue." });
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.sub).select("_id fullName username email phone birthDate role tokenVersion");
    if (!user || user.tokenVersion !== payload.version) {
      return res.status(401).json({ success: false, message: "Your session has expired. Sign in again." });
    }
    req.user = user;
    req.authenticatedWithBearer = Boolean(bearer);
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Your session is invalid or expired." });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ success: false, message: "Administrator access is required." });
  }
  return next();
}

export function csrfProtection(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.path === "/webhook") return next();
  if (req.headers.authorization?.startsWith("Bearer ")) return next();
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get("x-csrf-token");
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ success: false, message: "CSRF token is missing or invalid. Refresh and try again." });
  }
  return next();
}
