import FM1 from "./assets/FM1.png";
import FM2 from "./assets/FM2.png";
import FM3 from "./assets/FM3.png";
import FM4 from "./assets/FM4.png";
import FM5 from "./assets/FM5.png";
import FM6 from "./assets/FM6.png";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(/\/+$/, "");
let csrfToken = "";

async function fetchCsrfToken() {
  const response = await fetch(API_BASE + "/auth/csrf", { credentials: "include" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.csrfToken) throw new Error(payload.message || "Could not start a secure session.");
  csrfToken = payload.csrfToken;
  return csrfToken;
}

export function clearCsrfToken() {
  csrfToken = "";
}

export async function api(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  let body = options.body;
  if (body && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !headers.has("Authorization")) {
    headers.set("X-CSRF-Token", csrfToken || await fetchCsrfToken());
  }
  const response = await fetch(API_BASE + path, { ...options, method, body, headers, credentials: "include" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "The request could not be completed.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function imageFor(movie) {
  const poster = String(movie?.poster || "");
  if (/^https?:\/\//i.test(poster) || poster.startsWith("/")) return poster;
  if (poster.startsWith("uploads/")) {
    return API_BASE.replace(/\/api\/?$/, "") + "/" + poster.split("/").map(encodeURIComponent).join("/");
  }
  const key = poster.toLowerCase().replace(/\.(png|jpe?g|webp)$/i, "");
  const localPosters = { fm1: FM1, fm2: FM2, fm3: FM3, fm4: FM4, fm5: FM5, fm6: FM6 };
  return localPosters[key] || FM1;
}

export const socketUrl = (import.meta.env.VITE_SOCKET_URL || API_BASE.replace(/\/api\/?$/, ""));
