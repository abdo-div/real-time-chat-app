import catchAsync from "../utils/catchAsync.js";
import Room from "../models/Room.js";
import RoomMember from "../models/RoomMember.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

/**
 * Render Main Overview / Chat View
 * Route: GET / or GET /chat
 */
export const getOverview = catchAsync(async (req, res, next) => {
  // If user is logged in, fetch their joined channels & users
  let rooms = [];
  let users = [];

  if (res.locals.user) {
    const memberships = await RoomMember.find({ user: res.locals.user._id }).select("room");
    const userRoomIds = memberships.map((m) => m.room);

    rooms = await Room.find({
      $or: [{ isPrivate: false }, { _id: { $in: userRoomIds } }],
    }).sort({ createdAt: -1 });

    users = await User.find({
      _id: { $ne: res.locals.user._id },
      active: { $ne: false },
    }).select("username email avatar status bio");
  }

  res.status(200).render("overview", {
    title: "Real-Time Chat & Collaboration",
    rooms,
    users,
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

  // Get messages for this room
  const messages = await Message.find({ room: room._id })
    .populate("sender", "username avatar")
    .sort({ createdAt: 1 });

  // Get room members
  const roomMembers = await RoomMember.find({ room: room._id }).populate("user", "username avatar status");

  // Fetch list of all public/user rooms for the sidebar
  let rooms = [];
  if (res.locals.user) {
    const memberships = await RoomMember.find({ user: res.locals.user._id }).select("room");
    const userRoomIds = memberships.map((m) => m.room);

    rooms = await Room.find({
      $or: [{ isPrivate: false }, { _id: { $in: userRoomIds } }],
    });
  }

  res.status(200).render("room", {
    title: `#${room.name} | Real-Time Chat`,
    room,
    messages,
    roomMembers,
    rooms,
  });
});

/**
 * Render Direct Message / Chat with User View
 * Route: GET /chat/user/:userId
 */
export const getDirectMessageView = catchAsync(async (req, res, next) => {
  const recipient = await User.findById(req.params.userId).select("username avatar status bio");

  if (!recipient) {
    return res.status(404).render("error", {
      title: "User Not Found",
      msg: "No user found with that ID.",
    });
  }

  // Find or calculate direct messages between logged in user and recipient
  let messages = [];
  if (res.locals.user) {
    messages = await Message.find({
      $or: [
        { sender: res.locals.user._id, recipient: recipient._id },
        { sender: recipient._id, recipient: res.locals.user._id },
      ],
    })
      .populate("sender", "username avatar")
      .sort({ createdAt: 1 });
  }

  res.status(200).render("directMessage", {
    title: `Chat with ${recipient.username}`,
    recipient,
    messages,
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
