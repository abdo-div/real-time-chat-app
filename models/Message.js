import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
  },
  fileType: {
    type: String,
    enum: ["image", "document", "audio", "video", "other"],
    default: "other",
  },
  fileName: {
    type: String,
    trim: true,
  },
  fileSize: {
    type: Number, // Size in bytes
  },
});

const messageSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: [true, "message must belong to a room"],
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "message must have a sender"],
      index: true,
    },
    content: {
      type: String,
      required: [
        function () {
          return !this.attachments || this.attachments.length === 0;
        },
        "Message content or attachment is required",
      ],
      trim: true,
      maxlength: [4000, "message cannot exceed 4000 characters"],
    },
    attachments: [attachmentSchema],
    isEdited: {
      type: Boolean,
      default: false,
    },
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    editHistory: [
      {
        content: String,
        editedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

messageSchema.index({ room: 1, createdAt: -1, "readBy.user": 1 });

messageSchema.pre(/^find/, function () {
  this.populate({
    path: "sender",
    select: "username avatar role status",
  });
});

messageSchema.methods.softDelete = async function () {
  this.isDeleted = true;
  this.deletedAt = Date.now();
  this.content = "This message was deleted.";
  this.attachments = [];
  return await this.save();
};

const Message = mongoose.model("Message", messageSchema);

export default Message;
