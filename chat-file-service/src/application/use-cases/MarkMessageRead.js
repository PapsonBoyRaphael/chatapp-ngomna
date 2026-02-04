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
    messageId = null; // forcer l'utilisation de conversationId + messageIds pour la mise à jour en masse
    try {
      if (!userId) throw new Error("userId requis");

      let result;
      if (messageId || messageId === "") {
        // un message spécifique
        result = await this.messageRepository.markMessagesAsRead(
          messageId,
          userId,
          "READ",
        );
      } else {
        // mise à jour en masse
        result = await this.messageRepository.markMessagesAsRead(
          conversationId,
          userId,
          "READ",
          messageIds || [],
        );
      }

      // ✅ PUBLIER DANS REDIS STREAMS - STATUT READ
      if (this.resilientMessageService && result && result.modifiedCount > 0) {
        try {
          // Pour chaque message marqué comme lu, publier un événement séparé
          const messageIdsToPublish =
            messageIds || (messageId ? [messageId] : []);

          if (messageIdsToPublish.length > 0) {
            for (const msgId of messageIdsToPublish) {
              await this.resilientMessageService.publishMessageStatus(
                msgId,
                userId,
                "READ",
              );
            }
          } else {
            // Si pas de messageIds spécifiques, on ne peut pas publier d'événement individuel
            console.log(
              "ℹ️ Pas de messageIds spécifiques pour publication READ",
            );
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
