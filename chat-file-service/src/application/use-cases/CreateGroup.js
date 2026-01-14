const UserCacheService = require("../../infrastructure/services/UserCacheService");

class CreateGroup {
  constructor(
    conversationRepository,
    resilientMessageService = null,
    userCacheService = null
  ) {
    this.conversationRepository = conversationRepository;
    this.resilientMessageService = resilientMessageService;
    this.userCacheService = userCacheService || new UserCacheService();
  }

  async execute({ groupId, name, adminId, members }) {
    if (
      !groupId ||
      !name ||
      !adminId ||
      !Array.isArray(members) ||
      members.length === 0
    ) {
      throw new Error("groupId, name, adminId et members requis");
    }

    // ✅ Valider l'existence des utilisateurs via UserCacheService
    const participants = [adminId, ...members.filter((id) => id !== adminId)];
    let usersInfo = [];
    try {
      console.log(
        `🔍 Validation des ${participants.length} participants du groupe...`
      );
      usersInfo = await this.userCacheService.fetchUsersInfo(participants);

      // Vérifier que tous les utilisateurs existent
      const invalidUsers = usersInfo.filter(
        (u) => u.name === "Utilisateur inconnu"
      );
      if (invalidUsers.length > 0) {
        const invalidIds = invalidUsers.map((u) => u.matricule).join(", ");
        throw new Error(`Utilisateurs invalides: ${invalidIds}`);
      }
      console.log(`✅ Tous les participants du groupe sont valides`, {
        count: usersInfo.length,
        users: usersInfo.map((u) => ({ id: u.userId, name: u.name })),
      });
    } catch (validationError) {
      console.error(
        `❌ Erreur validation participants:`,
        validationError.message
      );
      throw new Error(
        `Impossible de valider les participants: ${validationError.message}`
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
      _id: groupId,
      name,
      type: "GROUP",
      participants,
      createdBy: adminId,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessage: null,
      isActive: true,
      unreadCounts,
      userMetadata,
      metadata: {
        autoCreated: true,
        createdFrom: "CreateGroup",
        version: 1,
        tags: [],
        auditLog: [
          {
            action: "CREATED",
            userId: adminId,
            timestamp: new Date(),
            details: { trigger: "group_create" },
            metadata: { source: "CreateGroup-UseCase" },
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
        allowInvites: true,
        isPublic: false,
        maxParticipants: 200,
        messageRetention: 0,
        autoDeleteAfter: 0,
      },
    };

    const savedConversation = await this.conversationRepository.save(
      conversationData
    );

    // ✅ PUBLIER DANS REDIS STREAMS events:conversations
    if (this.resilientMessageService) {
      try {
        await this.resilientMessageService.addToStream("events:conversations", {
          event: "conversation.created",
          conversationId: savedConversation._id.toString(),
          type: "GROUP",
          createdBy: adminId,
          participants: JSON.stringify(participants),
          name: name,
          participantCount: participants.length.toString(),
          timestamp: Date.now().toString(),
        });
        console.log(
          `📤 [conversation.created] publié dans events:conversations`
        );
      } catch (streamErr) {
        console.error(
          "❌ Erreur publication stream conversation.created:",
          streamErr.message
        );
      }
    }

    // ✅ PUBLIER NOTIFICATION SYSTÈME VIA RESILIENT MESSAGE SERVICE
    if (this.resilientMessageService) {
      try {
        console.log(
          `📢 Publication notification système GROUP_CREATED pour: ${savedConversation._id}`
        );

        await this.resilientMessageService.publishSystemMessage(
          {
            conversationId: String(savedConversation._id),
            type: "SYSTEM",
            subType: "GROUP_CREATED",
            senderId: adminId,
            senderName: "Système",
            content: `Le groupe "${name}" a été créé`,
            participants: participants,
            metadata: {
              event: "group_created",
              groupName: name,
              groupId: String(savedConversation._id),
              creatorId: adminId,
              participantCount: participants.length,
              timestamp: new Date().toISOString(),
            },
          },
          {
            eventType: "GROUP_CREATED",
            stream: "stream:messages:group",
          }
        );
        console.log(
          `✅ Notification système GROUP_CREATED publiée pour: ${savedConversation._id}`
        );
      } catch (notifError) {
        console.warn(
          "⚠️ Erreur publication notification GROUP_CREATED:",
          notifError.message
        );
        // Ne pas bloquer la création si la notification échoue
      }
    }

    if (this.kafkaProducer) {
      await this.kafkaProducer.publishMessage({
        eventType: "GROUP_CREATED",
        conversationId: String(savedConversation._id),
        createdBy: adminId,
        participants,
        name,
        type: "GROUP",
        timestamp: new Date().toISOString(),
        source: "CreateGroup-UseCase",
      });
    }

    return savedConversation;
  }
}

module.exports = CreateGroup;
