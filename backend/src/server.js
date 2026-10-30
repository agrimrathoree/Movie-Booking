import http from "node:http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import app from "./app.js";
import { connectDatabase, ensureDatabaseIndexes } from "./config/database.js";
import { env, validateEnvironment } from "./config/env.js";
import { verifySessionToken } from "./controllers/authController.js";
import Show from "./models/Show.js";
import { setSocketServer } from "./services/socket.js";
import { expirePendingBookings } from "./services/bookingService.js";

validateEnvironment();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: env.frontendOrigins, credentials: true },
  transports: ["websocket", "polling"],
});
setSocketServer(io);

io.use(async (socket, next) => {
  try {
    const cookieHeader = socket.handshake.headers.cookie || "";
    const sessionCookie = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith("imovies_session="));
    const cookieToken = sessionCookie ? decodeURIComponent(sessionCookie.slice("imovies_session=".length)) : "";
    const authToken = socket.handshake.auth?.accessToken;
    const token = cookieToken || authToken;
    if (!token) return next(new Error("Authentication required."));
    await verifySessionToken(token);
    return next();
  } catch {
    return next(new Error("Invalid session."));
  }
});

io.on("connection", (socket) => {
  socket.on("show:join", async (showId, acknowledge) => {
    try {
      if (!mongoose.isValidObjectId(showId) || !(await Show.exists({ _id: showId, active: true }))) {
        if (typeof acknowledge === "function") acknowledge({ success: false, message: "Show not found." });
        return;
      }
      await socket.join("show:" + String(showId));
      if (typeof acknowledge === "function") acknowledge({ success: true });
    } catch {
      if (typeof acknowledge === "function") acknowledge({ success: false, message: "Unable to join this show." });
    }
  });
  socket.on("show:leave", (showId) => socket.leave("show:" + String(showId)));
});

try {
  await connectDatabase();
  await ensureDatabaseIndexes();
  const cleanupTimer = setInterval(() => {
    expirePendingBookings().catch((error) => console.error(JSON.stringify({ level: "error", event: "seat_hold_cleanup_failed", message: error.message })));
  }, 30000);
  cleanupTimer.unref();
  expirePendingBookings().catch((error) => console.error(JSON.stringify({ level: "error", event: "seat_hold_cleanup_failed", message: error.message })));
  server.listen(env.port, () => {
    console.log(JSON.stringify({ level: "info", message: "iMovies API listening", port: env.port, environment: env.nodeEnv }));
  });
} catch (error) {
  console.error(JSON.stringify({ level: "error", message: "Database connection failed", error: error.message }));
  process.exitCode = 1;
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", event: "shutdown", signal }));
  io.close();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => {
    shutdown(signal).catch((error) => {
      console.error(JSON.stringify({ level: "error", event: "shutdown_failed", message: error.message }));
      process.exitCode = 1;
    });
  });
}

