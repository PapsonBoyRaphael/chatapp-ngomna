const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true, // Pour optimiser les requêtes
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
      fileName: String, // Pour les fichiers
      fileSize: Number, // Taille en bytes
      mimeType: String, // Type MIME
      duration: Number, // Pour audio/vidéo
      thumbnail: String, // URL miniature
      location: {
        // Pour les positions
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
      // Pour les réponses aux messages
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    forwardedFrom: {
      // Pour les messages transférés
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    deletedFor: [
      {
        // Pour la suppression sélective
        userId: Number,
        deletedAt: Date,
      },
    ],
    reactions: [
      {
        // Pour les réactions aux messages
        userId: Number,
        type: String, // emoji ou type de réaction
        createdAt: Date,
      },
    ],
  },
  {
    timestamps: true,
    // Optimisation des performances
    autoIndex: true,
    // Ajout des index composés
    indexes: [
      { conversationId: 1, createdAt: -1 },
      { senderId: 1, receiverId: 1, status: 1 },
      { conversationId: 1, status: 1 },
    ],
  }
);
module.exports = mongoose.model("Message", messageSchema);
