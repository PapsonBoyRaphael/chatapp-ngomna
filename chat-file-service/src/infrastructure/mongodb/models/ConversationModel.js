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
      createdBy: Number,
      conversationType: {
        type: String,
        enum: ["PRIVATE", "GROUP"],
        default: "PRIVATE",
      },
      groupName: String,
      groupDescription: String,
      groupAdmin: [Number],
    },
    settings: {
      muteNotifications: {
        type: Map,
        of: Boolean,
        default: {},
      },
      customization: {
        theme: String,
        wallpaper: String,
      },
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ "lastMessage.createdAt": -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
