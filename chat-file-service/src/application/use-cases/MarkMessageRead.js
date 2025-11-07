class MarkMessageRead {
  constructor(
    messageRepository,
    conversationRepository = null,
    kafkaProducer = null,
    cacheService = null
  ) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
    this.kafkaProducer = kafkaProducer;
    this.cacheService = cacheService;
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
        result = await this.messageRepository.updateSingleMessageStatus(
          messageId,
          userId,
          "READ"
        );
      } else {
        // mise à jour en masse
        result = await this.messageRepository.updateMessageStatus(
          conversationId,
          userId,
          "READ",
          messageIds || []
        );
      }

      // invalider cache si modifié
      if (this.cacheService && result && result.modifiedCount > 0) {
        try {
          if (messageId) await this.cacheService.del(`msg:${messageId}`);
          if (conversationId) {
            await this.cacheService.del(`messages:${conversationId}:*`);
            await this.cacheService.del(`conversation:${conversationId}`);
          }
          await this.cacheService.del(`conversations:${userId}`);
        } catch (cacheErr) {
          console.warn(
            "⚠️ Erreur invalidation cache MarkMessageRead:",
            cacheErr.message
          );
        }
      }

      // réinitialiser compteur non-lus si bulk ou single succeeded
      if (this.conversationRepository && result && result.modifiedCount > 0) {
        try {
          // si conversationId absent mais messageId présent, tenter de récupérer la conversationId via repo (si méthode existante)
          let convId = conversationId;
          if (
            !convId &&
            messageId &&
            typeof this.messageRepository.findById === "function"
          ) {
            const msg = await this.messageRepository.findById(messageId);
            convId = msg?.conversationId || conversationId;
          }
          if (convId) {
            await this.conversationRepository.resetUnreadCountInUserMetadata(
              convId,
              userId
            );
          }
        } catch (convErr) {
          console.warn(
            "⚠️ Erreur réinitialisation compteur unread après READ:",
            convErr.message
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
