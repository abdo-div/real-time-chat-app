import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import AppError from "./utils/AppError.js";
import globalErrorHandler from "./controllers/errorControllers.js";
import cookieParser from "cookie-parser";
import userRoutes from "./routes/userRoutes.js";
import roomRoutes from "./routes/roomRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import workspaceRoutes from "./routes/workspaceRoutes.js";
import viewRoutes from "./routes/viewRoutes.js";
import { googleOAuthCallback } from "./controllers/authController.js";

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

// Helper exposed to all Pug templates: turns a Date into relative "last seen" text
app.locals.formatLastSeen = (dateStr) => {
  if (!dateStr) return "Offline";
  const diffMins = Math.floor((new Date() - new Date(dateStr)) / 60000);
  if (diffMins < 1) return "Last seen just now";
  if (diffMins < 60) return `Last seen ${diffMins}m ago`;
  if (diffMins < 1440) return `Last seen ${Math.floor(diffMins / 60)}h ago`;
  return `Last seen ${new Date(dateStr).toLocaleDateString()}`;
};

// Expose Google Client ID to all Pug templates
app.locals.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";

// Test Health Route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "success", message: "Server is healthy!" });
});

// 1. MOUNT PUG VIEW ROUTES
app.use("/", viewRoutes);

// 2. MOUNT REST API ROUTES
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/rooms", roomRoutes);
app.use("/api/v1/messages", messageRoutes);
app.use("/api/v1/workspace", workspaceRoutes);

// Google OAuth redirect callback (must match GOOGLE_CALLBACK_URL)
app.get("/auth/google/callback", googleOAuthCallback);

// Unhandled Route Handler (404)
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global Error Handler Middleware
app.use(globalErrorHandler);

export default app;
