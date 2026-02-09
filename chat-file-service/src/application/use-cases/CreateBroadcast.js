const UserCacheService = require("../../infrastructure/services/UserCacheService");

class CreateBroadcast {
  constructor(
    conversationRepository,
    resilientMessageService = null,
    userCacheService = null,
  ) {
    this.conversationRepository = conversationRepository;
    this.resilientMessageService = resilientMessageService;
    this.userCacheService = userCacheService || new UserCacheService();
  }

  async execute({ broadcastId, name, adminIds, recipientIds }) {
    if (
      !broadcastId ||
      !name ||
      !Array.isArray(adminIds) ||
      adminIds.length === 0 ||
      !Array.isArray(recipientIds) ||
      recipientIds.length === 0
    ) {
      throw new Error("broadcastId, name, adminIds et recipientIds requis");
    }

    // ✅ Valider l'existence des utilisateurs via UserCacheService
    const participants = [
      ...adminIds,
      ...recipientIds.filter((id) => !adminIds.includes(id)),
    ];
    let usersInfo = [];
    try {
      console.log(
        `🔍 Validation des ${participants.length} participants du broadcast...`,
      );
      usersInfo = await this.userCacheService.fetchUsersInfo(participants);

      // Vérifier que tous les utilisateurs existent
      const invalidUsers = usersInfo.filter(
        (u) => u.name === "Utilisateur inconnu",
      );
      if (invalidUsers.length > 0) {
        const invalidIds = invalidUsers.map((u) => u.matricule).join(", ");
        throw new Error(`Utilisateurs invalides: ${invalidIds}`);
      }
      console.log(`✅ Tous les participants du broadcast sont valides`, {
        count: usersInfo.length,
        admins: adminIds.length,
        recipients: recipientIds.length,
        users: usersInfo.map((u) => ({ id: u.userId, name: u.name })),
      });
    } catch (validationError) {
      console.error(
        `❌ Erreur validation participants:`,
        validationError.message,
      );
      throw new Error(
        `Impossible de valider les participants: ${validationError.message}`,
      );
    }

    // ✅ CRÉER userMetadata AVEC LES INFOS UTILISATEURS
    const unreadCounts = {};
    const userMetadata = participants.map((participantId) => {
      const userInfo = usersInfo.find((u) => u.userId === participantId) || {
        userId: participantId,
        name: "Utilisateur inconnu",
        avatar: null,
        matricule: participantId,
        departement: null,
        ministere: null,
      };

      unreadCounts[participantId] = 0;

      return {
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
        // ✅ POPULATED À PARTIR DE UserCacheService
        name: userInfo.name,
        avatar: userInfo.avatar,
        departement: userInfo.departement || null,
        ministere: userInfo.ministere || null,
      };
    });

    const conversationData = {
      _id: broadcastId,
      name,
      type: "BROADCAST",
      participants,
      createdBy: adminIds[0],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessage: null,
      isActive: true,
      unreadCounts,
      userMetadata,
      metadata: {
        autoCreated: true,
        createdFrom: "CreateBroadcast",
        version: 1,
        tags: [],
        auditLog: [
          {
            action: "CREATED",
            userId: adminIds[0],
            timestamp: new Date(),
            details: { trigger: "broadcast_create" },
            metadata: { source: "CreateBroadcast-UseCase" },
          },
        ],
        stats: {
          totalMessages: 0,
          totalFiles: 0,
          totalParticipants: participants.length,
          lastActivity: new Date(),
        },
      },
      settings: {
        allowInvites: false,
        isPublic: false,
        maxParticipants: 200,
        messageRetention: 0,
        autoDeleteAfter: 0,
        broadcastAdmins: adminIds,
        broadcastRecipients: recipientIds,
      },
    };

    const savedConversation =
      await this.conversationRepository.save(conversationData);

    // ✅ PUBLIER NOTIFICATION SYSTÈME VIA RESILIENT MESSAGE SERVICE
    if (this.resilientMessageService) {
      try {
        console.log(
          `📢 Publication notification système BROADCAST_CREATED pour: ${savedConversation._id}`,
        );

        await this.resilientMessageService.publishSystemMessage(
          {
            conversationId: String(savedConversation._id),
            type: "SYSTEM",
            subType: "BROADCAST_CREATED",
            senderId: adminIds[0],
            senderName: "Système",
            content: `La liste de diffusion "${name}" a été créée`,
            participants: participants,
            metadata: {
              event: "broadcast_created",
              broadcastName: name,
              broadcastId: String(savedConversation._id),
              creatorId: adminIds[0],
              adminIds: adminIds,
              recipientIds: recipientIds,
              participantCount: participants.length,
              timestamp: new Date().toISOString(),
            },
          },
          {
            eventType: "BROADCAST_CREATED",
            stream: "chat:stream:messages:group", // Utilise le même stream que groupe
          },
        );
        console.log(
          `✅ Notification système BROADCAST_CREATED publiée pour: ${savedConversation._id}`,
        );
      } catch (notifError) {
        console.warn(
          "⚠️ Erreur publication notification BROADCAST_CREATED:",
          notifError.message,
        );
        // Ne pas bloquer la création si la notification échoue
      }
    }

    if (this.kafkaProducer) {
      await this.kafkaProducer.publishMessage({
        eventType: "BROADCAST_CREATED",
        conversationId: String(savedConversation._id),
        createdBy: adminIds[0],
        participants,
        name,
        type: "BROADCAST",
        timestamp: new Date().toISOString(),
        source: "CreateBroadcast-UseCase",
      });
    }

    return savedConversation;
  }
}

module.exports = CreateBroadcast;
