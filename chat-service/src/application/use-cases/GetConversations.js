const axios = require("axios");

class GetConversations {
  constructor(conversationRepository, messageRepository) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
  }

  async execute(userId) {
    if (!userId) {
      throw new Error("L'ID utilisateur est requis");
    }

    const conversations =
      await this.conversationRepository.getConversationsByUserId(userId);

    // Enrichir les conversations avec les informations des participants et messages non lus
    const enrichedConversations = await Promise.all(
      conversations.map(async (conversation) => {
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
      })
    );

    return enrichedConversations;
  }
}

module.exports = GetConversations;
