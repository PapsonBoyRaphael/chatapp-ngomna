class GetMessages {
  constructor(messageRepository, redisClient = null) {
    this.messageRepository = messageRepository;
    this.redisClient = redisClient;
    this.cacheTimeout = 300; // 5 minutes
  }

  async execute({
    conversationId,
    userId,
    page = 1,
    limit = 50,
    useCache = true,
  }) {
    try {
      // Validation renforcée
      if (!conversationId || !userId) {
        throw new Error("conversationId et userId sont requis");
      }

      // Validation pagination
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(10, parseInt(limit))); // Max 100, min 10

      const cacheKey = `messages:${conversationId}:${userId}:${pageNum}:${limitNum}`;

      // 🚀 TENTATIVE DE RÉCUPÉRATION DEPUIS REDIS
      if (this.redisClient && useCache) {
        try {
          const cachedMessages = await this.redisClient.get(cacheKey);
          if (cachedMessages) {
            console.log(
              `📦 Messages récupérés depuis Redis: ${conversationId}`
            );
            return JSON.parse(cachedMessages);
          }
        } catch (redisError) {
          console.warn(
            "⚠️ Erreur lecture cache Redis (non bloquant):",
            redisError.message
          );
        }
      }

      // Récupération depuis la base de données avec pagination
      const messages = await this.messageRepository.getMessagesByConversationId(
        conversationId,
        {
          page: pageNum,
          limit: limitNum,
          userId, // Pour filtrer les permissions si nécessaire
        }
      );

      // Enrichir les messages avec des métadonnées
      const enrichedMessages = messages.map((message) => ({
        ...message,
        isOwn: message.senderId === userId,
        isRead: message.status === "READ" || message.senderId === userId,
        isDelivered:
          message.status === "delivered" ||
          message.status === "read" ||
          message.senderId === userId,
        formattedDate: new Date(message.createdAt).toLocaleString(),
      }));

      const result = {
        messages: enrichedMessages,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: enrichedMessages.length,
          hasMore: enrichedMessages.length === limitNum,
        },
        conversationId,
        retrievedAt: new Date().toISOString(),
      };

      // 🚀 MISE EN CACHE REDIS
      if (this.redisClient && enrichedMessages.length > 0) {
        try {
          await this.redisClient.setex(
            cacheKey,
            this.cacheTimeout,
            JSON.stringify(result)
          );
          console.log(`💾 Messages mis en cache Redis: ${conversationId}`);
        } catch (redisError) {
          console.warn(
            "⚠️ Erreur mise en cache Redis (non bloquant):",
            redisError.message
          );
        }
      }

      return result;
    } catch (error) {
      console.error("❌ Erreur GetMessages:", error);
      throw error;
    }
  }

  // Méthode pour invalider le cache
  async invalidateCache(conversationId, userId) {
    if (!this.redisClient) return;

    try {
      // Invalider tous les caches de pagination pour cette conversation
      const pattern = `messages:${conversationId}:${userId}:*`;
      const keys = await this.redisClient.keys(pattern);

      if (keys.length > 0) {
        await this.redisClient.del(keys);
        console.log(
          `🗑️ Cache invalidé pour ${conversationId}: ${keys.length} clés`
        );
      }
    } catch (error) {
      console.warn("⚠️ Erreur invalidation cache:", error.message);
    }
  }
}

module.exports = GetMessages;
