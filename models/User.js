import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "username is required"],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, "username must be at least 3 characters"],
      maxlength: [20, "username cannot exceed 20 characters"],
      match: [
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores",
      ],
      index: true,
    },
    email: {
      type: String,
      required: [true, "email address is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "please provide a valid email address",
      ],
      index: true,
    },
    password: {
      type: String,
      required: [true, "password is required"],
      minlength: [8, "password must be at least 8 characters"],
      select: false,
    },
    passwordConfirm: {
      type: String,
      validate: {
        validator: function (el) {
          return el === this.password;
        },
        message: "passwords do not match!",
      },
    },
    avatar: {
      type: String,
      default: "default-avatar.png",
    },
    role: {
      type: String,
      enum: {
        values: ["member", "moderator", "admin"],
        message: "Role must be either member, moderator, or admin",
      },
      default: "member",
    },
    status: {
      type: String,
      enum: ["online", "offline", "away"],
      default: "offline",
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
    isAccountActive: {
      type: Boolean,
      default: true,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ------------------------------------------------------------------
// MONGOOSE INDEXES
// ------------------------------------------------------------------
// Compound index for high-performance status and active filtering

userSchema.index({ status: 1, lastActiveAt: -1 });

// ------------------------------------------------------------------
// PRE-SAVE MIDDLEWARE HOOKS
// ------------------------------------------------------------------
// Hash password automatically before saving if modified

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    this.lastActiveAt = Date.now();
  }
  next();
});
/**
 * Compares candidate password with hashed password in database
 * @param {string} candidatePassword - Plain text password input
 * @param {string} userPassword - Hashed password from DB
 * @returns {Promise<boolean>} True if matching
 */

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword,
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.statics.findActiveUsers = function () {
  return this.find({ isAccountActive: true, status: "online" }).select(
    "-password",
  );
};

userSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.__v;
    delete ret.isAccountActive;
    return ret;
  },
});

const User = mongoose.model("User", userSchema);

export default User;
