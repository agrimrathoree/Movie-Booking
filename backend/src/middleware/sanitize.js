function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== "object") return value;
  const safe = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.startsWith("$") || key.includes(".") || ["__proto__", "constructor", "prototype"].includes(key)) continue;
    safe[key] = clean(item);
  }
  return safe;
}

export function sanitizeBody(req, res, next) {
  if (Buffer.isBuffer(req.body)) return next();
  if (req.body && typeof req.body === "object") req.body = clean(req.body);
  return next();
}

export function restrictOrigin(allowedOrigins) {
  return (req, res, next) => {
    const origin = req.get("origin");
    if (origin && !allowedOrigins.includes(origin)) return res.status(403).json({ success: false, message: "This origin is not allowed." });
    return next();
  };
}
