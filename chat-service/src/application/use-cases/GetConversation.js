const axios = require("axios");

class GetConversation {
  constructor(conversationRepository, messageRepository) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
  }

  async execute(conversationId, userId) {
    const conversation = await this.conversationRepository.getConversationById(
      conversationId
    );

    if (!conversation) {
      throw new Error("Conversation non trouvée");
    }

    // Vérifier que l'utilisateur fait partie de la conversation
    userId = Number(userId);

    if (!conversation.participants.includes(userId)) {
      throw new Error("Accès non autorisé à cette conversation");
    }

    // Récupérer le nombre de messages non lus
    const unreadCount = await this.messageRepository.getUnreadMessagesCount(
      conversation._id,
      userId
    );

    // Récupérer les infos des participants
    const participantsInfo = await Promise.all(
      conversation.participants.map(async (participantId) => {
        try {
          const response = await axios.get(
            `${process.env.USER_SERVICE_URL}/users/${participantId}`
          );
          return response.data;
        } catch (error) {
          console.error(
            `Erreur lors de la récupération du participant ${participantId}:`,
            error
          );
          return { id: participantId, nom: "Inconnu", prenom: "" };
        }
      })
    );

    return {
      ...conversation,
      participants: participantsInfo,
      unreadCount,
    };
  }
}

module.exports = GetConversation;
