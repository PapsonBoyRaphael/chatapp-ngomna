class GetConversation {
  constructor(conversationRepository, messageRepository, redisClient = null) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.redisClient = redisClient;
    this.cacheTimeout = 300; // 5 minutes
  }

  async execute(conversationId, userId, useCache = true) {
    try {
      if (!conversationId || !userId) {
        throw new Error("conversationId et userId sont requis");
      }

      const cacheKey = `conversation:${conversationId}:${userId}`;

      // 🚀 CACHE REDIS
      if (this.redisClient && useCache) {
        try {
          const cached = await this.redisClient.get(cacheKey);
          if (cached) {
            console.log(
              `📦 Conversation récupérée depuis Redis: ${conversationId}`
            );
            return JSON.parse(cached);
          }
        } catch (redisError) {
          console.warn("⚠️ Erreur cache conversation:", redisError.message);
        }
      }

      const conversation =
        await this.conversationRepository.getConversationById(conversationId);

      if (!conversation) {
        throw new Error("Conversation non trouvée");
      }

      // Vérifier les permissions
      if (!conversation.participants.includes(userId)) {
        throw new Error("Accès non autorisé à cette conversation");
      }

      // Enrichir avec métadonnées
      const [unreadCount, lastMessage, messageCount] = await Promise.all([
        this.messageRepository.getUnreadMessagesCount(conversationId, userId),
        this.messageRepository.getLastMessage(conversationId),
        this.messageRepository.getMessageCount(conversationId),
      ]);

      const result = {
        ...conversation,
        unreadCount,
        lastMessage,
        messageCount,
        isActive: messageCount > 0,
        retrievedAt: new Date().toISOString(),
      };

      // Mise en cache
      if (this.redisClient) {
        try {
          await this.redisClient.setex(
            cacheKey,
            this.cacheTimeout,
            JSON.stringify(result)
          );
        } catch (redisError) {
          console.warn(
            "⚠️ Erreur mise en cache conversation:",
            redisError.message
          );
        }
      }

      return result;
    } catch (error) {
      console.error("❌ Erreur GetConversation:", error);
      throw error;
    }
  }
}

module.exports = GetConversation;
