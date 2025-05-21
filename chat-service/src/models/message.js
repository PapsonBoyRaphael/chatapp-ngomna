const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      default: "",
      trim: true,
      maxlength: [1000, "Message content cannot exceed 1000 characters"],
    },
    attachments: {
      type: String,
      default: "",
      trim: true,
      maxlength: [255, "Attachment URL cannot exceed 255 characters"],
    },
    seen: {
      type: Boolean,
      default: false,
    },
    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    msgByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "User ID is required"],
      ref: "User",
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index sur msgByUserId pour accélérer les recherches par auteur
messageSchema.index({ msgByUserId: 1 });

module.exports = mongoose.model("Message", messageSchema);
