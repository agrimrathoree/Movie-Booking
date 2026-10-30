export function notFound(req, res) {
  res.status(404).json({ success: false, message: "The requested resource was not found." });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = error.status || (error.code === 11000 ? 409 : error.name === "ValidationError" || error.name === "CastError" || error instanceof SyntaxError ? 400 : error.type === "entity.too.large" ? 413 : 500);
  if (status >= 500) console.error(JSON.stringify({
    level: "error",
    method: req.method,
    path: req.path,
    message: error.message,
    timestamp: new Date().toISOString(),
  }));
  return res.status(status).json({
    success: false,
    message: status >= 500 ? "An unexpected server error occurred." : error.code === 11000 ? "A record with those details already exists." : error.message,
  });
}
