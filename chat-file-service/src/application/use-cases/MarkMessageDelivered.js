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
   *  - messageId (string) OR (conversationId + messageIds)
   *  - userId (receiver)
   *  - conversationId (optional)
   *  - messageIds (optional array)
   */
  async execute({
    messageId = null,
    conversationId = null,
    messageIds = null,
    userId,
  }) {
    const start = Date.now();
    try {
      if (!userId) throw new Error("userId (receiverId) requis");

      let result;
      if (messageId) {
        // mettre à jour un message spécifique
        result = await this.messageRepository.markMessagesAsDelivered(
          messageId,
          userId,
          "DELIVERED"
        );
      } else {
        // mise à jour en masse (conversation ou messageIds)
        result = await this.messageRepository.markMessagesAsDelivered(
          conversationId,
          userId,
          "DELIVERED",
          messageIds || []
        );
      }

      // publication Kafka
      if (this.kafkaProducer && result && result.modifiedCount > 0) {
        try {
          await (typeof this.kafkaProducer.publishMessage === "function"
            ? this.kafkaProducer.publishMessage({
                eventType: "MESSAGES_DELIVERED",
                conversationId,
                receiverId: userId,
                messageId: messageId || null,
                messageIds: messageIds || (messageId ? [messageId] : "ALL"),
                modifiedCount: result.modifiedCount,
                timestamp: new Date().toISOString(),
                source: "MarkMessageDelivered-UseCase",
              })
            : this.kafkaProducer.send({
                topic: "chat.message.status",
                messages: [
                  {
                    key: conversationId || messageId || userId,
                    value: JSON.stringify({
                      eventType: "MESSAGES_DELIVERED",
                      conversationId,
                      receiverId: userId,
                      messageId: messageId || null,
                      messageIds:
                        messageIds || (messageId ? [messageId] : "ALL"),
                      modifiedCount: result.modifiedCount,
                      timestamp: new Date().toISOString(),
                      source: "MarkMessageDelivered-UseCase",
                    }),
                  },
                ],
              }));
        } catch (kErr) {
          console.warn(
            "⚠️ Erreur publication Kafka MarkMessageDelivered:",
            kErr.message
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
