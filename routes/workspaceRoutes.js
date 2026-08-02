import express from "express";
import { protect, restrictTo } from "../controllers/authController.js";
import * as workspaceController from "../controllers/workspaceController.js";
import { uploadWorkspaceLogo } from "../middleware/workspaceUpload.js";

const router = express.Router();

router.use(protect);

// Workspace settings are global to the single tenant, so only admins may change them
router
  .route("/")
  .get(workspaceController.getWorkspaceConfig)
  .patch(restrictTo("admin"), workspaceController.updateWorkspace);

router.post("/logo", restrictTo("admin"), uploadWorkspaceLogo, workspaceController.uploadLogo);

export default router;
