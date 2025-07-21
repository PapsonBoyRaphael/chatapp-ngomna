class CreateBroadcast {
  constructor(conversationRepository, kafkaProducer = null) {
    this.conversationRepository = conversationRepository;
    this.kafkaProducer = kafkaProducer;
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

    const participants = [
      ...adminIds,
      ...recipientIds.filter((id) => !adminIds.includes(id)),
    ];
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

    const savedConversation = await this.conversationRepository.save(
      conversationData
    );

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
