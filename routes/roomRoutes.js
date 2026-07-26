import express from "express";
import { protect, restrictTo } from "../controllers/authController.js";
import * as roomController from "../controllers/roomController.js";

const router = express.Router();

// ------------------------------------------------------------------
// PROTECTED ROUTES (Requires Valid JWT)
// All room operations require the user to be authenticated
// ------------------------------------------------------------------
router.use(protect);

/**
 * @route   GET  /api/v1/rooms
 * @desc    Get all accessible rooms for the user (public channels + joined private/DM rooms)
 *
 * @route   POST /api/v1/rooms
 * @desc    Create a new room (channel or direct message)
 */
router
  .route("/")
  .get(roomController.getAllRooms)
  .post(roomController.createRoom);

/**
 * @route   POST /api/v1/rooms/dm
 * @desc    Find or create a 1-on-1 Direct Message channel with another user
 */
router.post("/dm", roomController.getOrCreateDM);

/**
 * @route   GET    /api/v1/rooms/:slug
 * @desc    Get details for a specific room by its URL slug (e.g. "general")
 *
 * @route   PATCH  /api/v1/rooms/:slug
 * @desc    Update room details (topic, description, name) - Requires room admin/moderator
 *
 * @route   DELETE /api/v1/rooms/:slug
 * @desc    Delete or archive a room - Requires room admin
 */
router
  .route("/:slug")
  .get(roomController.getRoomBySlug)
  .patch(roomController.updateRoom)
  .delete(roomController.deleteRoom);

// ------------------------------------------------------------------
// ROOM MEMBERSHIP MANAGEMENT
// ------------------------------------------------------------------

/**
 * @route   POST   /api/v1/rooms/:roomId/join
 * @desc    Join a public room
 */
router.post("/:roomId/join", roomController.joinRoom);

/**
 * @route   DELETE /api/v1/rooms/:roomId/leave
 * @desc    Leave a room
 */
router.delete("/:roomId/leave", roomController.leaveRoom);

/**
 * @route   GET    /api/v1/rooms/:roomId/members
 * @desc    Get list of members in a specific room with their roles
 */
router.get("/:roomId/members", roomController.getRoomMembers);

/**
 * @route   POST   /api/v1/rooms/:roomId/invite
 * @desc    Invite/Add a user to a private or public room
 */
router.post("/:roomId/invite", roomController.inviteMember);

export default router;
