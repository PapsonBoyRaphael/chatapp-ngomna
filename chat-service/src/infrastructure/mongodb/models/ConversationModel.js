const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: Number,
        required: true,
        index: true,
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    metadata: {
      createdBy: {
        type: Number,
        required: true,
      },
      isArchived: {
        type: Boolean,
        default: false,
      },
      isBlocked: {
        type: Boolean,
        default: false,
      },
      mutedUntil: Date,
    },
  },
  {
    timestamps: true,
    autoIndex: true,
    indexes: [
      { participants: 1, createdAt: -1 },
      { participants: 1, "metadata.isArchived": 1 },
    ],
  }
);

module.exports = mongoose.model("Conversation", conversationSchema);
