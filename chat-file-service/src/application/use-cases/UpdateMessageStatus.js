class UpdateMessageStatus {
  constructor(messageRepository, conversationRepository, kafkaProducer = null) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
    this.kafkaProducer = kafkaProducer;
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

      // ✅ NOUVELLE VALIDATION : receiverId et status sont obligatoires, le reste est optionnel
      if (!receiverId || !status) {
        throw new Error("receiverId et status sont requis");
      }

      const validStatuses = ["SENT", "DELIVERED", "READ"];
      if (!validStatuses.includes(status)) {
        throw new Error(
          `Status invalide. Valeurs acceptées: ${validStatuses.join(", ")}`
        );
      }

      // ✅ UTILISER LA MÉTHODE APPROPRIÉE DU REPOSITORY
      let result;

      if (messageIds && messageIds.length === 1) {
        // ✅ CAS SPÉCIAL : UN SEUL MESSAGE - UTILISER updateSingleMessageStatus
        console.log(`🎯 Mise à jour d'un seul message: ${messageIds[0]}`);
        result = await this.messageRepository.updateSingleMessageStatus(
          messageIds[0],
          receiverId,
          status
        );
      } else {
        // ✅ CAS GÉNÉRAL : PLUSIEURS MESSAGES OU TOUS LES MESSAGES
        // conversationId ou messageIds peuvent être null, le repository doit gérer ce cas
        console.log(`📚 Mise à jour multiple de messages`);
        result = await this.messageRepository.updateMessageStatus(
          conversationId,
          receiverId,
          status,
          messageIds || []
        );
      }

      // ✅ NORMALISER LE RÉSULTAT
      const normalizedResult = {
        conversationId,
        receiverId,
        status,
        modifiedCount: result.modifiedCount || 0,
        matchedCount: result.matchedCount || 0,
        timestamp: new Date().toISOString(),
        success: (result.modifiedCount || 0) > 0,
      };

      console.log(`✅ Mise à jour statut terminée:`, normalizedResult);

      // ✅ PUBLIER DANS KAFKA SI DES MESSAGES ONT ÉTÉ MODIFIÉS
      if (this.kafkaProducer && normalizedResult.modifiedCount > 0) {
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
            modifiedCount: normalizedResult.modifiedCount,
            messageIds: messageIds || "ALL",
            timestamp: normalizedResult.timestamp,
            source: "UpdateMessageStatus-UseCase",
          });

          console.log(
            `📤 Statut publié dans Kafka: ${eventType} - ${normalizedResult.modifiedCount} messages`
          );
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication statut Kafka (non bloquant):",
            kafkaError.message
          );
        }
      }

      // ✅ METTRE À JOUR LES STATISTIQUES DE LA CONVERSATION SI NÉCESSAIRE
      if (
        normalizedResult.modifiedCount > 0 &&
        status === "READ" &&
        this.conversationRepository
      ) {
        try {
          await this.conversationRepository.updateUnreadCount(
            conversationId,
            receiverId
          );
          console.log(
            `📊 Compteur non-lus mis à jour pour conversation ${conversationId}`
          );
        } catch (error) {
          console.warn(
            "⚠️ Erreur mise à jour compteur non-lus:",
            error.message
          );
        }
      }

      return normalizedResult;
    } catch (error) {
      console.error("❌ Erreur UpdateMessageStatus:", error);
      throw new Error(`Échec mise à jour statut: ${error.message}`);
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

      // ✅ VALIDATION DES PARAMÈTRES
      if (!messageId || !receiverId || !status) {
        throw new Error("messageId, receiverId et status sont requis");
      }

      const validStatuses = ["SENT", "DELIVERED", "READ", "FAILED"];
      if (!validStatuses.includes(status)) {
        throw new Error(
          `Status invalide. Valeurs acceptées: ${validStatuses.join(", ")}`
        );
      }

      // ✅ UTILISER LA NOUVELLE MÉTHODE DU REPOSITORY
      const result = await this.messageRepository.updateSingleMessageStatus(
        messageId,
        receiverId,
        status
      );

      console.log(`✅ Résultat marquage message unique:`, {
        messageId,
        status,
        modifiedCount: result.modifiedCount,
        success: result.modifiedCount > 0,
      });

      // ✅ PUBLIER DANS KAFKA SI MODIFICATION RÉUSSIE
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
      console.error("❌ Erreur marquage message unique:", error);
      throw new Error(`Impossible de marquer le message: ${error.message}`);
    }
  }
}

module.exports = UpdateMessageStatus;
