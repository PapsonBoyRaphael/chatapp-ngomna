class UpdateMessageStatus {
  constructor(messageRepository, conversationRepository, kafkaProducer = null) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
    this.kafkaProducer = kafkaProducer;
  }

  async execute({ conversationId, receiverId, status, messageIds = null }) {
    try {
      // Validation renforcée
      if (!conversationId || !receiverId || !status) {
        throw new Error("conversationId, receiverId et status sont requis");
      }

      const validStatuses = ["SENT", "DELIVERED", "READ"];
      if (!validStatuses.includes(status)) {
        throw new Error(
          `Status invalide. Valeurs acceptées: ${validStatuses.join(", ")}`
        );
      }

      // Mettre à jour le statut des messages
      const updateResult = await this.messageRepository.updateMessagesStatus(
        conversationId,
        receiverId,
        status,
        messageIds // Messages spécifiques ou tous les messages
      );

      const result = {
        conversationId,
        receiverId,
        status,
        modifiedCount: updateResult.modifiedCount || updateResult,
        timestamp: new Date().toISOString(),
      };

      // 🚀 PUBLIER DANS KAFKA SI DES MESSAGES ONT ÉTÉ MODIFIÉS
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
            // ✅ PAS DE timestamp - sera ajouté automatiquement par le producer
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

      // Mettre à jour les statistiques de la conversation si nécessaire
      if (result.modifiedCount > 0 && status === "READ") {
        try {
          await this.conversationRepository.updateUnreadCount(
            conversationId,
            receiverId
          );
        } catch (error) {
          console.warn(
            "⚠️ Erreur mise à jour compteur non-lus:",
            error.message
          );
        }
      }

      return result;
    } catch (error) {
      console.error("❌ Erreur UpdateMessageStatus:", error);
      throw error;
    }
  }

  // Méthode pour marquer un message spécifique
  async markSingleMessage({ messageId, receiverId, status }) {
    try {
      if (!messageId || !receiverId || !status) {
        throw new Error("messageId, receiverId et status sont requis");
      }

      const result = await this.messageRepository.updateSingleMessageStatus(
        messageId,
        receiverId,
        status
      );

      // 🚀 PUBLIER DANS KAFKA
      if (this.kafkaProducer && result.modifiedCount > 0) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "SINGLE_MESSAGE_STATUS_UPDATED",
            messageId,
            receiverId,
            status,
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication message unique:",
            kafkaError.message
          );
        }
      }

      return result;
    } catch (error) {
      console.error("❌ Erreur marquage message unique:", error);
      throw error;
    }
  }
}

module.exports = UpdateMessageStatus;
