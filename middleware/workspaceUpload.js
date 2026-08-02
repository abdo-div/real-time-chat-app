import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import AppError from "../utils/AppError.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logoDir = path.join(__dirname, "..", "public", "img", "workspace-logo");

// Make sure the upload folder exists (multer does not create it)
fs.mkdirSync(logoDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    cb(null, `workspace-logo-${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError("Workspace logo must be an image file", 400), false);
  }
};

export const uploadWorkspaceLogo = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("logo");
