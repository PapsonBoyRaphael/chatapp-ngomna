/**
 * CachedMessageRepository - Repository pattern avec cache Redis
 * Gère la cohérence entre MongoDB et Redis pour les messages
 * Wrapper autour du primaryStore (MongoMessageRepository) pour ajouter la logique de cache
 * Toutes les méthodes du primaryStore sont wrappées ici pour ajouter cache/invalidation
 */
class CachedMessageRepository {
  constructor(messageRepository, cacheService, unreadManager) {
    this.primaryStore = messageRepository; // Le pur Mongo repo
    this.cache = cacheService;
    this.unreadManager = unreadManager;
    this.defaultTTL = 3600; // 1 heure
    this.shortTTL = 300; // 5 minutes
  }

  // Sauvegarder un message avec cache et invalidation
  async save(messageOrData) {
    try {
      // 1. Sauvegarde dans MongoDB via primaryStore
      const savedMessage = await this.primaryStore.save(messageOrData);

      // 2. Mise en cache du message individuel
      const messageCacheKey = `msg:${savedMessage._id}`;
      await this.cache.set(messageCacheKey, savedMessage, this.defaultTTL);

      // 3. Invalider les caches liés à la conversation
      await this.invalidateConversationCaches(savedMessage.conversationId);

      // 4. Si unreadManager est présent, incrémenter les compteurs non-lus
      if (this.unreadManager && savedMessage.receiverId) {
        await this.unreadManager.incrementUnreadCount(
          savedMessage.conversationId,
          savedMessage.receiverId
        );
      }

      return savedMessage;
    } catch (error) {
      console.error("❌ Erreur save (cached):", error);
      throw error;
    }
  }

  // Récupérer les messages d'une conversation avec cache (déjà présent, conservé)
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

  // Récupérer et mettre en cache les derniers messages (déjà présent, conservé)
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

  // Marquer les messages comme lus avec mise à jour du cache (déjà présent, conservé)
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

  // Marquer les messages comme livrés avec mise à jour du cache (déjà présent, conservé)
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

  // Mettre à jour le statut d'un message avec cache et invalidation
  async updateMessageStatus(conversationId, userId, status, messageIds = null) {
    try {
      // 1. Mise à jour dans MongoDB
      const result = await this.primaryStore.updateMessageStatus(
        conversationId,
        userId,
        status,
        messageIds
      );

      // 2. Invalider les caches liés
      await this.invalidateConversationCaches(conversationId);

      // 3. Si status est "READ", reset unread si unreadManager présent
      if (status === "READ" && this.unreadManager) {
        await this.unreadManager.resetUnreadCount(conversationId, userId);
      }

      return result;
    } catch (error) {
      console.error("❌ Erreur updateMessageStatus (cached):", error);
      throw error;
    }
  }

  // Supprimer un message avec cache et invalidation
  async deleteMessage(messageId) {
    try {
      // 1. Suppression dans MongoDB
      const result = await this.primaryStore.deleteMessage(messageId);

      // 2. Invalider les caches liés
      if (result.conversationId) {
        await this.invalidateConversationCaches(result.conversationId);
      }

      // 3. Si unreadManager présent, décrémenter si needed (logique métier optionnelle)
      // Ex. : if (this.unreadManager && result.wasUnread) await this.unreadManager.decrement(...);

      return result;
    } catch (error) {
      console.error("❌ Erreur deleteMessage (cached):", error);
      throw error;
    }
  }

  // Mettre à jour le contenu d'un message avec cache et invalidation
  async updateMessageContent(messageId, newContent) {
    try {
      // 1. Mise à jour dans MongoDB
      const result = await this.primaryStore.updateMessageContent(
        messageId,
        newContent
      );

      // 2. Invalider les caches liés
      await this.invalidateConversationCaches(result.conversationId);

      return result;
    } catch (error) {
      console.error("❌ Erreur updateMessageContent (cached):", error);
      throw error;
    }
  }

  // Récupérer le dernier message avec cache
  async getLastMessage(conversationId) {
    const cacheKey = `last_message:${conversationId}`;

    try {
      let cached = await this.cache.get(cacheKey);
      if (cached) {
        console.log(`📦 Last message depuis cache: ${conversationId}`);
        return cached;
      }

      const message = await this.primaryStore.getLastMessage(conversationId);

      if (message) {
        await this.cache.set(cacheKey, message, this.defaultTTL);
      }

      return message;
    } catch (error) {
      console.error("❌ Erreur getLastMessage (cached):", error);
      throw error;
    }
  }

  // Compter les messages avec cache
  async getMessageCount(conversationId) {
    const cacheKey = `message_count:${conversationId}`;

    try {
      let cached = await this.cache.get(cacheKey);
      if (cached) {
        console.log(`📦 Count depuis cache: ${conversationId}`);
        return parseInt(cached);
      }

      const count = await this.primaryStore.getMessageCount(conversationId);

      await this.cache.set(cacheKey, count, this.defaultTTL);

      return count;
    } catch (error) {
      console.error("❌ Erreur getMessageCount (cached):", error);
      throw error;
    }
  }

  // Pré-chargement des métadonnées utilisateur (déjà présent, conservé)
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

  // Vérification différée de la fraîcheur du cache (déjà présent, conservé)
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

  // Invalidation des caches liés à une conversation (déjà présent, conservé)
  async invalidateConversationCaches(conversationId) {
    if (!this.cache) return;

    const patterns = [
      `messages:${conversationId}:*`,
      `last_messages:${conversationId}`,
      `conversation:${conversationId}*`,
      `message_count:${conversationId}`,
      `last_message:${conversationId}`,
    ];

    for (const pattern of patterns) {
      try {
        await this.cache.delete(pattern);
      } catch (error) {
        console.warn(`⚠️ Erreur invalidation ${pattern}:`, error.message);
      }
    }
  }

  // Nettoyage du cache (déjà présent, conservé)
  async clearCache() {
    if (!this.cache) return;

    try {
      await this.cache.delete("messages:*");
      await this.cache.delete("last_messages:*");
      await this.cache.delete("last_message:*");
      await this.cache.delete("message_count:*");
    } catch (error) {
      console.error("❌ Erreur clearCache:", error);
    }
  }
}

module.exports = CachedMessageRepository;
