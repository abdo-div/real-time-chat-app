import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { getWorkspace, setWorkspace } from "../utils/workspaceConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_NAME_LENGTH = 40;

const clearLogoFile = () => {
  const current = getWorkspace();
  if (current.logo && current.logo.startsWith("/img/workspace-logo/")) {
    const oldPath = path.join(
      __dirname,
      "..",
      "public",
      current.logo.replace(/^\//, ""),
    );
    fs.promises.unlink(oldPath).catch(() => {});
  }
};

/**
 * GET /api/v1/workspace
 * Return the current workspace config (name, logo, badge style).
 */
export const getWorkspaceConfig = catchAsync(async (req, res, next) => {
  res.status(200).json({
    status: "success",
    data: getWorkspace(),
  });
});

/**
 * PATCH /api/v1/workspace
 * Update workspace-level settings (name and/or badge style). Admin only.
 */
export const updateWorkspace = catchAsync(async (req, res, next) => {
  const patch = {};

  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name || name.length > MAX_NAME_LENGTH) {
      return next(
        new AppError(
          `Workspace name must be between 1 and ${MAX_NAME_LENGTH} characters`,
          400,
        ),
      );
    }
    patch.name = name;
  }

  if (req.body.badgeStyle !== undefined) {
    const style = String(req.body.badgeStyle);
    if (!["initials", "icon"].includes(style)) {
      return next(new AppError("badgeStyle must be 'initials' or 'icon'", 400));
    }
    patch.badgeStyle = style;
  }

  if (req.body.logo === null) {
    clearLogoFile();
    patch.logo = null;
  }

  const updated = setWorkspace(patch);

  res.status(200).json({
    status: "success",
    data: updated,
  });
});

/**
 * POST /api/v1/workspace/logo
 * Upload a workspace logo image. Replaces any existing logo. Admin only.
 */
export const uploadLogo = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError("Please upload a logo image", 400));
  }

  // Clean up any previously uploaded logo file
  clearLogoFile();

  const logoUrl = `/img/workspace-logo/${req.file.filename}`;
  const updated = setWorkspace({ logo: logoUrl });

  res.status(200).json({
    status: "success",
    data: updated,
  });
});
