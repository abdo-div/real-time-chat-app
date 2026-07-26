import express from "express";
import * as authController from "../controllers/authController.js";
import * as userController from "../controllers/userController.js";

const router = express.Router();

// ------------------------------------------------------------------
// 1. PUBLIC AUTH ROUTES
// ------------------------------------------------------------------
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.get("/logout", authController.logout);

// Password Management
router.post("/forgotPassword", authController.forgotPassword);
router.patch("/resetPassword/:token", authController.resetPassword);

// ------------------------------------------------------------------
// 2. PROTECTED USER ROUTES (Requires Valid JWT)
// ------------------------------------------------------------------
router.use(authController.protect);

// Current User Operations
router.get("/me", authController.getMe);
router.patch("/updateMyPassword", authController.updatePassword);
router.patch("/updateMe", userController.updateMe); // Profile updates (avatar, bio, username)
router.patch("/status", authController.updateStatus); // Real-time status (online, away, offline)
router.delete("/deleteMe", userController.deleteMe);

// User Discovery (Essential for search & DM starting)
router.get("/", userController.getAllUsers); // Search/list workspace users
router.get("/:id", userController.getUser);

// ------------------------------------------------------------------
// 3. ADMIN-ONLY ROUTES
// ------------------------------------------------------------------
router.use(authController.restrictTo("admin"));

router.post("/", userController.createUser);
router
  .route("/:id")
  .patch(userController.updateUser)
  .delete(userController.deleteUser);

export default router;
