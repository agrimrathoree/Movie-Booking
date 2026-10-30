const API_BASE = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(/\/+$/, "");
let csrfToken = "";
export function clearCsrfToken() { csrfToken = ""; }

export async function api(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  let body = options.body;
  if (body && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    if (!csrfToken) {
      const tokenResponse = await fetch(API_BASE + "/auth/csrf", { credentials: "include" });
      const tokenPayload = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok) throw new Error(tokenPayload.message || "Could not start a secure session.");
      csrfToken = tokenPayload.csrfToken;
    }
    headers.set("X-CSRF-Token", csrfToken);
  }
  const response = await fetch(API_BASE + path, { ...options, method, body, headers, credentials: "include" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "The request could not be completed.");
    error.status = response.status;
    throw error;
  }
  return payload;
}
