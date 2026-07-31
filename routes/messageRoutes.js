import express from "express";
import { protect } from "../controllers/authController.js";
import * as messageController from "../controllers/messageController.js";
import { uploadMessageAttachments } from "../middleware/attachmentUpload.js";
// mergeParams: true enables access to params from parent router (e.g. /api/v1/rooms/:roomId/messages)
const router = express.Router({ mergeParams: true });

// ------------------------------------------------------------------
// PROTECTED ROUTES (Requires Valid JWT)
// ------------------------------------------------------------------
router.use(protect);

/**
 * @route   GET  /api/v1/rooms/:roomId/messages
 * @desc    Get paginated message history for a specific room (supports ?page=1&limit=50)
 *
 * @route   POST /api/v1/rooms/:roomId/messages
 * @desc    Send a new message to a room via HTTP
 */
router
  .route("/")
  .get(messageController.getRoomMessages)
  .post(uploadMessageAttachments, messageController.createMessage);

/**
 * @route   PATCH  /api/v1/messages/:id
 * @desc    Edit a previously sent message (only sender or admin)
 *
 * @route   DELETE /api/v1/messages/:id
 * @desc    Soft-delete a message
 */
router
  .route("/:id")
  .patch(messageController.updateMessage)
  .delete(messageController.deleteMessage);

/**
 * @route   POST /api/v1/messages/:id/react
 * @desc    Add or toggle an emoji reaction on a message (e.g., 👍, ❤️, 🔥)
 */
router.post("/:id/react", messageController.toggleReaction);

export default router;
