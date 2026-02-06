class MarkMessageRead {
  constructor(
    messageRepository,
    conversationRepository = null,
    kafkaProducer = null,
    resilientMessageService = null,
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
      if (messageId && messageId !== "") {
        // mise à jour specifique
        result = await this.messageRepository.updateMessageStatus(
          conversationId,
          userId,
          "READ",
          [messageId],
        );
      } else {
        // mise à jour en masse
        result = await this.messageRepository.updateMessageStatus(
          conversationId,
          userId,
          "READ",
          messageIds || [],
        );
      }

      // ✅ PUBLIER DANS REDIS STREAMS - STATUT READ
      // L'accusé de lecture est envoyé UNIQUEMENT à l'expéditeur du message
      if (this.resilientMessageService && result && result.modifiedCount > 0) {
        try {
          await this.resilientMessageService.publishMessageStatus(
            messageId,
            result.message.senderId, // ✅ À l'EXPÉDITEUR du message
            "READ",
            result.message.receiveAt,
            result.message.messageContent,
          );

          const messageIdsToPublish = messageIds ? messageIds : [];

          if (messageIdsToPublish.length > 0) {
            // Pour chaque message marqué comme lu, publier un événement séparé à l'expéditeur
            for (const msgId of messageIdsToPublish) {
              await this.resilientMessageService.publishMessageStatus(
                msgId,
                result.senderId, // ✅ À l'EXPÉDITEUR du message
                "READ",
              );
            }
          }

          console.log(
            `📤 [READ] événements publiés pour ${messageIdsToPublish.length} messages`,
          );
        } catch (streamErr) {
          console.error(
            "❌ Erreur publication statuts READ:",
            streamErr.message,
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
