class UpdateMessageStatus {
  constructor(messageRepository, conversationRepository, kafkaProducer = null) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
    this.kafkaProducer = kafkaProducer;
  }

  async execute({ messageId, receiverId, status, conversationId }) {
    try {
      messageId = null; // forcer l'utilisation de conversationId + messageIds
      console.log(`📝 Mise à jour statut messages:`, {
        conversationId,
        receiverId,
        status,
        messageIdCount: messageId?.length || 0,
        type: messageId ? "specific" : "all",
      });

      // Validation
      if (!receiverId || !status) {
        throw new Error("receiverId et status sont requis");
      }
      const validStatuses = ["SENT", "DELIVERED", "READ", "DELETED"];
      if (!validStatuses.includes(status)) {
        throw new Error(
          `Status invalide. Valeurs acceptées: ${validStatuses.join(", ")}`,
        );
      }

      // Utiliser la méthode appropriée du repository
      let result;
      // Éviter la double exécution
      const updatePromise = this.messageRepository.updateMessageStatus(
        conversationId,
        receiverId,
        status,
        messageId || [],
      );

      result = await updatePromise;

      // Si le statut est "READ", réinitialiser le compteur de messages non lus
      if (status === "READ") {
        try {
          await this.conversationRepository.resetUnreadCountInUserMetadata(
            conversationId,
            receiverId,
          );
          console.log(`✅ Compteur non-lus réinitialisé pour ${receiverId}`);
        } catch (error) {
          console.error(`❌ Erreur réinitialisation compteur:`, error);
          // Ne pas faire échouer la mise à jour du statut si la réinitialisation échoue
        }
      }

      return result;
    } catch (error) {
      console.error("❌ Erreur UpdateMessageStatus use case:", error);
      throw error;
    }
  }

  // Méthode pour marquer un message spécifique
  async markSingleMessage({ messageId, receiverId, status }) {
    try {
      console.log(`📝 Marquage message unique:`, {
        messageId,
        receiverId,
        status,
      });

      if (!messageId || !receiverId || !status) {
        throw new Error("messageId, receiverId et status sont requis");
      }
      const validStatuses = ["SENT", "DELIVERED", "READ", "FAILED"];
      if (!validStatuses.includes(status)) {
        throw new Error(
          `Status invalide. Valeurs acceptées: ${validStatuses.join(", ")}`,
        );
      }

      const result = await this.messageRepository.updateSingleMessageStatus(
        messageId,
        receiverId,
        status,
      );

      return result;
    } catch (error) {
      console.error("❌ Erreur markSingleMessage:", error);
      throw error;
    }
  }
}

module.exports = UpdateMessageStatus;
