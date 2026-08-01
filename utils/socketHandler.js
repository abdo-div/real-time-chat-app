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

    // Inside socketHandler.js / initSocket:
    socket.on("toggle_reaction", async (data) => {
      try {
        const { messageId, emoji } = data || {};
        const userId = socket.user._id;

        if (!messageId || !emoji) return;

        const message = await Message.findById(messageId);
        if (!message || message.isDeleted) return;

        // Guard for legacy documents
        if (!message.reactions) message.reactions = [];

        const userIdStr = userId.toString();
        const existingReactionIndex = message.reactions.findIndex(
          (r) => r.emoji === emoji,
        );

        if (existingReactionIndex > -1) {
          const reactionGroup = message.reactions[existingReactionIndex];
          if (!reactionGroup.users) reactionGroup.users = [];

          const userIndex = reactionGroup.users.findIndex(
            (uId) => uId.toString() === userIdStr,
          );

          if (userIndex > -1) {
            // User already reacted -> Remove user
            reactionGroup.users.splice(userIndex, 1);
            // Remove emoji group if empty
            if (reactionGroup.users.length === 0) {
              message.reactions.splice(existingReactionIndex, 1);
            }
          } else {
            // Add user to existing emoji list
            reactionGroup.users.push(userId);
          }
        } else {
          // First user to react with this emoji
          message.reactions.push({
            emoji,
            users: [userId],
          });
        }

        message.markModified("reactions");
        await message.save();

        // Broadcast to room
        io.to(message.room.toString()).emit("reaction_updated", {
          messageId: message._id,
          reactions: message.reactions,
        });
      } catch (err) {
        console.error("Error in toggle_reaction socket listener:", err);
      }
    });

    socket.on("send_message", async (data) => {
      try {
        const { room, content, replyTo } = data || {};
        const userId = socket.user._id;

        if (!room || !content) return;

        let newMessage = await Message.create({
          sender: userId,
          room,
          content,
          replyTo: replyTo || null,
        });

        newMessage = await newMessage.populate([
          { path: "sender", select: "username avatar" },
          {
            path: "replyTo",
            select: "content sender createdAt",
            populate: { path: "sender", select: "username" },
          },
        ]);

        // Broadcast to everyone in the room
        io.to(room).emit("new_message", newMessage);
      } catch (err) {
        console.error("Error in send_message socket event:", err);
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
