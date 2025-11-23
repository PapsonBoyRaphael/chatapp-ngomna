class GetMessages {
  constructor(messageRepository) {
    // ✅ SUPPRESSION : cacheService n'est pas nécessaire
    // Le repository (CachedMessageRepository) gère tout le cache
    this.messageRepository = messageRepository;
  }

  async execute(conversationId, options = {}) {
    try {
      const { page = 1, limit = 50, userId, useCache = true } = options;

      if (!conversationId) {
        throw new Error("ID de conversation requis");
      }

      console.log(
        `🔍 GetMessages: conversation=${conversationId}, page=${page}, limit=${limit}`
      );

      // ✅ DÉLÉGATION AU REPO : CachedMessageRepository gère cache/invalidation
      // Le repo retourne { messages, fromCache }
      const result = await this.messageRepository.findByConversation(
        conversationId,
        {
          page: parseInt(page),
          limit: parseInt(limit),
          userId,
          useCache: useCache, // Option pour forcer lecture MongoDB si needed
        }
      );

      console.log(
        `✅ Messages récupérés: ${result.messages?.length || 0} (${
          result.fromCache ? "cache" : "MongoDB"
        })`
      );

      return result;
    } catch (error) {
      console.error("❌ Erreur GetMessages use case:", error);
      throw error;
    }
  }
}

module.exports = GetMessages;
