import Message from "../models/Message.js";
import Room from "../models/Room.js";
import RoomMember from "../models/RoomMember.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
// Helper function to check if user is a member of the target room
const checkRoomAccess = async (roomId, userId) => {
  const membership = await RoomMember.findOne({ room: roomId, user: userId });
  return membership;
};

// ------------------------------------------------------------------
// MESSAGE CONTROLLERS
// ------------------------------------------------------------------

/**
 * @desc    Get paginated message history for a specific room
 * @route   GET /api/v1/rooms/:roomId/messages
 */
export const getRoomMessages = catchAsync(async (req, res, next) => {
  const { roomId } = req.params;

  // 1. Check if user belongs to the room
  const membership = await checkRoomAccess(roomId, req.user.id);
  if (!membership) {
    return next(
      new AppError(
        "You do not have permission to view messages in this room",
        403,
      ),
    );
  }

  // 2. Setup pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const skip = (page - 1) * limit;

  // 3. Fetch non-deleted messages sorted chronologically or newest-first
  const messages = await Message.find({ room: roomId, isDeleted: false })
    .populate("sender", "username avatar status")
    .populate("replyTo", "content sender")
    .sort({ createdAt: -1 }) // Newest first for chat UI pagination
    .skip(skip)
    .limit(limit);

  const totalMessages = await Message.countDocuments({
    room: roomId,
    isDeleted: false,
  });

  res.status(200).json({
    status: "success",
    results: messages.length,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(totalMessages / limit),
      totalMessages,
    },
    data: {
      // Reverse back to chronological order (oldest to newest) for smooth front-end scroll rendering
      messages: messages.reverse(),
    },
  });
});

/**
 * @desc    Send a new message to a room via HTTP
 * @route   POST /api/v1/rooms/:roomId/messages
 */
export const createMessage = catchAsync(async (req, res, next) => {
  const { content, replyTo } = req.body;
  const { roomId } = req.params;

  // 1. Check & ensure membership in room
  let membership = await checkRoomAccess(roomId, req.user.id);
  if (!membership) {
    // Check if room exists and is public
    const Room = (await import("../models/Room.js")).default;
    const roomDoc = await Room.findById(roomId);
    if (!roomDoc) {
      return next(new AppError("No room found with that ID", 404));
    }
    if (roomDoc.isPrivate) {
      return next(
        new AppError("You do not have access to this private room", 403),
      );
    }
    // Auto-join public room
    membership = await RoomMember.create({
      room: roomId,
      user: req.user.id,
      role: "member",
    });
  }

  // 2. Process uploaded files if any exist
  let attachments = [];
  if (req.files && req.files.length > 0) {
    attachments = req.files.map((file) => {
      let category = "other";

      if (file.mimetype.startsWith("image/")) {
        category = "image";
      } else if (file.mimetype.startsWith("audio/")) {
        category = "audio";
      } else if (file.mimetype.startsWith("video/")) {
        category = "video";
      } else if (
        file.mimetype === "application/pdf" ||
        file.mimetype.includes("word") ||
        file.mimetype.includes("document") ||
        file.mimetype.includes("text")
      ) {
        category = "document";
      }

      return {
        url: `/img/attachments/${file.filename}`,
        fileName: file.originalname,
        fileType: category,
        fileSize: file.size,
      };
    });
  }

  // 2. Validate: must have either text content or at least 1 file attachment
  const hasContent = content && content.trim().length > 0;
  const hasAttachments = attachments.length > 0;

  if (!hasContent && !hasAttachments) {
    return next(
      new AppError(
        "message must contain text content or at least file attachment",
        400,
      ),
    );
  }

  // 3. Save message with attachments and optional replyTo
  const newMessage = await Message.create({
    content: hasContent ? content.trim() : "",
    room: roomId,
    sender: req.user.id,
    attachments,
    replyTo: replyTo || null,
  });

  // 4. Populate sender details AND replyTo details for HTTP & WebSocket
  await newMessage.populate([
    { path: "sender", select: "username avatar status" },
    {
      path: "replyTo",
      select: "content sender createdAt",
      populate: { path: "sender", select: "username avatar" },
    },
  ]);

  // 5. Real-time broadcast to all sockets connected to this roomId
  const io = req.app.get("io");
  if (io) {
    io.to(String(roomId)).emit("new_message", newMessage);

    // Notify other room members so their unread badge can update live
    const otherMembers = await RoomMember.find({
      room: roomId,
      user: { $ne: req.user.id },
    }).select("user");
    otherMembers.forEach((m) => {
      io.to(String(m.user)).emit("unread_changed", { roomId: String(roomId) });
    });
  }

  res.status(201).json({
    status: "success",
    data: { message: newMessage },
  });
});
/**
 * @desc    Edit a previously sent message
 * @route   PATCH /api/v1/messages/:id
 */
export const updateMessage = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return next(new AppError("Updated message content cannot be empty", 400));
  }

  const message = await Message.findById(id);

  if (!message || message.isDeleted) {
    return next(new AppError("Message not found or has been deleted", 404));
  }

  const senderId = message.sender._id
    ? message.sender._id.toString()
    : message.sender.toString();

  if (senderId !== req.user.id.toString()) {
    return next(new AppError("You can only edit your own messages", 403));
  }

  message.content = content;
  message.isEdited = true;
  await message.save();

  if (!message.sender.username) {
    await message.populate("sender", "username avatar status");
  }

  // 📡 REAL-TIME BROADCAST: Emit updated message
  const io = req.app.get("io");
  if (io) {
    io.to(message.room.toString()).emit("message_updated", message);
  }

  res.status(200).json({
    status: "success",
    data: { message },
  });
});

/**
 * @desc    Soft-delete a message
 * @route   DELETE /api/v1/messages/:id
 */
export const deleteMessage = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const message = await Message.findById(id);

  if (!message || message.isDeleted) {
    return next(new AppError("Message not found", 404));
  }

  const senderId = message.sender._id
    ? message.sender._id.toString()
    : message.sender.toString();

  const isSender = senderId === req.user.id.toString();

  let isRoomAdminOrMod = false;
  if (!isSender) {
    const membership = await RoomMember.findOne({
      room: message.room,
      user: req.user.id,
    });
    if (membership && ["admin", "moderator"].includes(membership.role)) {
      isRoomAdminOrMod = true;
    }
  }

  if (!isSender && !isRoomAdminOrMod) {
    return next(
      new AppError("You do not have permission to delete this message", 403),
    );
  }

  message.isDeleted = true;
  message.content = "This message was deleted";
  message.attachments = [];
  await message.save();

  // 📡 REAL-TIME BROADCAST: Notify room members of deletion
  const io = req.app.get("io");
  if (io) {
    io.to(message.room.toString()).emit("message_deleted", {
      messageId: message._id,
      roomId: message.room,
    });
  }

  res.status(200).json({
    status: "success",
    message: "Message deleted successfully",
  });
});
/**
 * @desc    Add or toggle an emoji reaction on a message
 * @route   POST /api/v1/messages/:id/react
 */
export const toggleReaction = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { emoji } = req.body;

  if (!emoji) {
    return next(new AppError("Please provide an emoji reaction", 400));
  }

  const message = await Message.findById(id);

  if (!message || message.isDeleted) {
    return next(new AppError("Message not found", 404));
  }

  // Verify access to the message's room
  const membership = await checkRoomAccess(message.room, req.user.id);
  if (!membership) {
    return next(
      new AppError(
        "You do not have access to react to messages in this room",
        403,
      ),
    );
  }

  // 1. Guard against undefined reactions on legacy documents
  if (!message.reactions) {
    message.reactions = [];
  }

  const userIdStr = req.user.id.toString();

  // 2. Find index of emoji entry
  const existingReactionIndex = message.reactions.findIndex(
    (r) => r.emoji === emoji,
  );

  if (existingReactionIndex > -1) {
    const reactionGroup = message.reactions[existingReactionIndex];

    // Ensure nested users array exists
    if (!reactionGroup.users) reactionGroup.users = [];

    // Use .findIndex + .toString() to reliably compare ObjectIds
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
      reactionGroup.users.push(req.user.id);
    }
  } else {
    // First user to react with this emoji
    message.reactions.push({
      emoji,
      users: [req.user.id],
    });
  }

  // Tell Mongoose that the reactions array was mutated
  message.markModified("reactions");

  await message.save();
  const io = req.app.get("io");
  if (io) {
    io.to(message.room.toString()).emit("reaction_updated", {
      messageId: message._id,
      reactions: message.reactions,
    });
  }
  res.status(200).json({
    status: "success",
    data: {
      reactions: message.reactions,
    },
  });
});

//1. mark all messages in a room as read for the current user

export const markMessagesAsRead = catchAsync(async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user._id;

  // Mark unread messages in DB
  const updateMessages = await Message.updateMany(
    {
      room: roomId,
      sender: { $ne: userId },
      "readBy.user": { $ne: userId },
    },
    {
      $addToSet: {
        readBy: {
          user: userId,
          readAt: new Date(),
        },
      },
    },
  );

  // Sync the membership's lastReadAt so unread badge counts reset
  await RoomMember.markAsRead(roomId, userId);

  res.status(200).json({
    status: "success",
    message: "message marked as read",
    modifiedCount: updateMessages.modifiedCount,
  });
});

// 2. Get unread message counts grouped by room for the logged-in user
// Unread = messages created after the user's lastReadAt for that room
export const getUnreadCounts = catchAsync(async (req, res) => {
  const userId = req.user._id;

  // Find all rooms the user is a member of
  const memberships = await RoomMember.find({ user: userId }).lean();

  if (memberships.length === 0) {
    return res
      .status(200)
      .json({ status: "success", data: { unreadCounts: [] } });
  }

  // Count messages newer than each room's lastReadAt
  const counted = await Promise.all(
    memberships.map(async (m) => {
      const count = await Message.countDocuments({
        room: m.room,
        sender: { $ne: userId },
        isDeleted: false,
        createdAt: { $gt: m.lastReadAt || new Date(0) },
      });
      return { room: m.room, count };
    }),
  );

  const withUnread = counted.filter((c) => c.count > 0);
  if (withUnread.length === 0) {
    return res
      .status(200)
      .json({ status: "success", data: { unreadCounts: [] } });
  }

  // Fetch room details so the client can match badges (slug/type) and resolve DM partners
  const rooms = await Room.find({
    _id: { $in: withUnread.map((u) => u.room) },
  }).lean();
  const roomById = new Map(rooms.map((r) => [r._id.toString(), r]));

  const dmRoomIds = rooms
    .filter((r) => r.type === "dm" || r.type === "direct")
    .map((r) => r._id);

  // For DM rooms, the badge should appear next to the other participant's name
  const dmWithByRoom = new Map();
  if (dmRoomIds.length) {
    const dmMembers = await RoomMember.find({
      room: { $in: dmRoomIds },
      user: { $ne: userId },
    }).lean();
    dmMembers.forEach((m) => {
      dmWithByRoom.set(m.room.toString(), m.user);
    });
  }

  const unreadCounts = withUnread.map((u) => {
    const room = roomById.get(u.room.toString());
    const isDm = room && (room.type === "dm" || room.type === "direct");
    return {
      roomId: u.room,
      count: u.count,
      slug: room ? room.slug : null,
      type: room ? room.type : null,
      dmWith: isDm ? dmWithByRoom.get(u.room.toString()) || null : null,
    };
  });

  res.status(200).json({
    status: "success",
    data: { unreadCounts },
  });
});
