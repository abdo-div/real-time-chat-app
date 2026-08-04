import catchAsync from "../utils/catchAsync.js";
import Room from "../models/Room.js";
import RoomMember from "../models/RoomMember.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { getWorkspace } from "../utils/workspaceConfig.js";
import { findOrCreateDMRoom } from "../utils/dmUtils.js";

/**
 * Global middleware: fetch sidebar data (channels + users) for the logged-in user
 * Sets res.locals.rooms, res.locals.users and res.locals.workspace so the sidebar
 * never breaks on any route.
 */
export const fetchSidebarData = catchAsync(async (req, res, next) => {
  res.locals.rooms = [];
  res.locals.users = [];
  res.locals.workspace = getWorkspace();

  if (!res.locals.user) return next();

  const memberships = await RoomMember.find({ user: res.locals.user._id }).select("room");
  const userRoomIds = memberships.map((m) => m.room);

  res.locals.rooms = await Room.find({
    $or: [{ isPrivate: false }, { _id: { $in: userRoomIds } }],
    type: { $nin: ["dm", "direct"] },
  }).sort({ createdAt: -1 });

  res.locals.users = await User.find({
    _id: { $ne: res.locals.user._id },
    active: { $ne: false },
  }).select("username email avatar status bio lastSeen");

  next();
});

/**
 * Render Main Overview / Chat View
 * Route: GET / or GET /chat
 */
export const getOverview = catchAsync(async (req, res, next) => {
  res.status(200).render("overview", {
    title: "Real-Time Chat & Collaboration",
    rooms: res.locals.rooms || [],
    users: res.locals.users || [],
  });
});

/**
 * Render Specific Room / Channel View
 * Route: GET /room/:slug
 */
export const getRoomView = catchAsync(async (req, res, next) => {
  const room = await Room.findOne({ slug: req.params.slug }).populate("createdBy", "username avatar");

  if (!room) {
    return res.status(404).render("error", {
      title: "Something went wrong!",
      msg: "No room found with that name.",
    });
  }

  // Ensure current logged-in user is registered as a room member
  let currentMemberRole = null;
  if (res.locals.user) {
    const existingMember = await RoomMember.findOne({ room: room._id, user: res.locals.user._id });
    if (!existingMember) {
      await RoomMember.create({
        room: room._id,
        user: res.locals.user._id,
        role: "member",
      });
      currentMemberRole = "member";
    } else {
      currentMemberRole = existingMember.role;
    }
  }

  // Get messages for this room
  const messages = await Message.find({ room: room._id })
    .populate("sender", "username avatar")
    .populate({
      path: "replyTo",
      select: "content sender",
      populate: { path: "sender", select: "username avatar" },
    })
    .sort({ createdAt: 1 });

  // Get room members
  const roomMembers = await RoomMember.find({ room: room._id }).populate(
    "user",
    "username avatar status lastSeen",
  );

  res.status(200).render("room", {
    title: `#${room.name} | Real-Time Chat`,
    room,
    messages,
    roomMembers,
    rooms: res.locals.rooms || [],
    users: res.locals.users || [],
    currentMemberRole,
  });
});

/**
 * Render Direct Message / Chat with User View
 * Route: GET /chat/user/:userId
 */
export const getDirectMessageView = catchAsync(async (req, res, next) => {
  const recipient = await User.findById(req.params.userId).select(
    "username avatar status bio lastSeen",
  );

  if (!recipient) {
    return res.status(404).render("error", {
      title: "User Not Found",
      msg: "No user found with that ID.",
    });
  }

  let room = null;
  let messages = [];

  if (res.locals.user) {
    // Find the existing DM room between the two users, or create it
    // (deterministic slug + race-safe, so both sides always share one room).
    room = await findOrCreateDMRoom({
      userA: res.locals.user._id,
      userB: recipient._id,
    });

    // 3. Fetch messages for this DM room
    messages = await Message.find({ room: room._id })
      .populate("sender", "username avatar")
      .populate({
        path: "replyTo",
        select: "content sender",
        populate: { path: "sender", select: "username avatar" },
      })
      .sort({ createdAt: 1 });
  }

  res.status(200).render("directMessage", {
    title: `Chat with ${recipient.username}`,
    recipient,
    room,
    messages,
    rooms: res.locals.rooms || [],
    users: res.locals.users || [],
  });
});

/**
 * Render Login View
 * Route: GET /login
 */
export const getLoginForm = (req, res) => {
  if (res.locals.user) {
    return res.redirect("/");
  }
  res.status(200).render("login", {
    title: "Log into your account",
  });
};

/**
 * Render Signup View
 * Route: GET /signup
 */
export const getSignupForm = (req, res) => {
  if (res.locals.user) {
    return res.redirect("/");
  }
  res.status(200).render("signup", {
    title: "Create your account",
  });
};

/**
 * Render User Profile View
 * Route: GET /me
 */
export const getAccount = (req, res) => {
  res.status(200).render("account", {
    title: "Your Account Settings",
  });
};

/**
 * Render Password Reset Request View
 * Route: GET /forgotPassword
 */
export const getForgotPasswordForm = (req, res) => {
  res.status(200).render("forgotPassword", {
    title: "Reset Your Password",
  });
};

/**
 * Render Reset Password View (Token provided)
 * Route: GET /resetPassword/:token
 */
export const getResetPasswordForm = (req, res) => {
  res.status(200).render("resetPassword", {
    title: "Set New Password",
    token: req.params.token,
  });
};
