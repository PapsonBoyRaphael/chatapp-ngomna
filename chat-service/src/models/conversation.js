const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        required: [true, "At least one participant is required"],
        ref: "User",
        index: true,
      },
    ],
    messages: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Validation pour s'assurer qu'il y a au moins deux participants
conversationSchema.pre("save", function (next) {
  if (this.participants.length < 2) {
    next(new Error("A conversation must have at least two participants"));
  }
  next();
});

// Index composé sur participants pour optimiser les requêtes
conversationSchema.index({ participants: 1 });

module.exports = mongoose.model("Conversation", conversationSchema);
