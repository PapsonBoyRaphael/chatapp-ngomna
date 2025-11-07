/**
 * CachedMessageRepository - Repository pattern avec cache Redis
 * Gère la cohérence entre MongoDB et Redis pour les messages
 */
class CachedMessageRepository {
  constructor(messageRepository, cacheService, unreadManager) {
    this.primaryStore = messageRepository;
    this.cache = cacheService;
    this.unreadManager = unreadManager;
    this.defaultTTL = 3600; // 1 heure
    this.shortTTL = 300; // 5 minutes
  }

  // Récupérer les messages d'une conversation avec cache
  async findByConversation(conversationId, options = {}) {
    const { page = 1, limit = 50, userId, useCache = true } = options;
    const cacheKey = `messages:${conversationId}:p${page}:l${limit}`;

    try {
      // 1. Tentative de récupération depuis le cache
      if (useCache && this.cache) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          console.log(`📦 Messages depuis cache: ${conversationId}`);
          return { messages: cached, fromCache: true };
        }
      }

      // 2. Cache miss - Lecture depuis MongoDB
      console.log(`🔍 Lecture messages depuis MongoDB: ${conversationId}`);
      const messages = await this.primaryStore.findByConversation(
        conversationId,
        {
          page: parseInt(page),
          limit: parseInt(limit),
          userId,
        }
      );

      // 3. Mise en cache asynchrone
      if (useCache && this.cache && messages.length > 0) {
        await this.cache.set(cacheKey, messages, this.shortTTL);
      }

      return { messages, fromCache: false };
    } catch (error) {
      console.error("❌ Erreur findByConversation:", error);
      throw error;
    }
  }

  // Récupérer et mettre en cache les derniers messages
  async getLastMessagesWithPreload(conversationId, limit = 50) {
    const cacheKey = `last_messages:${conversationId}`;

    try {
      // 1. Vérifier le cache
      let messages = await this.cache.get(cacheKey);

      if (!messages) {
        // 2. Cache miss - Charger depuis MongoDB
        messages = await this.primaryStore.findByConversation(conversationId, {
          page: 1,
          limit,
          useCache: false,
        });

        if (messages.length > 0) {
          // 3. Mise en cache avec TTL plus long
          await this.cache.set(cacheKey, messages, this.defaultTTL);

          // 4. Pré-chargement asynchrone des métadonnées
          this.preloadUserMetadata(messages);
        }
      } else {
        // 5. Renouvellement du TTL et vérification de fraîcheur
        await this.cache.renewTTL(cacheKey, this.defaultTTL);
        this.backgroundFreshnessCheck(conversationId, messages);
      }

      return messages;
    } catch (error) {
      console.error("❌ Erreur getLastMessages:", error);
      return this.primaryStore.findByConversation(conversationId, {
        page: 1,
        limit,
        useCache: false,
      });
    }
  }

  // Marquer les messages comme lus avec mise à jour du cache
  async markMessagesAsRead(conversationId, userId, messageIds = null) {
    try {
      // 1. Mise à jour dans MongoDB
      const result = await this.primaryStore.updateMessageStatus(
        conversationId,
        userId,
        "READ",
        messageIds
      );

      if (result.modifiedCount > 0) {
        // 2. Réinitialiser le compteur non-lus
        if (this.unreadManager) {
          await this.unreadManager.resetUnreadCount(conversationId, userId);
        }

        // 3. Invalider les caches associés
        await this.invalidateConversationCaches(conversationId);
      }

      return result;
    } catch (error) {
      console.error("❌ Erreur markMessagesAsRead:", error);
      throw error;
    }
  }

  // Marquer les messages comme livrés
  async markMessagesAsDelivered(conversationId, userId, messageIds = null) {
    try {
      const result = await this.primaryStore.updateMessageStatus(
        conversationId,
        userId,
        "DELIVERED",
        messageIds
      );

      if (result.modifiedCount > 0) {
        await this.invalidateConversationCaches(conversationId);
      }

      return result;
    } catch (error) {
      console.error("❌ Erreur markMessagesAsDelivered:", error);
      throw error;
    }
  }

  // Pré-chargement des métadonnées utilisateur
  async preloadUserMetadata(messages) {
    if (!this.cache) return;

    const uniqueUserIds = [...new Set(messages.map((msg) => msg.senderId))];

    for (const userId of uniqueUserIds) {
      try {
        const userCacheKey = `user:${userId}`;
        await this.cache.renewTTL(userCacheKey, 1800);
      } catch (error) {
        console.warn(
          `⚠️ Erreur préchargement metadata ${userId}:`,
          error.message
        );
      }
    }
  }

  // Vérification différée de la fraîcheur du cache
  async backgroundFreshnessCheck(conversationId, cachedMessages) {
    setTimeout(async () => {
      try {
        const latestMessage = await this.primaryStore.getLastMessage(
          conversationId
        );

        if (
          latestMessage &&
          cachedMessages[0] &&
          latestMessage._id.toString() !== cachedMessages[0]._id.toString()
        ) {
          const freshMessages = await this.primaryStore.findByConversation(
            conversationId,
            { page: 1, limit: 50, useCache: false }
          );

          await this.cache.set(
            `last_messages:${conversationId}`,
            freshMessages,
            this.defaultTTL
          );
        }
      } catch (error) {
        console.warn(
          `⚠️ Erreur vérification fraîcheur ${conversationId}:`,
          error.message
        );
      }
    }, 500);
  }

  // Invalidation des caches liés à une conversation
  async invalidateConversationCaches(conversationId) {
    if (!this.cache) return;

    const patterns = [
      `messages:${conversationId}:*`,
      `last_messages:${conversationId}`,
      `conversation:${conversationId}*`,
    ];

    for (const pattern of patterns) {
      try {
        await this.cache.delete(pattern);
      } catch (error) {
        console.warn(`⚠️ Erreur invalidation ${pattern}:`, error.message);
      }
    }
  }

  // Nettoyage du cache
  async clearCache() {
    if (!this.cache) return;

    try {
      await this.cache.delete("messages:*");
      await this.cache.delete("last_messages:*");
    } catch (error) {
      console.error("❌ Erreur clearCache:", error);
    }
  }
}

module.exports = CachedMessageRepository;
