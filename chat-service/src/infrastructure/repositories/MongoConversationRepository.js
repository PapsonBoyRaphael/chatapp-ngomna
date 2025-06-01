const Conversation = require("../mongodb/models/ConversationModel");

class MongoConversationRepository {
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
