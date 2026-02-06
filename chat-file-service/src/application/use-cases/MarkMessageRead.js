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
      // ✅ VALIDATION : userId EST REQUIS
      if (!userId) {
        throw new Error("userId (reader) requis");
      }

      console.log(`📬 MarkMessageRead.execute():`, {
        messageId,
        conversationId,
        messageIdsCount: messageIds?.length || 0,
        userId,
      });

      let result;

      // ✅ CAS 1 : UN SEUL MESSAGE
      if (messageId) {
        console.log(`📬 Marquage UN seul message: ${messageId} comme READ`);
        result = await this.messageRepository.updateSingleMessageStatus(
          messageId,
          userId,
          "READ",
        );
      }
      // ✅ CAS 3 : MESSAGES SPÉCIFIQUES
      else if (conversationId && messageIds) {
        console.log(
          `📬 Marquage ${messageIds.length} messages spécifiques comme READ`,
        );
        result = await this.messageRepository.updateMessageStatus(
          conversationId,
          userId,
          "READ",
          messageIds,
        );
      } else {
        throw new Error(
          "Doit avoir soit messageId, soit conversationId avec ou sans messageIds",
        );
      }

      console.log("✅ Mise à jour READ terminée:", {
        conversationId,
        messageId,
        userId,
        modifiedCount: result?.modifiedCount || 0,
        durationMs: Date.now() - start,
      });

      // ✅ RÉINITIALISER LE COMPTEUR userMetadata.unreadCount DANS MONGODB
      if (result && result.modifiedCount > 0 && this.conversationRepository) {
        try {
          const targetConvId = conversationId || result.message?.conversationId;
          if (targetConvId) {
            await this.conversationRepository.resetUnreadCountInUserMetadata(
              targetConvId,
              userId,
            );
            console.log(`✅ Compteur userMetadata réinitialisé pour ${userId}`);
          }
        } catch (resetError) {
          console.error(
            `❌ Erreur réinitialisation compteur userMetadata:`,
            resetError.message,
          );
          // Ne pas faire échouer la mise à jour du statut si la réinitialisation échoue
        }
      }

      // ✅ PUBLIER DANS REDIS STREAMS - STATUT READ
      // L'accusé de lecture est envoyé UNIQUEMENT à l'expéditeur du message
      if (this.resilientMessageService && result && result.modifiedCount > 0) {
        try {
          // Pour les messages individuels, publier un événement par message
          if (messageId && result.message) {
            await this.resilientMessageService.publishMessageStatus(
              messageId,
              result.message.senderId, // ✅ À l'EXPÉDITEUR du message
              "READ",
              result.message.readAt || result.message.receivedAt || null,
              null,
              null,
            );
          } else if (messageIds && messageIds.length > 0) {
            // Pour chaque message marqué comme lu, publier un événement séparé à l'expéditeur
            for (const msgId of messageIds) {
              const message = await this.messageRepository.findById(msgId);
              if (!message) continue;
              await this.resilientMessageService.publishMessageStatus(
                msgId,
                message.senderId, // ✅ À l'EXPÉDITEUR du message
                "READ",
                message.readAt || null,
                null,
                null,
              );
            }
          }

          console.log(`📤 [READ] événements publiés`);
        } catch (streamErr) {
          console.error(
            "❌ Erreur publication statuts READ:",
            streamErr.message,
          );
        }
      }

      return result;
    } catch (error) {
      console.error("❌ Erreur MarkMessageRead use case:", error.message);
      throw error;
    }
  }
}

module.exports = MarkMessageRead;
