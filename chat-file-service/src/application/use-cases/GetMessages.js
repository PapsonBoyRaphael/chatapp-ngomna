class GetMessages {
  constructor(messageRepository, cacheService = null) {
    this.messageRepository = messageRepository;
    this.cacheService = cacheService;
    this.defaultTTL = 300; // 5 minutes
  }

  async execute(conversationId, options = {}) {
    try {
      const { page = 1, limit = 50, userId } = options;

      if (!conversationId) {
        throw new Error("ID de conversation requis");
      }

      // Vérifier le cache Redis via CacheService
      let cachedMessages = null;
      if (this.cacheService) {
        try {
          const cacheKey = `last_message:${conversationId}:${page}:${limit}`;
          cachedMessages = await this.cacheService.get(cacheKey);
          if (cachedMessages) {
            console.log(
              "✅ Messages récupérés depuis le cache:",
              cachedMessages
            );
            return {
              ...cachedMessages,
              fromCache: true,
            };
          }
        } catch (redisError) {
          console.warn("⚠️ Erreur cache Redis:", redisError.message);
        }
      }

      // Récupérer depuis la base
      const messages = await this.messageRepository.findByConversation(
        conversationId,
        {
          page: parseInt(page),
          limit: parseInt(limit),
          userId,
        }
      );

      console.log(messages);

      // Mettre en cache le résultat
      if (this.cacheService) {
        try {
          const cacheKey = `messages:${conversationId}:${page}:${limit}`;
          await this.cacheService.set(cacheKey, messages, this.defaultTTL);
        } catch (redisError) {
          console.warn("⚠️ Erreur mise en cache Redis:", redisError.message);
        }
      }

      return messages;
    } catch (error) {
      console.error("❌ Erreur GetMessages use case:", error);
      throw error;
    }
  }
}

module.exports = GetMessages;
