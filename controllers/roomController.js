import Room from "../models/Room.js";
import RoomMember from "../models/RoomMember.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";

// Helper function to convert channel names to URL slugs
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w\-]+/g, "") // Remove all non-word chars
    .replace(/\-\-+/g, "-"); // Replace multiple - with single -
};

export const getAllRooms = catchAsync(async (req, res, next) => {
  const membership = await RoomMember.find({ user: req.user.id }).select(
    "room",
  );
  const userRoomIds = membership.map((m) => m.room);

  const rooms = await Room.find({
    $or: [{ isPrivate: false }, { _id: { $in: userRoomIds } }],
  }).populate("createdBy", "username avatar");

  res.status(200).json({
    status: "success",
    results: rooms.length,
    data: { rooms },
  });
});

export const createRoom = catchAsync(async (req, res, next) => {
  const { name, description, isPrivate, type } = req.body;

  if (!name) {
    return next(new AppError("a room must have a name", 400));
  }

  const slug = slugify(name);

  const existingRoom = await Room.findOne({ slug });
  if (existingRoom) {
    return next(new AppError("a room with this name already exists", 400));
  }

  const room = await Room.create({
    name,
    slug,
    description,
    isPrivate: isPrivate || false,
    type: type || "channel",
    createdBy: req.user.id,
  });

  await RoomMember.create({
    room: room._id,
    user: req.user.id,
    role: "admin",
  });

  res.status(201).json({
    status: "success",
    data: { room },
  });
});

export const getOrCreateDM = catchAsync(async (req, res, next) => {
  const { targetUserId } = req.body;

  if (!targetUserId) {
    return next(
      new AppError("Please provide a targetUserId to start a DM", 400),
    );
  }

  if (targetUserId === req.user.id.toString()) {
    return next(
      new AppError("You cannot start a direct message with yourself", 400),
    );
  }

  // Find DM rooms where current user is a member
  const myDMs = await RoomMember.find({ user: req.user.id }).select("room");
  const myDMRoomIds = myDMs.map((m) => m.room);

  // Check if target user is also in any of those DM rooms
  const existingDMMembership = await RoomMember.findOne({
    user: targetUserId,
    room: { $in: myDMRoomIds },
  }).populate({
    path: "room",
    match: { type: "dm" },
  });

  if (existingDMMembership && existingDMMembership.room) {
    return res.status(200).json({
      status: "success",
      data: { room: existingDMMembership.room },
    });
  }

  // Create new DM room
  const newDMRoom = await Room.create({
    name: `dm-${req.user.id}-${targetUserId}`,
    slug: `dm-${Date.now()}`,
    isPrivate: true,
    type: "dm",
    createdBy: req.user.id,
  });

  // Add both users as members
  await RoomMember.insertMany([
    { room: newDMRoom._id, user: req.user.id, role: "member" },
    { room: newDMRoom._id, user: targetUserId, role: "member" },
  ]);

  res.status(201).json({
    status: "success",
    data: { room: newDMRoom },
  });
});

export const getRoomBySlug = catchAsync(async (req, res, next) => {
  const room = await Room.findOne({ slug: req.params.slug }).populate(
    "createdBy",
    "username avatar",
  );

  if (!room) {
    return next(new AppError("no room found with that slug", 404));
  }
  // If private room, verify user is a member

  if (room.isPrivate) {
    const isMember = await RoomMember.findOne({
      room: room._id,
      user: req.user.id,
    });
    if (!isMember) {
      return next(
        new AppError("you do not have access to this private room ", 403),
      );
    }
  }

  res.status(200).json({
    status: "success",
    data: { room },
  });
});

export const updateRoom = catchAsync(async (req, res, next) => {
  const room = await Room.findOne({ slug: req.params.slug });

  if (!room) {
    return next(new AppError("no room found with that slug", 404));
  }
  // verify caller is room admin or moderator
  const member = await RoomMember.findOne({
    room: room._id,
    user: req.user.id,
  });
  if (!member || !["admin", "moderator"].includes(member.role)) {
    return next(
      new AppError("you do not have permession to update this room ", 403),
    );
  }

  if (req.body.name) {
    req.body.slug = slugify(req.body.name);
  }

  const updatedRoom = await Room.findByIdAndUpdate(room._id, req.body, {
    returnDocument: "after",
    runValidators: true,
  });

  res.status(200).json({
    status: "success",
    data: { room: updatedRoom },
  });
});

export const deleteRoom = catchAsync(async (req, res, next) => {
  const room = await Room.findOne({ slug: req.params.slug });

  if (!room) {
    return next(new AppError("no room found with that slug", 404));
  }

  const member = await RoomMember.findOne({
    room: room._id,
    user: req.user.id,
  });

  if (!member || member.role !== "admin") {
    return next(new AppError("only room admins can delete this room", 403));
  }
  await Room.findOneAndDelete(room._id);
  await RoomMember.deleteMany({ room: room._id });

  res.status(204).json({
    status: "success",
    data: null,
  });
});

export const joinRoom = catchAsync(async (req, res, next) => {
  const room = await Room.findById(req.params.roomId);

  if (!room) {
    return next(new AppError("no room found with that id", 404));
  }

  if (room.isPrivate) {
    return next(
      new AppError(
        "cannot join a private room directly you must be invited",
        403,
      ),
    );
  }

  let membership = await RoomMember.findOne({
    room: room._id,
    user: req.user.id,
  });

  membership = await RoomMember.create({
    room: room._id,
    user: req.user.id,
    role: "member",
  });

  res.status(200).json({
    status: "success",
    data: { membership },
  });
});

export const leaveRoom = catchAsync(async (req, res, next) => {
  const membership = await RoomMember.findOneAndDelete({
    room: req.params.roomId,
    user: req.user.id,
  });

  if (!membership) {
    return next(new AppError("you are not a member of this room", 400));
  }
  res.status(204).json({
    status: "success",
    data: null,
  });
});

export const getRoomMembers = catchAsync(async (req, res, next) => {
  const members = await RoomMember.find({ room: req.params.roomId })
    .populate("user", "username avatar status email bio")
    .sort("role");

  res.status(200).json({
    status: "success",
    results: members.length,
    data: { members },
  });
});

/**
 * @desc    Invite / Add a user to a room
 * @route   POST /api/v1/rooms/:roomId/members
 */
export const addRoomMember = catchAsync(async (req, res, next) => {
  const { userId, role } = req.body;

  if (!userId) {
    return next(new AppError("Please provide a userId to add", 400));
  }

  // Verify caller is member with admin/moderator privileges
  const caller = await RoomMember.findOne({
    room: req.params.roomId,
    user: req.user.id,
  });

  if (!caller || !["admin", "moderator"].includes(caller.role)) {
    return next(
      new AppError(
        "You do not have permission to invite users to this room",
        403,
      ),
    );
  }

  let membership = await RoomMember.findOne({
    room: req.params.roomId,
    user: userId,
  });

  if (membership) {
    return next(new AppError("User is already a member of this room", 400));
  }

  membership = await RoomMember.create({
    room: req.params.roomId,
    user: userId,
    role: role || "member",
  });

  res.status(201).json({
    status: "success",
    data: { membership },
  });
});

/**
 * @desc    Update a member's role inside a room (e.g. member -> moderator)
 * @route   PATCH /api/v1/rooms/:roomId/members/:userId
 */
export const updateMemberRole = catchAsync(async (req, res, next) => {
  const { role } = req.body;

  if (!["admin", "moderator", "member"].includes(role)) {
    return next(new AppError("Invalid role specified", 400));
  }

  // Caller must be room admin
  const caller = await RoomMember.findOne({
    room: req.params.roomId,
    user: req.user.id,
  });

  if (!caller || caller.role !== "admin") {
    return next(new AppError("Only room admins can change member roles", 403));
  }

  const updatedMembership = await RoomMember.findOneAndUpdate(
    { room: req.params.roomId, user: req.params.userId },
    { role },
    { new: true, runValidators: true },
  );

  if (!updatedMembership) {
    return next(new AppError("Member not found in this room", 404));
  }

  res.status(200).json({
    status: "success",
    data: { membership: updatedMembership },
  });
});

/**
 * @desc    Remove / Kick a member from a room
 * @route   DELETE /api/v1/rooms/:roomId/members/:userId
 */
export const removeRoomMember = catchAsync(async (req, res, next) => {
  // Caller must be admin or moderator
  const caller = await RoomMember.findOne({
    room: req.params.roomId,
    user: req.user.id,
  });

  if (!caller || !["admin", "moderator"].includes(caller.role)) {
    return next(
      new AppError("You do not have permission to remove members", 403),
    );
  }

  const removed = await RoomMember.findOneAndDelete({
    room: req.params.roomId,
    user: req.params.userId,
  });

  if (!removed) {
    return next(new AppError("Member not found in this room", 404));
  }

  res.status(204).json({
    status: "success",
    data: null,
  });
});
