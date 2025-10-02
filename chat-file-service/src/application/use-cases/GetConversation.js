class GetConversation {
  constructor(conversationRepository, messageRepository, cacheService = null) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.cacheService = cacheService;
    this.cacheTimeout = 300; // 5 minutes
  }

  async execute(conversationId, userId, useCache = false) {
    try {
      if (!conversationId || !userId) {
        throw new Error("conversationId et userId sont requis");
      }

      const cacheKey = `conversation:${conversationId}:${userId}`;

      // 🚀 CACHE REDIS via CacheService
      if (this.cacheService && useCache) {
        try {
          const cached = await this.cacheService.get(cacheKey);
          if (cached) {
            console.log(
              `📦 Conversation récupérée depuis Redis: ${conversationId}`
            );
            return cached;
          }
        } catch (redisError) {
          console.warn("⚠️ Erreur cache conversation:", redisError.message);
        }
      }

      const conversation = await this.conversationRepository.findById(
        conversationId
      );

      if (!conversation) {
        throw new Error("Conversation non trouvée");
      }

      // Vérifier les permissions
      if (!conversation.participants.includes(userId)) {
        throw new Error("Accès non autorisé à cette conversation");
      }

      // Enrichir avec métadonnées
      const [unreadCount, lastMessage, messageCount] = await Promise.all([
        this.messageRepository.getUnreadCount(userId, conversationId),
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

      console.log(`✅ Conversation récupérée: ${conversation.participants}`);

      // Mise en cache via CacheService
      if (this.cacheService) {
        try {
          await this.cacheService.set(cacheKey, result, this.cacheTimeout);
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
