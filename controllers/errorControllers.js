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

  if (process.env.NODE_ENV === "development") {
    sendErrorDev(err, res);
  } else {
    sendErrorProd(err, res);
  }
};

export default globalErrorHandler;
