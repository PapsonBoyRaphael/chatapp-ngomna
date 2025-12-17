class MarkMessageDelivered {
  constructor(
    messageRepository,
    conversationRepository = null,
    kafkaProducer = null
  ) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
    this.kafkaProducer = kafkaProducer;
  }

  /**
   * params:
   *  - messageId (string) - un seul message
   *  - conversationId (string) - pour marquer tous les messages d'une conversation
   *  - messageIds (array) - pour marquer plusieurs messages spécifiques
   *  - userId (receiver) - REQUIS
   */
  async execute({
    messageId = null,
    conversationId = null,
    messageIds = null,
    userId,
  }) {
    const start = Date.now();
    try {
      // ✅ VALIDATION : userId EST REQUIS
      if (!userId) {
        throw new Error("userId (receiverId) requis");
      }

      console.log(`📬 MarkMessageDelivered.execute():`, {
        messageId,
        conversationId,
        messageIdsCount: messageIds?.length || 0,
        userId,
      });

      let result;

      // ✅ CAS 1 : UN SEUL MESSAGE
      if (messageId) {
        console.log(
          `📬 Marquage UN seul message: ${messageId} comme DELIVERED`
        );
        result = await this.messageRepository.updateSingleMessageStatus(
          messageId,
          userId,
          "DELIVERED"
        );
      }
      // ✅ CAS 2 : TOUS LES MESSAGES D'UNE CONVERSATION
      else if (conversationId && !messageIds) {
        console.log(
          `📬 Marquage TOUS messages conversation ${conversationId} comme DELIVERED`
        );
        result = await this.messageRepository.updateMessageStatus(
          conversationId,
          userId,
          "DELIVERED",
          [] // messageIds vide = tous les messages
        );
      }
      // ✅ CAS 3 : MESSAGES SPÉCIFIQUES
      else if (conversationId && messageIds) {
        console.log(
          `📬 Marquage ${messageIds.length} messages spécifiques comme DELIVERED`
        );
        result = await this.messageRepository.updateMessageStatus(
          conversationId,
          userId,
          "DELIVERED",
          messageIds
        );
      } else {
        throw new Error(
          "Doit avoir soit messageId, soit conversationId avec ou sans messageIds"
        );
      }

      // ✅ PUBLICATION KAFKA
      if (this.kafkaProducer && result && result.modifiedCount > 0) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "MESSAGES_DELIVERED",
            conversationId,
            receiverId: userId,
            messageId: messageId || null,
            messageIds: messageIds || (messageId ? [messageId] : "ALL"),
            modifiedCount: result.modifiedCount,
            timestamp: new Date().toISOString(),
            source: "MarkMessageDelivered-UseCase",
          });
          console.log(
            `📤 Événement MESSAGES_DELIVERED publié: ${result.modifiedCount} messages`
          );
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication Kafka MarkMessageDelivered:",
            kafkaError.message
          );
        }
      }

      console.log("✅ Mise à jour DELIVERED terminée:", {
        conversationId,
        messageId,
        userId,
        modifiedCount: result?.modifiedCount || 0,
        durationMs: Date.now() - start,
      });

      return result;
    } catch (error) {
      console.error("❌ Erreur MarkMessageDelivered use case:", error.message);
      throw error;
    }
  }
}

module.exports = MarkMessageDelivered;
