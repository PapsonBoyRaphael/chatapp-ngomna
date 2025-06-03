const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    senderId: { type: Number, required: true },
    receiverId: { type: Number, required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ["TEXT", "FILE", "IMAGE"], default: "TEXT" },
    status: {
      type: String,
      enum: ["SENT", "DELIVERED", "READ"],
      default: "SENT",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);
