class CreateGroup {
  constructor(conversationRepository, kafkaProducer = null) {
    this.conversationRepository = conversationRepository;
    this.kafkaProducer = kafkaProducer;
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

    const participants = [adminId, ...members.filter((id) => id !== adminId)];
    const unreadCounts = {};
    const userMetadata = [];
    participants.forEach((pid) => {
      unreadCounts[pid] = 0;
      userMetadata.push({
        userId: pid,
        unreadCount: 0,
        lastReadAt: null,
        isMuted: false,
        isPinned: false,
        notificationSettings: {
          enabled: true,
          sound: true,
          vibration: true,
        },
      });
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
