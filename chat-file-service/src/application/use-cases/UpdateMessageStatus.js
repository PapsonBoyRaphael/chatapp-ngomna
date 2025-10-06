class UpdateMessageStatus {
  constructor(
    messageRepository,
    conversationRepository,
    kafkaProducer = null,
    cacheService = null // Injection du cacheService
  ) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
    this.kafkaProducer = kafkaProducer;
    this.cacheService = cacheService;
  }

  async execute({ conversationId, receiverId, status, messageIds = null }) {
    try {
      console.log(`📝 Mise à jour statut messages:`, {
        conversationId,
        receiverId,
        status,
        messageIdsCount: messageIds?.length || 0,
        type: messageIds ? "specific" : "all",
      });

      // Validation
      if (!receiverId || !status) {
        throw new Error("receiverId et status sont requis");
      }
      const validStatuses = ["SENT", "DELIVERED", "READ", "DELETED"];
      if (!validStatuses.includes(status)) {
        throw new Error(
          `Status invalide. Valeurs acceptées: ${validStatuses.join(", ")}`
        );
      }

      // Utiliser la méthode appropriée du repository
      let result;
      // Éviter la double exécution
      const updatePromise = this.messageRepository.updateMessageStatus(
        conversationId,
        receiverId,
        status,
        messageIds || []
      );

      result = await updatePromise;

      // Invalidation du cache via CacheService
      if (this.cacheService && result.modifiedCount > 0) {
        try {
          if (conversationId) {
            await this.cacheService.del(`msg:conv:${conversationId}:*`);
            await this.cacheService.del(`conv:participant:*`); // Invalider les conversations liées
          }
          if (receiverId) {
            await this.cacheService.del(`msg:uploader:${receiverId}:*`);
          }
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur invalidation cache UpdateMessageStatus:",
            cacheError.message
          );
        }
      }

      // Publication Kafka si besoin (inchangé)
      if (this.kafkaProducer && result.modifiedCount > 0) {
        try {
          const eventType =
            status === "READ"
              ? "MESSAGES_READ"
              : status === "DELIVERED"
              ? "MESSAGES_DELIVERED"
              : "MESSAGES_STATUS_UPDATED";
          await this.kafkaProducer.publishMessage({
            eventType,
            conversationId,
            receiverId,
            status,
            modifiedCount: result.modifiedCount,
            messageIds: messageIds || "ALL",
            timestamp: new Date().toISOString(),
            source: "UpdateMessageStatus-UseCase",
          });
          console.log(
            `📤 Statut publié dans Kafka: ${eventType} - ${result.modifiedCount} messages`
          );
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication statut Kafka (non bloquant):",
            kafkaError.message
          );
        }
      }

      // Si le statut est "READ", réinitialiser le compteur de messages non lus
      if (status === "READ") {
        try {
          await this.conversationRepository.resetUnreadCountInUserMetadata(
            conversationId,
            receiverId
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
          `Status invalide. Valeurs acceptées: ${validStatuses.join(", ")}`
        );
      }

      const result = await this.messageRepository.updateSingleMessageStatus(
        messageId,
        receiverId,
        status
      );

      // Invalidation du cache pour ce message
      if (this.cacheService && result.modifiedCount > 0) {
        try {
          await this.cacheService.del(`msg:${messageId}`);
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur invalidation cache message unique:",
            cacheError.message
          );
        }
      }

      if (status === "READ") {
        try {
          await this.conversationRepository.resetUnreadCountInUserMetadata(
            conversationId,
            receiverId
          );
          console.log(`✅ Compteur non-lus réinitialisé pour ${receiverId}`);
        } catch (error) {
          console.error(`❌ Erreur réinitialisation compteur:`, error);
          // Ne pas faire échouer la mise à jour du statut si la réinitialisation échoue
        }
      }

      // Publication Kafka si modification réussie (inchangé)
      if (this.kafkaProducer && result.modifiedCount > 0) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "SINGLE_MESSAGE_STATUS_UPDATED",
            messageId,
            receiverId,
            status,
            timestamp: new Date().toISOString(),
            source: "UpdateMessageStatus-UseCase",
          });
          console.log(`📤 Événement Kafka publié pour message ${messageId}`);
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication message unique:",
            kafkaError.message
          );
        }
      }

      return result;
    } catch (error) {
      console.error("❌ Erreur markSingleMessage:", error);
      throw error;
    }
  }
}

module.exports = UpdateMessageStatus;
