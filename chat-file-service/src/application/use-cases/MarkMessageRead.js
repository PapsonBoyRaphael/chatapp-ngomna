class MarkMessageRead {
  constructor(
    messageRepository,
    conversationRepository = null,
    kafkaProducer = null,
    resilientMessageService = null
  ) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
    this.kafkaProducer = kafkaProducer;
    this.resilientMessageService = resilientMessageService;
  }

  /**
   * params:
   *  - messageId (string) OR (conversationId + messageIds)
   *  - userId (reader)
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
      if (!userId) throw new Error("userId requis");

      let result;
      if (messageId) {
        // un message spécifique
        result = await this.messageRepository.markMessagesAsRead(
          messageId,
          userId,
          "READ"
        );
      } else {
        // mise à jour en masse
        result = await this.messageRepository.markMessagesAsRead(
          conversationId,
          userId,
          "READ",
          messageIds || []
        );
      }

      // ✅ PUBLIER DANS REDIS STREAMS events:messages
      if (this.resilientMessageService && result && result.modifiedCount > 0) {
        try {
          await this.resilientMessageService.addToStream("events:messages", {
            event: "message.read",
            conversationId: conversationId || "unknown",
            messageIds: JSON.stringify(
              messageIds || (messageId ? [messageId] : "ALL")
            ),
            readerId: userId,
            readAt: new Date().toISOString(),
            modifiedCount: result.modifiedCount.toString(),
            timestamp: Date.now().toString(),
          });
          console.log(`📤 [message.read] publié dans events:messages`);
        } catch (streamErr) {
          console.error(
            "❌ Erreur publication stream message.read:",
            streamErr.message
          );
        }
      }

      // publication Kafka
      if (this.kafkaProducer && result && result.modifiedCount > 0) {
        try {
          await (typeof this.kafkaProducer.publishMessage === "function"
            ? this.kafkaProducer.publishMessage({
                eventType: "MESSAGES_READ",
                conversationId,
                receiverId: userId,
                messageId: messageId || null,
                messageIds: messageIds || (messageId ? [messageId] : "ALL"),
                modifiedCount: result.modifiedCount,
                timestamp: new Date().toISOString(),
                source: "MarkMessageRead-UseCase",
              })
            : this.kafkaProducer.send({
                topic: "chat.message.status",
                messages: [
                  {
                    key: conversationId || messageId || userId,
                    value: JSON.stringify({
                      eventType: "MESSAGES_READ",
                      conversationId,
                      receiverId: userId,
                      messageId: messageId || null,
                      messageIds:
                        messageIds || (messageId ? [messageId] : "ALL"),
                      modifiedCount: result.modifiedCount,
                      timestamp: new Date().toISOString(),
                      source: "MarkMessageRead-UseCase",
                    }),
                  },
                ],
              }));
        } catch (kErr) {
          console.warn(
            "⚠️ Erreur publication Kafka MarkMessageRead:",
            kErr.message
          );
        }
      }

      console.log("✅ Mise à jour READ terminée:", {
        conversationId,
        messageId,
        userId,
        modifiedCount: result?.modifiedCount || 0,
        durationMs: Date.now() - start,
      });

      return result;
    } catch (error) {
      console.error("❌ Erreur MarkMessageRead use case:", error.message);
      throw error;
    }
  }
}

module.exports = MarkMessageRead;
