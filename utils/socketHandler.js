import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js"; // Adjust path to your User model

export const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // 1. SOCKET AUTHENTICATION MIDDLEWARE
  io.use(async (socket, next) => {
    try {
      // Extract token from handshake auth object or authorization headers
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(" ")[1];

      if (!token) {
        return next(new Error("authentication error : token missing"));
      }

      // verify jwt token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // verify user still exists
      const currentUser = await User.findById(decoded.id);
      if (!currentUser) {
        return next(new Error("authentication error : user no longer exists"));
      }

      // attach user object to the socket session
      socket.user = currentUser;
      next();
    } catch (err) {
      return next(new Error("authentication error: invalid or expired token"));
    }
  });

  // 2. SOCKET CONNECTION & EVENT HANDLERS
  io.on("connection", (socket) => {
    console.log(`⚡ User connected: ${socket.user.username} (${socket.id})`);

    // user joins a personal room for private notification
    socket.join(socket.user.id.toString());

    socket.on("join_room", (roomId) => {
      socket.join(roomId);
      console.log(`👥 ${socket.user.username} joined room: ${roomId}`);

      // notify other members in the room
      socket.to(roomId).emit("user_joined_room", {
        userId: socket.user.id,
        username: socket.user.username,
        roomId,
      });
    });

    socket.on("leave_room", (roomId) => {
      socket.leave(roomId);
      console.log(`🚪 ${socket.user.username} left room: ${roomId}`);
    });

    socket.on("typing_start", (roomId) => {
      socket.to(roomId).emit("display_typing", {
        userId: socket.user.id,
        username: socket.user.username,
        roomId,
      });
    });

    socket.on("typing_stop", (roomId) => {
      socket.to(roomId).emit("hide_typing", {
        userId: socket.user.id,
        roomId,
      });
    });

    socket.on("disconnect", () => {
      console.log(`❌ User disconnected: ${socket.user.username}`);
    });
  });

  return io;
};
