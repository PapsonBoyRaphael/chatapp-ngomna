const Conversation = require("../mongodb/models/ConversationModel");

class MongoConversationRepository {
  async getConversationById(conversationId) {
    return await Conversation.findById(conversationId)
      .populate("lastMessage")
      .lean();
  }

  async getConversationsByUserId(userId) {
    try {
      const conversations = await Conversation.find({
        participants: userId,
      })
        .populate("lastMessage")
        .sort({ "lastMessage.createdAt": -1 })
        .lean();

      return conversations;
    } catch (error) {
      console.error("Erreur lors de la récupération des conversations:", error);
      throw error;
    }
  }

  async findOrCreateConversation(participants) {
    const conversation = await Conversation.findOne({
      participants: { $all: participants },
    });

    if (conversation) {
      return conversation;
    }

    return await Conversation.create({
      participants,
      metadata: {
        createdBy: participants[0],
      },
    });
  }

  async updateLastMessage(conversationId, messageId) {
    return await Conversation.findByIdAndUpdate(
      conversationId,
      { lastMessage: messageId },
      { new: true }
    );
  }
}

module.exports = MongoConversationRepository;
