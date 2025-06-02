const Conversation = require("../mongodb/models/ConversationModel");

class MongoConversationRepository {
  async getConversationsByUserId(userId) {
    try {
      const conversations = await Conversation.find({
        participants: userId,
      }).populate("lastMessage");

      return conversations;
    } catch (error) {
      console.error("Erreur lors de la récupération des conversations:", error);
      throw error;
    }
  }

  async findOrCreateConversation(participants) {
    let conversation = await Conversation.findOne({
      participants: { $all: participants },
    });
    if (!conversation) {
      conversation = new Conversation({ participants });
      await conversation.save();
    }
    return conversation;
  }

  async updateLastMessage(conversationId, messageId) {
    return await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: messageId,
    });
  }
}

module.exports = MongoConversationRepository;
