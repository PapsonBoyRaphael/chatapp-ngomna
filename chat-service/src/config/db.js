const mongoose = require("mongoose");
require("dotenv").config();

const MessageModel = require("../models/message");
const ConversationModel = require("../models/conversation");

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connecté à chat_db (Messages & Conversations)"))
  .catch((err) => console.error("Erreur MongoDB (Chat):", err));

module.exports = {
  mongoose,
  Message: MessageModel,
  Conversation: ConversationModel,
};
