const { mongoose, Conversation, Message } = require("./db");
const mockConversations = require("./mocks/mock-conversation");

const initChatDb = async () => {
  try {
    await Conversation.deleteMany({});
    await Message.deleteMany({});

    // Ici, insérez la logique pour créer des conversations/messages de test
    console.log("✅ Chat_DB initialisée");
  } catch (error) {
    console.error("❌ Erreur lors de l'init Chat_DB:", error);
  }
};

module.exports = initChatDb;
