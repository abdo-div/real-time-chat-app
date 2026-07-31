import http from "http";
import dotenv from "dotenv";
dotenv.config({ path: "./config.env" });

import app from "./app.js";
import connectDB from "./config/db.js";
import { initSocket } from "./utils/socketHandler.js";

// Handle Uncaught Exceptions (e.g. undefined variable references)
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  console.error(err.name, err.message);
  process.exit(1);
});

// Connect Database
connectDB();

// Create HTTP server wrapping Express app
const server = http.createServer(app);

// Initialize Socket.IO and export io instance if needed
export const io = initSocket(server);
app.set("io", io);

const PORT = process.env.PORT || 5000;
const serverListener = server.listen(PORT, () => {
  console.log(
    `🚀 App running in ${process.env.NODE_ENV || "development"} mode on http://localhost:${PORT}`
  );
});

// Handle Unhandled Promise Rejections (e.g. failed DB connection)
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION! 💥 Shutting down...");
  console.error(err.name, err.message);
  serverListener.close(() => {
    process.exit(1);
  });
});
