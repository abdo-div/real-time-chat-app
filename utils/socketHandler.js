import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Message from "../models/Message.js";

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
      // Get raw token from handshake auth OR authorization header (case-insensitive)
      let rawToken =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization ||
        socket.handshake.headers?.Authorization;

      if (!rawToken) {
        return next(new Error("authentication error : token missing"));
      }

      // Strip "Bearer " prefix if present
      const token = rawToken.startsWith("Bearer ")
        ? rawToken.split(" ")[1]
        : rawToken;

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Verify user still exists
      const currentUser = await User.findById(decoded.id);
      if (!currentUser) {
        return next(new Error("authentication error : user no longer exists"));
      }

      // Attach user object to the socket session
      socket.user = currentUser;
      next();
    } catch (err) {
      console.error("Socket Auth Error:", err.message);
      return next(new Error(`authentication error: ${err.message}`));
    }
  });

  //2. socket connection and event handlers

  io.on("connection", async (socket) => {
    const userId = socket.user._id;

    console.log(`⚡ User connected: ${socket.user.username} (${socket.id})`);
    // 🟢 PRESENCE: Update status in DB to online & broadcast event

    await User.findByIdAndUpdate(userId, { status: "online" });
    socket.broadcast.emit("user_status_changed", {
      userId,
      username: socket.user.username,
      status: "online",
    });

    //user joins a personal room for private notification
    socket.join(socket.user.id.toString());

    socket.on("join_room", (roomId) => {
      socket.join(roomId);
      console.log(`👥 ${socket.user.username} joined room: ${roomId}`);

      //notify other members in the room
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

    // 👁️ REAL-TIME READ RECEIPT EVENT
    // 👁️ REAL-TIME READ RECEIPT EVENT
    socket.on("mark_read", async (data) => {
      try {
        // Handle both raw string "roomId" AND object { roomId } formats
        const roomId = typeof data === "string" ? data : data?.roomId;

        if (!roomId) return;

        const userId = socket.user._id;

        // Mark unread messages in DB
        await Message.updateMany(
          {
            room: roomId,
            sender: { $ne: userId },
            "readBy.user": { $ne: userId },
          },
          {
            $addToSet: {
              readBy: { user: userId, readAt: new Date() },
            },
          },
        );

        // Broadcast to other room members
        socket.to(roomId).emit("messages_read", {
          roomId,
          readBy: userId,
          readAt: new Date(),
        });
      } catch (err) {
        console.error("Error in mark_read socket event:", err);
      }
    });

    socket.on("disconnect", async () => {
      console.log(`❌ User disconnected: ${socket.user.username}`);
      // 🔴 PRESENCE: Update status in DB to offline & broadcast event

      await User.findByIdAndUpdate(userId, {
        status: "offline",
        lastSeen: new Date(),
      });
      io.emit("user_status_changed", {
        userId,
        username: socket.user.username,
        status: "offline",
        lastSeen: new Date(),
      });
    });
  });
  return io;
};
