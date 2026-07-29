import User from "../models/User.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import multer from "multer";
import sharp from "sharp";

export const getMe = (req, res, next) => {
  req.params.id = req.user.id;
  next();
};
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

export const getUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new AppError("No user found with that ID", 404));
  }

  res.status(200).json({
    status: "success",
    data: {
      user,
    },
  });
});

export const updateMe = catchAsync(async (req, res, next) => {
  if (req.body.passowrd || req.body.passwordConfirm) {
    return next(
      new AppError(
        "this route is not for password updates ,please use /updatePassword",
        400,
      ),
    );
  }

  const filteredBody = filterObj(
    req.body,
    "username",
    "email",
    "avatar",
    "bio",
  );

  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    returnDocument: "after",
    runValidators: true,
  });

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

// ADMIN-ONLY CRUD CONTROLLERS

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
    return next(new AppError("no user found with that id", 404));
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

const multerStorage = multer.memoryStorage();

// Filter to accept ONLY image files
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

/**
 * @desc Middleware to handle single image upload on field 'photo' (or 'avatar')
 */
export const uploadUserPhoto = upload.single("photo");

/**
 * @desc Resize uploaded user photo to a 500x500 square JPEG and save to public/img/users
 */
export const resizeUserPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  // Create unique filename: user-userId-timestamp.jpeg
  req.file.filename = `user-${req.user.id}-${Date.now()}.jpeg`;

  await sharp(req.file.buffer)
    .resize(500, 500)
    .toFormat("jpeg")
    .jpeg({ quality: 90 })
    .toFile(`public/img/users/${req.file.filename}`);

  next();
});
