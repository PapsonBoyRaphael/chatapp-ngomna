/**
 * DeleteMessage - Supprime un message (pour tous ou pour soi uniquement)
 * Publie l'événement message.deleted dans Redis Streams
 */
class DeleteMessage {
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
   * Supprime un message
   * @param {Object} params
   * @param {string} params.messageId - ID du message à supprimer
   * @param {string} params.userId - ID de l'utilisateur demandant la suppression
   * @param {string} params.deleteType - "FOR_ME" ou "FOR_EVERYONE" (défaut: "FOR_ME")
   * @returns {Promise<Object>} Message mis à jour ou supprimé
   */
  async execute({ messageId, userId, deleteType = "FOR_ME" }) {
    if (!messageId || !userId) {
      throw new Error("messageId et userId sont requis");
    }

    // Récupérer le message
    const message = await this.messageRepository.findById(messageId);
    if (!message) {
      throw new Error("Message introuvable");
    }

    const conversationId = message.conversationId?.toString();
    const senderId = message.senderId?.toString();

    // Vérifier les permissions
    if (deleteType === "FOR_EVERYONE") {
      // Seul l'expéditeur peut supprimer pour tout le monde
      if (senderId !== userId) {
        throw new Error("Seul l'expéditeur peut supprimer pour tout le monde");
      }

      // Vérifier le délai (optionnel, ex: 5 minutes)
      const messageAge = Date.now() - new Date(message.createdAt).getTime();
      const maxDeleteTime = 5 * 60 * 1000; // 5 minutes
      if (messageAge > maxDeleteTime) {
        throw new Error("Délai de suppression dépassé (max 5 minutes)");
      }
    }

    let result;

    if (deleteType === "FOR_EVERYONE") {
      // Suppression pour tous : marquer comme supprimé
      message.content = "Ce message a été supprimé";
      message.isDeleted = true;
      message.deletedAt = new Date();
      message.deletedBy = userId;
      message.deletedFor = "EVERYONE";
      message.updatedAt = new Date();

      result = await this.messageRepository.save(message);
    } else {
      // Suppression pour moi uniquement : ajouter dans deletedFor
      if (!message.deletedForUsers) {
        message.deletedForUsers = [];
      }

      if (!message.deletedForUsers.includes(userId)) {
        message.deletedForUsers.push(userId);
      }

      message.updatedAt = new Date();
      result = await this.messageRepository.save(message);
    }

    // ✅ PUBLIER DANS REDIS STREAMS - STATUT DELETED
    // DELETED doit être envoyé à TOUS les participants de la conversation
    if (this.resilientMessageService) {
      try {
        // ✅ RÉCUPÉRER LES PARTICIPANTS DE LA CONVERSATION
        let conversationParticipants = [];
        if (conversationId && this.conversationRepository) {
          try {
            const conversation =
              await this.conversationRepository.findById(conversationId);
            if (conversation) {
              conversationParticipants = conversation.participants || [];
              console.log(
                `👥 [DELETED] Participants trouvés: ${conversationParticipants
                  .map((p) => p.userId || p)
                  .join(", ")}`,
              );
            }
          } catch (convError) {
            console.warn(
              "⚠️ [DELETED] Erreur récupération participants:",
              convError.message,
            );
          }
        }

        // ✅ ENVOYER LE DELETED À TOUS LES PARTICIPANTS
        await this.resilientMessageService.publishDeletedMessageToAllParticipants(
          messageId,
          conversationId,
          conversationParticipants,
        );
        console.log(`📤 [DELETED] événement publié pour message ${messageId}`);
      } catch (streamErr) {
        console.error(
          "❌ Erreur publication statut DELETED:",
          streamErr.message,
        );
      }
    }

    // Mettre à jour lastMessage de la conversation si c'était le dernier
    if (
      this.conversationRepository &&
      conversationId &&
      deleteType === "FOR_EVERYONE"
    ) {
      try {
        const conversation =
          await this.conversationRepository.findById(conversationId);
        if (conversation?.lastMessage?.messageId === messageId) {
          // Récupérer le message précédent
          const messages = await this.messageRepository.findByConversationId(
            conversationId,
            { limit: 1, sort: { createdAt: -1 } },
          );

          conversation.lastMessage = messages[0]
            ? {
                messageId: messages[0]._id,
                content: messages[0].content,
                senderId: messages[0].senderId,
                timestamp: messages[0].createdAt,
              }
            : null;

          await this.conversationRepository.save(conversation);
        }
      } catch (convErr) {
        console.warn("⚠️ Erreur mise à jour conversation:", convErr.message);
      }
    }

    return {
      success: true,
      messageId,
      deleteType,
      deletedAt: new Date(),
      message:
        deleteType === "FOR_EVERYONE"
          ? "Message supprimé pour tout le monde"
          : "Message supprimé pour vous",
    };
  }
}

module.exports = DeleteMessage;
