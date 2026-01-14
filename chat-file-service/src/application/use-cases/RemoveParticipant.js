/**
 * RemoveParticipant - Retire un participant d'une conversation (groupe)
 * Publie l'événement conversation.participant.removed dans Redis Streams
 */
class RemoveParticipant {
  constructor(
    conversationRepository,
    resilientMessageService = null,
    userCacheService = null
  ) {
    this.conversationRepository = conversationRepository;
    this.resilientMessageService = resilientMessageService;
    this.userCacheService = userCacheService;
  }

  async execute({ conversationId, participantId, removedBy }) {
    if (!conversationId || !participantId || !removedBy) {
      throw new Error("conversationId, participantId et removedBy requis");
    }

    // Récupérer la conversation
    const conversation = await this.conversationRepository.findById(
      conversationId
    );
    if (!conversation) {
      throw new Error("Conversation introuvable");
    }

    // Vérifier que c'est un groupe
    if (conversation.type !== "GROUP") {
      throw new Error(
        "Seuls les groupes peuvent avoir des participants retirés"
      );
    }

    // Vérifier que l'utilisateur qui retire est l'admin ou le participant lui-même
    const isAdmin = conversation.createdBy === removedBy;
    const isSelf = participantId === removedBy;

    if (!isAdmin && !isSelf) {
      throw new Error("Seul l'admin ou le participant lui-même peut retirer");
    }

    // Vérifier que le participant est bien membre
    if (!conversation.participants.includes(participantId)) {
      throw new Error("Participant n'est pas membre du groupe");
    }

    // Ne pas permettre de retirer le créateur
    if (participantId === conversation.createdBy) {
      throw new Error("Le créateur du groupe ne peut pas être retiré");
    }

    // Récupérer les infos du participant
    let participantInfo = null;
    if (this.userCacheService) {
      try {
        const users = await this.userCacheService.fetchUsersInfo([
          participantId,
        ]);
        participantInfo = users[0];
      } catch (err) {
        console.warn(
          "⚠️ Impossible de récupérer les infos utilisateur:",
          err.message
        );
      }
    }

    // Retirer le participant
    conversation.participants = conversation.participants.filter(
      (id) => id !== participantId
    );

    // Supprimer les unreadCounts
    if (conversation.unreadCounts) {
      delete conversation.unreadCounts[participantId];
    }

    // Supprimer les métadonnées utilisateur
    if (conversation.userMetadata) {
      conversation.userMetadata = conversation.userMetadata.filter(
        (meta) => meta.userId !== participantId
      );
    }

    // Mettre à jour les stats
    if (conversation.metadata?.stats) {
      conversation.metadata.stats.totalParticipants =
        conversation.participants.length;
    }

    // Ajouter dans l'audit log
    if (conversation.metadata?.auditLog) {
      conversation.metadata.auditLog.push({
        action: isSelf ? "PARTICIPANT_LEFT" : "PARTICIPANT_REMOVED",
        userId: removedBy,
        timestamp: new Date(),
        details: { participantId },
        metadata: { source: "RemoveParticipant-UseCase" },
      });
    }

    conversation.updatedAt = new Date();

    // Sauvegarder
    const updated = await this.conversationRepository.save(conversation);

    // ✅ PUBLIER DANS REDIS STREAMS events:conversations
    if (this.resilientMessageService) {
      try {
        await this.resilientMessageService.addToStream("events:conversations", {
          event: "conversation.participant.removed",
          conversationId: conversationId.toString(),
          removedBy: removedBy,
          participantId: participantId,
          participantName: participantInfo?.name || "Utilisateur inconnu",
          removedAt: new Date().toISOString(),
          totalParticipants: conversation.participants.length.toString(),
          timestamp: Date.now().toString(),
        });
        console.log(
          `📤 [conversation.participant.removed] publié dans events:conversations`
        );
      } catch (streamErr) {
        console.error(
          "❌ Erreur publication stream participant.removed:",
          streamErr.message
        );
      }
    }

    // Publier notification système
    if (this.resilientMessageService) {
      try {
        const removedByInfo = this.userCacheService
          ? (await this.userCacheService.fetchUsersInfo([removedBy]))[0]
          : null;

        await this.resilientMessageService.publishSystemMessage({
          conversationId: conversationId.toString(),
          type: "SYSTEM",
          subType: "PARTICIPANT_REMOVED",
          senderId: removedBy,
          senderName: removedByInfo?.name || "Un membre",
          content: isSelf
            ? `${participantInfo?.name || participantId} a quitté le groupe`
            : `${removedByInfo?.name || "Un admin"} a retiré ${
                participantInfo?.name || participantId
              }`,
          metadata: {
            participantId,
            participantName: participantInfo?.name,
            isSelf,
          },
        });
      } catch (err) {
        console.warn("⚠️ Erreur publication notification:", err.message);
      }
    }

    return updated;
  }
}

module.exports = RemoveParticipant;
