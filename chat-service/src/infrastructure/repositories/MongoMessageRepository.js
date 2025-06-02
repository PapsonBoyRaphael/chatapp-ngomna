const Message = require("../mongodb/models/MessageModel");
const Conversation = require("../mongodb/models/ConversationModel");
class MongoMessageRepository {
  async getMessagesByConversationId(conversationId) {
    try {
      // Récupérer d'abord les participants de la conversation
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new Error("Conversation non trouvée");
      }

      // Utiliser la méthode existante avec les participants
      const messages = await this.getMessagesByConversation(
        conversation.participants
      );

      return messages;
    } catch (error) {
      console.error("Erreur lors de la récupération des messages:", error);
      throw error;
    }
  }

  async saveMessage(messageData) {
    const message = new Message(messageData);
    return await message.save();
  }

  async getMessagesByConversation(participants) {
    return await Message.find({
      $or: [
        { senderId: participants[0], receiverId: participants[1] },
        { senderId: participants[1], receiverId: participants[0] },
      ],
    }).sort({ createdAt: 1 });
  }

  async updateMessagesStatus(conversationId, receiverId, status) {
    try {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new Error("Conversation non trouvée");
      }

      // Mettre à jour le statut des messages non lus
      await Message.updateMany(
        {
          receiverId: receiverId,
          status: { $ne: status }, // Ne pas mettre à jour si déjà au statut souhaité
          conversationId: conversationId,
        },
        { $set: { status: status } }
      );

      return true;
    } catch (error) {
      console.error(
        "Erreur lors de la mise à jour du statut des messages:",
        error
      );
      throw error;
    }
  }

  async getUnreadMessagesCount(conversationId, userId) {
    try {
      const count = await Message.countDocuments({
        conversationId,
        receiverId: userId,
        status: { $ne: "READ" },
      });
      return count;
    } catch (error) {
      console.error("Erreur lors du comptage des messages non lus:", error);
      return 0;
    }
  }
}

module.exports = MongoMessageRepository;
