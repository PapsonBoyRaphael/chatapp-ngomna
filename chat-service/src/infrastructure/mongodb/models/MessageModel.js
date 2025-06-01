const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    senderId: { type: String, required: true },
    receiverId: { type: String, required: true },
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
