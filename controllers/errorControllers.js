import AppError from "../utils/AppError.js";

/**
 * Send detailed errors during development
 */
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

/**
 * Send clean, user-friendly errors in production
 */
const sendErrorProd = (err, res) => {
  // Operational errors: Send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    // Programming or unknown errors: Don't leak details
    console.error("ERROR 💥", err);
    res.status(500).json({
      status: "error",
      message: "Something went wrong on the server!",
    });
  }
};

/**
 * Global Error Handling Middleware
 */
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  // Convert Multer upload errors into friendly operational errors
  if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      err = new AppError(
        "File is too large. Maximum allowed size is 20MB per file.",
        400,
      );
    } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
      err = new AppError("Too many files. Maximum is 5 files per message.", 400);
    } else {
      err = new AppError(`File upload error: ${err.message}`, 400);
    }
  }

  if (process.env.NODE_ENV === "development") {
    sendErrorDev(err, res);
  } else {
    sendErrorProd(err, res);
  }
};

export default globalErrorHandler;
