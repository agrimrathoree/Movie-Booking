import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { env } from "../config/env.js";
import { CSRF_COOKIE, clearSession, issueSession } from "../middleware/auth.js";

function publicUser(user) {
  return { id: String(user._id), fullName: user.fullName, username: user.username, email: user.email, phone: user.phone || "", birthDate: user.birthDate || null, role: user.role };
}

export function csrfToken(req, res) {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE, token, { httpOnly: false, secure: env.cookieSecure, sameSite: env.cookieSameSite, maxAge: 8 * 60 * 60 * 1000, path: "/" });
  return res.json({ success: true, csrfToken: token });
}

export async function register(req, res) {
  const { fullName, username, email, password, phone, birthDate } = req.body || {};
  const cleanName = String(fullName || "").trim();
  const cleanUsername = String(username || "").trim().toLowerCase();
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (cleanName.length < 2 || cleanName.length > 100) return res.status(400).json({ success: false, message: "Enter your full name." });
  if (!/^[a-z0-9_.-]{3,40}$/.test(cleanUsername)) return res.status(400).json({ success: false, message: "Username must be 3–40 letters, numbers, dots, dashes, or underscores." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ success: false, message: "Enter a valid email address." });
  if (typeof password !== "string" || password.length < 8 || password.length > 128) return res.status(400).json({ success: false, message: "Password must be 8–128 characters." });
  const phoneDigits = String(phone || "").replace(/\D/g, "");
  if (phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 15)) return res.status(400).json({ success: false, message: "Enter a valid phone number." });
  const parsedBirth = birthDate ? new Date(birthDate) : null;
  if (birthDate && (Number.isNaN(parsedBirth.getTime()) || parsedBirth >= new Date())) return res.status(400).json({ success: false, message: "Enter a valid birth date." });
  try {
    const user = await User.create({ fullName: cleanName, username: cleanUsername, email: cleanEmail, password: await bcrypt.hash(password, 12), phone: phoneDigits, birthDate: parsedBirth });
    issueSession(user, res);
    return res.status(201).json({ success: true, user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "That email or username is already registered." });
    throw error;
  }
}

export async function login(req, res) {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required." });
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ success: false, message: "Email or password is incorrect." });
  issueSession(user, res);
  return res.json({ success: true, user: publicUser(user) });
}

export async function currentUser(req, res) {
  return res.json({ success: true, user: publicUser(req.user) });
}

export async function logout(req, res) {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  clearSession(res);
  res.clearCookie(CSRF_COOKIE, { secure: env.cookieSecure, sameSite: env.cookieSameSite, path: "/" });
  return res.json({ success: true });
}

export async function verifySessionToken(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  const user = await User.findById(payload.sub).select("_id role tokenVersion");
  if (!user || user.tokenVersion !== payload.version) throw new Error("Unauthorized socket connection.");
  return user;
}
