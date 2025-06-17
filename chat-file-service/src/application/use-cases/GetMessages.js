class GetMessages {
  constructor(messageRepository, redisClient = null) {
    this.messageRepository = messageRepository;
    this.redisClient = redisClient;
  }

  async execute(conversationId, options = {}) {
    try {
      const { page = 1, limit = 50, userId } = options;

      if (!conversationId) {
        throw new Error('ID de conversation requis');
      }

      // Vérifier le cache Redis
      let cachedMessages = null;
      if (this.redisClient) {
        try {
          const cacheKey = `messages:${conversationId}:${page}:${limit}`;
          const cached = await this.redisClient.get(cacheKey);
          if (cached) {
            cachedMessages = JSON.parse(cached);
            return {
              ...cachedMessages,
              fromCache: true
            };
          }
        } catch (redisError) {
          console.warn('⚠️ Erreur cache Redis:', redisError.message);
        }
      }

      // Récupérer depuis la base
      const messages = await this.messageRepository.findByConversationId(
        conversationId,
        {
          page: parseInt(page),
          limit: parseInt(limit),
          sort: { timestamp: -1 }
        }
      );

      const totalCount = await this.messageRepository.countByConversationId(conversationId);

      const result = {
        messages: messages.map(msg => ({
          id: msg.id,
          content: msg.content,
          senderId: msg.senderId,
          conversationId: msg.conversationId,
          type: msg.type || 'TEXT',
          status: msg.status || 'SENT',
          timestamp: msg.timestamp,
          createdAt: msg.createdAt,
          updatedAt: msg.updatedAt
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        },
        fromCache: false
      };

      // Mettre en cache
      if (this.redisClient && messages.length > 0) {
        try {
          const cacheKey = `messages:${conversationId}:${page}:${limit}`;
          await this.redisClient.setex(cacheKey, 300, JSON.stringify(result)); // 5 minutes
        } catch (redisError) {
          console.warn('⚠️ Erreur mise en cache:', redisError.message);
        }
      }

      return result;

    } catch (error) {
      console.error('❌ Erreur GetMessages use case:', error);
      throw error;
    }
  }
}

module.exports = GetMessages;
