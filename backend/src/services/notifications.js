import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transport;
function getTransport() {
  if (!env.smtp.host || !env.smtp.from) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    });
  }
  return transport;
}

export async function sendBookingNotice(booking, user, subject, message) {
  const mailer = getTransport();
  if (!mailer || !user?.email) return { sent: false, reason: "SMTP is not configured." };
  try {
    await mailer.sendMail({
      from: env.smtp.from,
      to: user.email,
      subject,
      text: message,
    });
    return { sent: true };
  } catch (error) {
    console.error(JSON.stringify({ level: "warn", event: "notification_failed", bookingId: String(booking._id), message: error.message }));
    return { sent: false, reason: "Email delivery failed." };
  }
}
