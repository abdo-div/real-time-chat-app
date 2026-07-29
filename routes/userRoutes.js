import express from "express";
import * as authController from "../controllers/authController.js";
import * as userController from "../controllers/userController.js";

const router = express.Router();

// ------------------------------------------------------------------
// PUBLIC AUTH ROUTES
// ------------------------------------------------------------------
router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/logout", authController.logout);

// ------------------------------------------------------------------
// PROTECTED USER ROUTES (Requires JWT)
// ------------------------------------------------------------------
router.use(authController.protect);

router.get("/me", userController.getMe, userController.getUser);
router.patch(
  "/updateMe",
  userController.uploadUserPhoto,
  userController.resizeUserPhoto,
  userController.updateMe,
);
router.patch("/updateStatus", userController.updateStatus);
router.delete("/deleteMe", userController.deleteMe);

router.get("/", userController.getAllUsers);
router.get("/:id", userController.getUser);

// ------------------------------------------------------------------
// RESTRICTED ADMIN-ONLY ROUTES
// ------------------------------------------------------------------
router.use(authController.restrictTo("admin"));

router.post("/", userController.createUser);
router
  .route("/:id")
  .patch(userController.updateUser)
  .delete(userController.deleteUser);

export default router;
