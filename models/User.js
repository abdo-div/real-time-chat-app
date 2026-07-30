import mongoose from "mongoose";
import bcrypt from "bcrypt";
import crypto from "crypto";

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
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
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
    active: {
      type: Boolean,
      default: true,
      select: false,
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

userSchema.index({ status: 1, lastActiveAt: -1 });

// ------------------------------------------------------------------
// PRE-SAVE MIDDLEWARE HOOKS
// ------------------------------------------------------------------

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);
  this.passwordConfirm = undefined;
});

userSchema.pre("save", function () {
  if (this.isModified("status")) {
    this.lastActiveAt = Date.now();
  }
});

userSchema.pre("save", function () {
  if (!this.isModified("password") || this.isNew) return;

  this.passwordChangedAt = Date.now() - 1000;
});

// ------------------------------------------------------------------
// INSTANCE METHODS & STATICS
// ------------------------------------------------------------------

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword,
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10,
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

userSchema.statics.findActiveUsers = function () {
  return this.find({ active: { $ne: false }, status: "online" }).select(
    "-password",
  );
};

userSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.__v;
    delete ret.isAccountActive;
    delete ret.active;
    delete ret.passwordResetToken;
    delete ret.passwordResetExpires;
    return ret;
  },
});

const User = mongoose.model("User", userSchema);

export default User;
