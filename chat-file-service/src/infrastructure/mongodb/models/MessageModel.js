const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: Number,
      required: true,
      index: true,
    },
    receiverId: {
      type: Number,
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["TEXT", "FILE", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "LOCATION"],
      default: "TEXT",
    },
    metadata: {
      fileName: String,
      fileSize: Number,
      mimeType: String,
      duration: Number,
      thumbnail: String,
      fileUrl: String, // URL du fichier uploadé
      location: {
        latitude: Number,
        longitude: Number,
      },
    },
    status: {
      type: String,
      enum: ["SENT", "DELIVERED", "READ"],
      default: "SENT",
      index: true,
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    forwardedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    deletedFor: [
      {
        userId: Number,
        deletedAt: Date,
      },
    ],
    reactions: [
      {
        userId: Number,
        type: String,
        createdAt: Date,
      },
    ],
  },
  {
    timestamps: true,
    autoIndex: true,
  }
);

module.exports = mongoose.model("Message", messageSchema);
