import mongoose from "mongoose";

const roomMemberSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: [true, "room member record must be linked to a room "],
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "room member record must be linked to a user"],
      index: true,
    },
    role: {
      type: String,
      enum: {
        values: ["admin", "moderator", "member"],
        message: "room member role must be either admin,moderator, member",
      },
      default: "member",
    },
    lastReadAt: {
      type: Date,
      default: Date.now,
    },
    isMuted: {
      type: Boolean,
      dafault: false,
    },
    isStarred: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

roomMemberSchema.index({ room: 1, user: 1 }, { unique: true });

roomMemberSchema.index({ user: 1, role: 1 });

/**
 * Update user's lastReadAt timestamp for unread badge calculations
 * @param {string} roomId - Room ObjectId
 * @param {string} userId - User ObjectId
 */

roomMemberSchema.statics.markAsRead = async function (roomId, userId) {
  return await this.findOneAndUpdate(
    {
      room: roomId,
      user: userId,
    },
    { lastReadAt: Date.now() },
    {
      new: true,
      upsert: true,
    },
  );
};

const RoomMember = mongoose.model("RoomMember", roomMemberSchema);

export default RoomMember;
