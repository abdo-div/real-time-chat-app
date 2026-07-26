import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import AppError from "./utils/AppError.js";
import globalErrorHandler from "./controllers/errorControllers.js";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/authRoutes.js";
// Re-create __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cookieParser());
// Global Middlewares
app.use(cors());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Configure Pug View Engine
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// Test Health Route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "success", message: "Server is healthy!" });
});

// Mount API Routes
app.use("/api/v1/auth", authRoutes);

// Unhandled Route Handler (404)
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handler Middleware
app.use(globalErrorHandler);

export default app;
