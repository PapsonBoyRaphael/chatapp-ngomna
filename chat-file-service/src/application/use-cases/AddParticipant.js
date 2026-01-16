/**
 * AddParticipant - Ajoute un participant à une conversation (groupe)
 * Publie l'événement conversation.participant.added dans Redis Streams
 */
class AddParticipant {
  constructor(
    conversationRepository,
    resilientMessageService = null,
    userCacheService = null
  ) {
    this.conversationRepository = conversationRepository;
    this.resilientMessageService = resilientMessageService;
    this.userCacheService = userCacheService;
  }

  async execute({ conversationId, participantId, addedBy }) {
    if (!conversationId || !participantId || !addedBy) {
      throw new Error("conversationId, participantId et addedBy requis");
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
        "Seuls les groupes peuvent avoir des participants ajoutés"
      );
    }

    // Vérifier que l'utilisateur qui ajoute est membre
    if (!conversation.participants.includes(addedBy)) {
      throw new Error("Seul un membre peut ajouter des participants");
    }

    // Vérifier que le participant n'est pas déjà membre
    if (conversation.participants.includes(participantId)) {
      throw new Error("Participant déjà membre du groupe");
    }

    // Récupérer les infos du nouveau participant
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

    // Ajouter le participant
    conversation.participants.push(participantId);
    conversation.unreadCounts = conversation.unreadCounts || {};
    conversation.unreadCounts[participantId] = 0;

    // Ajouter les métadonnées utilisateur
    if (!conversation.userMetadata) {
      conversation.userMetadata = [];
    }

    conversation.userMetadata.push({
      userId: participantId,
      unreadCount: 0,
      lastReadAt: null,
      isMuted: false,
      isPinned: false,
      customName: null,
      notificationSettings: {
        enabled: true,
        sound: true,
        vibration: true,
      },
      // ✅ Utiliser les champs corrects du schéma
      nom: participantInfo?.nom || null,
      prenom: participantInfo?.prenom || null,
      sexe: participantInfo?.sexe || null,
      avatar: participantInfo?.avatar || null,
      departement: participantInfo?.departement || null,
      ministere: participantInfo?.ministere || null,
    });

    // Mettre à jour les stats
    if (conversation.metadata?.stats) {
      conversation.metadata.stats.totalParticipants =
        conversation.participants.length;
    }

    // Ajouter dans l'audit log
    if (conversation.metadata?.auditLog) {
      conversation.metadata.auditLog.push({
        action: "PARTICIPANT_ADDED",
        userId: addedBy,
        timestamp: new Date(),
        details: { participantId },
        metadata: { source: "AddParticipant-UseCase" },
      });
    }

    conversation.updatedAt = new Date();

    // Sauvegarder
    const updated = await this.conversationRepository.save(conversation);

    // ✅ PUBLIER DANS REDIS STREAMS events:conversations
    if (this.resilientMessageService) {
      try {
        await this.resilientMessageService.addToStream("events:conversations", {
          event: "conversation.participant.added",
          conversationId: conversationId.toString(),
          addedBy: addedBy,
          participantId: participantId,
          participantName: participantInfo?.name || "Utilisateur inconnu",
          addedAt: new Date().toISOString(),
          totalParticipants: conversation.participants.length.toString(),
          timestamp: Date.now().toString(),
        });
        console.log(
          `📤 [conversation.participant.added] publié dans events:conversations`
        );
      } catch (streamErr) {
        console.error(
          "❌ Erreur publication stream participant.added:",
          streamErr.message
        );
      }
    }

    // Publier notification système
    if (this.resilientMessageService) {
      try {
        const addedByInfo = this.userCacheService
          ? (await this.userCacheService.fetchUsersInfo([addedBy]))[0]
          : null;

        await this.resilientMessageService.publishSystemMessage({
          conversationId: conversationId.toString(),
          type: "SYSTEM",
          subType: "PARTICIPANT_ADDED",
          senderId: addedBy,
          senderName: addedByInfo?.name || "Un membre",
          content: `${addedByInfo?.name || "Un membre"} a ajouté ${
            participantInfo?.name || participantId
          }`,
          metadata: {
            participantId,
            participantName: participantInfo?.name,
          },
        });
      } catch (err) {
        console.warn("⚠️ Erreur publication notification:", err.message);
      }
    }

    return updated;
  }
}

module.exports = AddParticipant;
