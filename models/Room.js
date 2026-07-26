import mongoose from "mongoose";
import slugify from "slugify";

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      requierd: [true, "room name is required"],
      trim: true,
      minlength: [2, "room name must be at least 2 characters"],
      maxlength: [50, "room name cannot exced 50 characters"],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },
    topic: {
      type: String,
      trim: true,
      maxlength: [150, "topic description cannot exced 150 characters"],
      default: "",
    },
    type: {
      type: String,
      enum: {
        values: ["public", "private", "direct"],
        message: "room type must be either public, private, or direct",
      },
      default: "public",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "room must have a creator"],
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isArchived: {
      type: Boolean,
      default: false,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

roomSchema.virtual("messages", {
  ref: "Message",
  foreignField: "room",
  localField: "_id",
});

roomSchema.virtual("memberCount").get(function () {
  return this.members ? this.members.length : 0;
});

roomSchema.pre("save", function (next) {
  if (!this.isModified("name")) return next();
  this.slug = slugify(this.name, { lower: true, strict: true });
  next();
});

roomSchema.pre(/^find/, function (next) {
  this.find({ isArchived: { $ne: true } });
  next();
});

const Room = mongoose.model("Room", roomSchema);

export default Room;
