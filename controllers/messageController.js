import Message from "../models/Message.js";
import RoomMember from "../models/RoomMember.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/appError.js";

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
  const { roomId } = req.params;
  const { content, attachments, replyTo } = req.body;

  // 1. Verify caller membership
  const membership = await checkRoomAccess(roomId, req.user.id);
  if (!membership) {
    return next(
      new AppError("You must be a room member to send messages", 403),
    );
  }

  if (!content && (!attachments || attachments.length === 0)) {
    return next(
      new AppError("Message must contain text content or an attachment", 400),
    );
  }

  // 2. Create message
  let message = await Message.create({
    room: roomId,
    sender: req.user.id,
    content,
    attachments: attachments || [],
    replyTo: replyTo || null,
  });

  // Populate sender info for front-end rendering
  message = await message.populate("sender", "username avatar status");
  if (message.replyTo) {
    message = await message.populate("replyTo", "content sender");
  }

  res.status(201).json({
    status: "success",
    data: { message },
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

  // Only the original sender can edit content
  if (message.sender.toString() !== req.user.id.toString()) {
    return next(new AppError("You can only edit your own messages", 403));
  }

  message.content = content;
  message.isEdited = true;
  await message.save();

  await message.populate("sender", "username avatar status");

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

  // Check if caller is sender OR room admin/moderator
  const isSender = message.sender.toString() === req.user.id.toString();

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

  // Perform soft delete
  message.isDeleted = true;
  message.content = "This message was deleted";
  message.attachments = [];
  await message.save();

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

  // Find index of emoji entry in reactions schema
  const existingReactionIndex = message.reactions.findIndex(
    (r) => r.emoji === emoji,
  );

  if (existingReactionIndex > -1) {
    const userIndex = message.reactions[existingReactionIndex].users.indexOf(
      req.user.id,
    );

    if (userIndex > -1) {
      // User already reacted with this emoji -> Remove user
      message.reactions[existingReactionIndex].users.splice(userIndex, 1);

      // If no users left for this emoji, remove the emoji entry entirely
      if (message.reactions[existingReactionIndex].users.length === 0) {
        message.reactions.splice(existingReactionIndex, 1);
      }
    } else {
      // Add user to existing emoji list
      message.reactions[existingReactionIndex].users.push(req.user.id);
    }
  } else {
    // First user to react with this emoji
    message.reactions.push({
      emoji,
      users: [req.user.id],
    });
  }

  await message.save();

  res.status(200).json({
    status: "success",
    data: {
      reactions: message.reactions,
    },
  });
});
