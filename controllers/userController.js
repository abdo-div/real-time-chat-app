import fs from "fs";
import multer from "multer";
import sharp from "sharp";
import User from "../models/User.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";

/**
 * Filter object fields to only allow specified allowed fields (Security helper)
 */
const filterObj = (obj, ...allowedFields) => {
  const newObj = {};
  Object.keys(obj).forEach((el) => {
    if (allowedFields.includes(el)) newObj[el] = obj[el];
  });
  return newObj;
};

// ------------------------------------------------------------------
// MULTER & SHARP CONFIGURATION FOR AVATAR UPLOADS
// ------------------------------------------------------------------

const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image")) {
    cb(null, true);
  } else {
    cb(new AppError("Not an image! Please upload only images.", 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
});

export const uploadUserPhoto = upload.single("photo");

export const resizeUserPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  // Create unique filename: user-userId-timestamp.jpeg
  req.file.filename = `user-${req.user.id}-${Date.now()}.jpeg`;

  if (!fs.existsSync("public/img/users")) {
    fs.mkdirSync("public/img/users", { recursive: true });
  }

  await sharp(req.file.buffer)
    .resize(500, 500)
    .toFormat("jpeg")
    .jpeg({ quality: 90 })
    .toFile(`public/img/users/${req.file.filename}`);

  next();
});

// ------------------------------------------------------------------
// CURRENT USER CONTROLLERS
// ------------------------------------------------------------------

export const getMe = (req, res, next) => {
  req.params.id = req.user.id;
  next();
};

export const updateMe = catchAsync(async (req, res, next) => {
  // 1. Prevent password updates on this route
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        "This route is not for password updates. Please use /updatePassword.",
        400,
      ),
    );
  }

  // 2. Filter allowed fields
  const filteredBody = filterObj(
    req.body,
    "username",
    "email",
    "avatar",
    "bio",
  );

  // 3. Attach file path if photo was uploaded
  if (req.file) {
    filteredBody.avatar = `/img/users/${req.file.filename}`;
  }

  // 4. Update user document
  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    returnDocument: "after",
    runValidators: true,
  });

  res.status(200).json({
    status: "success",
    data: { user: updatedUser },
  });
});

export const updateStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;

  if (!["online", "offline", "away"].includes(status)) {
    return next(new AppError("Invalid status value provided", 400));
  }

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    { status },
    { returnDocument: "after", runValidators: true },
  );

  res.status(200).json({
    status: "success",
    data: { user: updatedUser },
  });
});

export const deleteMe = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user.id, {
    active: false,
    status: "offline",
  });

  res.status(204).json({
    status: "success",
    data: null,
  });
});

// ------------------------------------------------------------------
// USER QUERY & ADMIN CONTROLLERS
// ------------------------------------------------------------------

export const getUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new AppError("No user found with that ID", 404));
  }

  res.status(200).json({
    status: "success",
    data: { user },
  });
});

export const getAllUsers = catchAsync(async (req, res, next) => {
  let query = { active: { $ne: false } };

  if (req.query.search) {
    const searchRegex = new RegExp(req.query.search, "i");
    query = {
      ...query,
      $or: [{ username: searchRegex }, { email: searchRegex }],
    };
  }

  const users = await User.find(query).select("-password");

  res.status(200).json({
    status: "success",
    results: users.length,
    data: { users },
  });
});

export const createUser = catchAsync(async (req, res, next) => {
  const newUser = await User.create(req.body);

  res.status(201).json({
    status: "success",
    data: { user: newUser },
  });
});

export const updateUser = catchAsync(async (req, res, next) => {
  const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, {
    returnDocument: "after",
    runValidators: true,
  });

  if (!updatedUser) {
    return next(new AppError("No user found with that ID", 404));
  }

  res.status(200).json({
    status: "success",
    data: { user: updatedUser },
  });
});

export const deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndDelete(req.params.id);

  if (!user) {
    return next(new AppError("No user found with that ID", 404));
  }

  res.status(204).json({
    status: "success",
    data: null,
  });
});
