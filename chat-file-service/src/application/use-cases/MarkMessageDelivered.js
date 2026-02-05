class MarkMessageDelivered {
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
      messageId = null; // forcer l'utilisation de conversationId + messageIds

      // ✅ CAS 1 : UN SEUL MESSAGE
      if (messageId) {
        console.log(
          `📬 Marquage UN seul message: ${messageId} comme DELIVERED`,
        );
        result = await this.messageRepository.updateSingleMessageStatus(
          messageId,
          userId,
          "DELIVERED",
        );
      }
      // ✅ CAS 2 : TOUS LES MESSAGES D'UNE CONVERSATION
      else if (conversationId && !messageIds) {
        console.log(
          `📬 Marquage TOUS messages conversation ${conversationId} comme DELIVERED`,
        );
        result = await this.messageRepository.updateMessageStatus(
          conversationId,
          userId,
          "DELIVERED",
          [], // messageIds vide = tous les messages
        );
      }
      // ✅ CAS 3 : MESSAGES SPÉCIFIQUES
      else if (conversationId && messageIds) {
        console.log(
          `📬 Marquage ${messageIds.length} messages spécifiques comme DELIVERED`,
        );
        result = await this.messageRepository.updateMessageStatus(
          conversationId,
          userId,
          "DELIVERED",
          messageIds,
        );
      } else {
        throw new Error(
          "Doit avoir soit messageId, soit conversationId avec ou sans messageIds",
        );
      }

      console.log("✅ Mise à jour DELIVERED terminée:", {
        conversationId,
        messageId,
        userId,
        modifiedCount: result?.modifiedCount || 0,
        durationMs: Date.now() - start,
      });

      // ✅ PUBLIER DANS REDIS STREAMS - STATUT DELIVERED
      if (this.resilientMessageService && result && result.modifiedCount > 0) {
        try {
          console.log(
            `🔍 MarkMessageDelivered - Vérifications avant publication:`,
            {
              resilientMessageService: !!this.resilientMessageService,
              result: !!result,
              modifiedCount: result?.modifiedCount || 0,
              messageId,
              messageIds: messageIds?.length || 0,
              conversationId,
              userId,
            },
          );

          // Pour les messages individuels, publier un événement par message
          if (messageId) {
            console.log(
              `📤 MarkMessageDelivered: Publication pour messageId ${messageId}`,
            );
            await this.resilientMessageService.publishMessageStatus(
              messageId,
              userId,
              "DELIVERED",
            );
          } else if (messageIds && messageIds.length > 0) {
            // Pour les messages spécifiques
            console.log(
              `📤 MarkMessageDelivered: Publication pour ${messageIds.length} messages spécifiques`,
            );
            for (const msgId of messageIds) {
              console.log(`  - Publication pour messageId: ${msgId}`);
              await this.resilientMessageService.publishMessageStatus(
                msgId,
                userId,
                "DELIVERED",
              );
            }
          } else {
            // Pour tous les messages d'une conversation, publier un événement en masse
            console.log(
              "ℹ️ DELIVERED en masse - publication d'un événement agrégé",
            );
            try {
              console.log(
                `📡 Appel publishBulkMessageStatus pour conversation: ${conversationId}, userId: ${userId}, count: ${result?.modifiedCount || 0}`,
              );
              await this.resilientMessageService.publishBulkMessageStatus(
                conversationId,
                userId,
                "DELIVERED",
                result?.modifiedCount || 0,
              );
              console.log(`✅ Événement en masse publié avec succès`);
            } catch (bulkErr) {
              console.error(
                `❌ Erreur publication bulk DELIVERED: ${bulkErr.message}`,
              );
            }
          }

          console.log(`✅ [DELIVERED] événements publiés COMPLÉTÉ`);
        } catch (streamErr) {
          console.error(
            "❌ Erreur publication statuts DELIVERED:",
            streamErr.message,
          );
          console.error("Stack trace:", streamErr.stack);
        }
      } else {
        console.log(`⚠️ Pas de publication DELIVERED:`, {
          hasResilientMessageService: !!this.resilientMessageService,
          hasResult: !!result,
          modifiedCount: result?.modifiedCount || 0,
        });
      }

      return result;
    } catch (error) {
      console.error("❌ Erreur MarkMessageDelivered use case:", error.message);
      throw error;
    }
  }
}

module.exports = MarkMessageDelivered;
