const Message = require("../mongodb/models/MessageModel");
const Conversation = require("../mongodb/models/ConversationModel");

class MongoMessageRepository {
  async getMessagesByConversationId(conversationId) {
    try {
      const messages = await Message.find({ conversationId })
        .sort({ createdAt: 1 })
        .lean();

      return messages;
    } catch (error) {
      console.error("Erreur lors de la récupération des messages:", error);
      throw error;
    }
  }

  async saveMessage(messageData) {
    try {
      const { conversationId } = messageData;

      // Vérifier que la conversation existe
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new Error("Conversation non trouvée");
      }

      // Vérifier que l'expéditeur et le destinataire font partie de la conversation
      if (
        !conversation.participants.includes(messageData.senderId) ||
        !conversation.participants.includes(messageData.receiverId)
      ) {
        throw new Error(
          "Les participants ne font pas partie de cette conversation"
        );
      }

      // Créer le message
      const message = new Message({
        ...messageData,
        status: "SENT",
      });

      // Sauvegarder le message
      await message.save();

      // Mettre à jour le dernier message de la conversation
      conversation.lastMessage = message;
      await conversation.save();

      return message;
    } catch (error) {
      console.error("Erreur lors de la sauvegarde du message:", error);
      throw error;
    }
  }

  async updateMessagesStatus(conversationId, receiverId, status) {
    try {
      if (!conversationId) {
        throw new Error("L'ID de conversation est requis");
      }

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new Error("Conversation non trouvée");
      }

      // Vérifier que le destinataire fait partie de la conversation
      if (!conversation.participants.includes(receiverId)) {
        throw new Error(
          "Le destinataire n'appartient pas à cette conversation"
        );
      }

      // Définir les conditions de mise à jour selon le statut
      const statusHierarchy = {
        SENT: 1,
        DELIVERED: 2,
        READ: 3,
      };

      const targetStatusLevel = statusHierarchy[status];

      // Mettre à jour uniquement les messages avec un statut inférieur
      const result = await Message.updateMany(
        {
          conversationId,
          receiverId,
          status: {
            $in: Object.keys(statusHierarchy).filter(
              (s) => statusHierarchy[s] < targetStatusLevel
            ),
          },
        },
        { $set: { status } }
      );

      // Log pour le débogage
      if (result.modifiedCount > 0) {
        const updatedMessages = await Message.find({
          conversationId,
          receiverId,
        }).select("content status createdAt");

        console.log(`${result.modifiedCount} message(s) mis à jour`);
        // console.log("Messages après mise à jour:", updatedMessages);
      }

      return result.modifiedCount;
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
      return await Message.countDocuments({
        conversationId,
        receiverId: userId,
        status: { $ne: "READ" },
      });
    } catch (error) {
      console.error("Erreur lors du comptage des messages non lus:", error);
      return 0;
    }
  }
}

module.exports = MongoMessageRepository;
