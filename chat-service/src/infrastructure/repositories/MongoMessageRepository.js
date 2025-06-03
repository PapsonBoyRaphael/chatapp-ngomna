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
    try {
      // Trouver ou créer la conversation
      let conversation = await Conversation.findOne({
        participants: {
          $all: [messageData.senderId, messageData.receiverId],
        },
      });

      if (!conversation) {
        conversation = new Conversation({
          participants: [messageData.senderId, messageData.receiverId],
        });
      }

      // Créer le message
      const message = new Message({
        ...messageData,
        conversationId: conversation._id,
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
      console.log(
        `Mise à jour du statut des messages pour la conversation ${conversationId}, destinataire ${receiverId}, statut ${status}`
      );
      if (!conversationId) {
        throw new Error("L'ID de conversation est requis");
      }

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new Error("Conversation non trouvée");
      }

      // Vérifier que le receiverId fait partie de la conversation
      if (!conversation.participants.includes(receiverId)) {
        throw new Error(
          "Le destinataire n'appartient pas à cette conversation"
        );
      }

      // Mettre à jour uniquement les messages de cette conversation
      const result = await Message.updateMany(
        {
          conversationId: conversationId,
          receiverId: receiverId,
          status: { $ne: status },
        },
        {
          $set: { status: status },
        }
      );

      // Récupérer et afficher les messages mis à jour
      const updatedMessages = await Message.find({
        conversationId: conversationId,
        receiverId: receiverId,
      });

      console.log(`Nombre de messages mis à jour : ${result.modifiedCount}`);
      console.log(
        "Messages après mise à jour :",
        updatedMessages.map((msg) => ({
          content: msg.content,
          status: msg.status,
          createdAt: msg.createdAt,
        }))
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
