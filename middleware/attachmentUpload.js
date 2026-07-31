import multer from "multer";
import path from "path";
import AppError from "../utils/AppError.js";

// Save uploaded files to your public directory

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/img/attachments");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = `attach-${req.user.id}-${Date.now()}${ext}`;
    cb(null, uniqueSuffix);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "application/zip",
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError("unsupported file type for the attachment", 400), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 10MB limit per file
});

export const uploadMessageAttachments = upload.array("attachments", 5);
