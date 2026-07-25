import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import app from "./app.js";
import connectDB from "./config/db.js";

// Handle Uncaught Exceptions (e.g. undefined variable references)
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! 💥 Shutting down...");
  console.error(err.name, err.message);
  process.exit(1);
});

dotenv.config();

// Connect Database
connectDB();

// Create HTTP Server & Attach Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Socket.io Listener
io.on("connection", (socket) => {
  console.log(`⚡ Client Connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`❌ Client Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
const serverListener = server.listen(PORT, () => {
  console.log(
    `🚀 App running in ${process.env.NODE_ENV || "development"} mode on http://localhost:${PORT}`,
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
