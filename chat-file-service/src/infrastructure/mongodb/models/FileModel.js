const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    originalName: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
      unique: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    path: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    uploadedBy: {
      type: Number,
      required: true,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
    },
    metadata: {
      duration: Number, // Pour audio/vidéo
      dimensions: {
        width: Number,
        height: Number,
      },
      thumbnail: String,
      compressed: Boolean,
    },
    status: {
      type: String,
      enum: ["UPLOADING", "COMPLETED", "FAILED"],
      default: "UPLOADING",
    },
  },
  {
    timestamps: true,
  }
);

fileSchema.index({ uploadedBy: 1 });
fileSchema.index({ conversationId: 1 });
fileSchema.index({ createdAt: -1 });

module.exports = mongoose.model("File", fileSchema);
