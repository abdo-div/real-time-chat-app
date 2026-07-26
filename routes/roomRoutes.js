import express from "express";
import { protect } from "../controllers/authController.js";
import * as roomController from "../controllers/roomController.js";
import messageRoutes from "./messageRoutes.js";

const router = express.Router();

// Protect ALL room and member operations
router.use(protect);

// ------------------------------------------------------------------
// NESTED ROUTE FOR MESSAGES
// ------------------------------------------------------------------
router.use("/:roomId/messages", messageRoutes);

// ------------------------------------------------------------------
// ROOM CORE ENDPOINTS
// ------------------------------------------------------------------
router
  .route("/")
  .get(roomController.getAllRooms)
  .post(roomController.createRoom);

router.post("/dm", roomController.getOrCreateDM);

router
  .route("/:slug")
  .get(roomController.getRoomBySlug)
  .patch(roomController.updateRoom)
  .delete(roomController.deleteRoom);

// ------------------------------------------------------------------
// ROOM MEMBER MANAGEMENT (Operations on the RoomMember collection)
// ------------------------------------------------------------------

// Join & Leave current user actions
router.post("/:roomId/join", roomController.joinRoom);
router.delete("/:roomId/leave", roomController.leaveRoom);

// Member CRUD inside a room
router
  .route("/:roomId/members")
  .get(roomController.getRoomMembers) // List members with roles
  .post(roomController.addRoomMember); // Invite / Add user

router
  .route("/:roomId/members/:userId")
  .patch(roomController.updateMemberRole) // Promote/demote (admin, moderator, member)
  .delete(roomController.removeRoomMember); // Kick member from room

export default router;
