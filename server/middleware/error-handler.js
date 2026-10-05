function notFoundHandler(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.status = 404;
  next(error);
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let status = error.status || 500;
  let message = status >= 500 ? "Internal server error." : error.message;
  let code = error.code;

  if (error.name === "ValidationError") {
    status = 400;
    message = error.message;
    code = "VALIDATION_ERROR";
  } else if (error.name === "CastError") {
    status = 400;
    message = "Invalid record identifier.";
    code = "INVALID_ID";
  } else if (error.code === 11000) {
    status = 409;
    message = "A record with that unique value already exists.";
    code = "DUPLICATE_VALUE";
  } else if (error.type === "entity.parse.failed") {
    status = 400;
    message = "Request body must contain valid JSON.";
    code = "INVALID_JSON";
  } else if (error.type === "entity.too.large") {
    status = 413;
    message = "Request body is too large.";
    code = "REQUEST_TOO_LARGE";
  } else if (error.code === "LIMIT_FILE_SIZE") {
    status = 413;
    message = "Uploaded file exceeds the allowed size.";
    code = "FILE_TOO_LARGE";
  }

  if (status >= 500) console.error(error);
  res.status(status).json({ error: message, ...(code ? { code } : {}) });
}

module.exports = { notFoundHandler, errorHandler };