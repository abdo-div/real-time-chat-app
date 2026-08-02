import express from "express";
import {
  getOverview,
  getRoomView,
  getDirectMessageView,
  getLoginForm,
  getSignupForm,
  getAccount,
  getForgotPasswordForm,
  getResetPasswordForm,
} from "../controllers/viewsController.js";
import { isLoggedIn, protect } from "../controllers/authController.js";

const router = express.Router();

// Apply isLoggedIn middleware to all view routes to populate res.locals.user if logged in
router.use(isLoggedIn);

// Public View Routes
router.get("/", getOverview);
router.get("/chat", getOverview);
router.get("/login", getLoginForm);
router.get("/signup", getSignupForm);
router.get("/forgotPassword", getForgotPasswordForm);
router.get("/resetPassword/:token", getResetPasswordForm);

// Protected View Routes (Requires Login)
router.get("/me", protect, getAccount);
router.get("/room/:slug", protect, getRoomView);
router.get("/chat/user/:userId", protect, getDirectMessageView);

export default router;
