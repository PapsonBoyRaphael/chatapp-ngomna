/**
 * CachedMessageRepository - Repository pattern avec cache Redis
 * ✅ FUSIONNÉ : Unread counts intégrés directement
 * ✅ OPTIMISÉ : Cache STRATÉGIQUE uniquement
 * Gère la cohérence entre MongoDB et Redis
 */
class CachedMessageRepository {
  constructor(messageRepository, cacheService) {
    this.primaryStore = messageRepository;
    this.cache = cacheService;
    this.redis = cacheService?.redis || null;

    this.defaultTTL = 3600;
    this.shortTTL = 300;
    this.unreadTTL = 86400;

    this.userUnreadPrefix = "unread:user";
    this.conversationUnreadPrefix = "unread:conv";
  }

  // ===== SAUVEGARDER UN MESSAGE =====
  /**
   * ✅ Sauvegarde + Incrément unread inline + Invalidation
   */
  async save(messageOrData) {
    try {
      const startTime = Date.now();

      // 1. ✅ SAUVEGARDE MongoDB
      const savedMessage = await this.primaryStore.save(messageOrData);

      if (!savedMessage) {
        throw new Error("Message not saved");
      }

      // 2. ✅ INCRÉMENTER LES COMPTEURS UNREAD (INTÉGRÉ)
      if (savedMessage.receiverId) {
        await this.incrementUnreadCount(
          savedMessage.conversationId,
          savedMessage.receiverId
        );
      }

      // 3. ✅ INVALIDER LES CACHES STRATÉGIQUES
      await this.invalidateConversationCaches(savedMessage.conversationId);

      const processingTime = Date.now() - startTime;
      console.log(
        `✅ Message sauvegardé: ${savedMessage._id} (${processingTime}ms)`
      );

      return savedMessage;
    } catch (error) {
      console.error("❌ Erreur save (cached):", error.message);
      throw error;
    }
  }

  // ===== RÉCUPÉRER LES 50 DERNIERS MESSAGES =====
  /**
   * ✅ UTILISER CacheService directement (pas de duplication)
   */
  async getLastMessagesWithPreload(conversationId, limit = 50) {
    try {
      // 1. ✅ VÉRIFIER LE CACHE via CacheService
      let messages = await this.cache.getCachedLastMessages(conversationId);

      if (!messages || messages.length === 0) {
        // 2. ✅ CACHE MISS → Charger depuis MongoDB
        console.log(`🔍 Last messages miss → MongoDB: ${conversationId}`);

        const result = await this.primaryStore.findByConversation(
          conversationId,
          { page: 1, limit, useCache: false }
        );

        messages = result.messages || result;

        if (messages.length > 0) {
          // 3. ✅ METTRE EN CACHE via CacheService
          await this.cache.cacheLastMessages(
            conversationId,
            messages,
            this.defaultTTL
          );
          console.log(
            `💾 Last messages cachés: ${messages.length} (${conversationId})`
          );

          // 4. ✅ PRÉ-CHARGEMENT MÉTADONNÉES EN FOND
          this.preloadUserMetadata(messages);
        }
      } else {
        // 5. ✅ CACHE HIT → Renouveler TTL
        console.log(`📦 Last messages hit: ${conversationId}`);
        await this.cache.renewTTL(
          `last_messages:${conversationId}`,
          this.defaultTTL
        );
        this.backgroundFreshnessCheck(conversationId, messages);
      }

      return messages;
    } catch (error) {
      console.error("❌ Erreur getLastMessages:", error.message);
      // Fallback
      const result = await this.primaryStore.findByConversation(
        conversationId,
        { page: 1, limit: 50, useCache: false }
      );
      return result.messages || result;
    }
  }

  // ===== RÉCUPÉRER LE DERNIER MESSAGE =====
  /**
   * ✅ DIRECT MongoDB (pas de cache - trop volatile)
   */
  async getLastMessage(conversationId) {
    try {
      const message = await this.primaryStore.getLastMessage(conversationId);
      console.log(`📖 Last message (direct): ${conversationId}`);
      return message;
    } catch (error) {
      console.error("❌ Erreur getLastMessage:", error.message);
      throw error;
    }
  }

  // ===== COMPTER LES MESSAGES =====
  /**
   * ✅ DIRECT MongoDB (pas de cache - peu demandé)
   */
  async getMessageCount(conversationId) {
    try {
      const count = await this.primaryStore.getMessageCount(conversationId);
      console.log(`📊 Message count (direct): ${conversationId}`);
      return count;
    } catch (error) {
      console.error("❌ Erreur getMessageCount:", error.message);
      throw error;
    }
  }

  // ===== UNREAD COUNTS (INTÉGRÉ) =====

  /**
   * ✅ Incrémenter le compteur non-lus
   */
  async incrementUnreadCount(conversationId, userId) {
    if (!this.redis) return 0;

    try {
      const userKey = `${this.userUnreadPrefix}:${userId}:${conversationId}`;
      const convKey = `${this.conversationUnreadPrefix}:${conversationId}:${userId}`;

      const [userCount, convCount] = await Promise.all([
        this.redis.incr(userKey),
        this.redis.incr(convKey),
      ]);

      await Promise.all([
        this.redis.expire(userKey, this.unreadTTL),
        this.redis.expire(convKey, this.unreadTTL),
      ]);

      console.log(
        `📈 Unread incrémenté: ${userId} dans ${conversationId} = ${userCount}`
      );
      return userCount;
    } catch (error) {
      console.error("❌ Erreur incrementUnreadCount:", error.message);
      return 0;
    }
  }

  /**
   * ✅ Réinitialiser le compteur non-lus
   */
  async resetUnreadCount(conversationId, userId) {
    if (!this.redis) return true;

    try {
      const userKey = `${this.userUnreadPrefix}:${userId}:${conversationId}`;
      const convKey = `${this.conversationUnreadPrefix}:${conversationId}:${userId}`;

      await Promise.all([this.redis.del(userKey), this.redis.del(convKey)]);

      console.log(`🔄 Unread réinitialisé: ${userId} dans ${conversationId}`);
      return true;
    } catch (error) {
      console.error("❌ Erreur resetUnreadCount:", error.message);
      return false;
    }
  }

  /**
   * ✅ Obtenir le compteur non-lus (Redis → MongoDB fallback)
   */
  async getUnreadCount(conversationId, userId) {
    if (!this.redis) {
      return await this.primaryStore.countUnreadMessages(
        conversationId,
        userId
      );
    }

    try {
      const userKey = `${this.userUnreadPrefix}:${userId}:${conversationId}`;

      // 1. Redis d'abord
      let count = await this.redis.get(userKey);
      if (count !== null) {
        const result = parseInt(count) || 0;
        console.log(`📦 Unread depuis Redis: ${result}`);
        return result;
      }

      // 2. CACHE MISS → MongoDB
      console.log(`🔍 Unread miss → recalcul MongoDB`);
      const realCount = await this.primaryStore.countUnreadMessages(
        conversationId,
        userId
      );

      // 3. Recréer le compteur Redis
      if (realCount > 0) {
        await this.redis.setEx(userKey, this.unreadTTL, realCount.toString());
      }

      return realCount;
    } catch (error) {
      console.warn("⚠️ Erreur getUnreadCount:", error.message);
      return await this.primaryStore.countUnreadMessages(
        conversationId,
        userId
      );
    }
  }

  /**
   * ✅ Obtenir le total unread pour un utilisateur (toutes conversations)
   */
  async getTotalUnreadCount(userId) {
    if (!this.redis) {
      return await this.primaryStore.countAllUnreadMessages(userId);
    }

    try {
      const pattern = `${this.userUnreadPrefix}:${userId}:*`;
      let total = 0;
      let cursor = 0;

      do {
        const result = await this.redis.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });

        cursor = result.cursor;

        if (result.keys.length > 0) {
          const counts = await Promise.all(
            result.keys.map((key) => this.redis.get(key))
          );

          total += counts.reduce((sum, count) => {
            return sum + (parseInt(count) || 0);
          }, 0);
        }
      } while (cursor !== 0);

      console.log(`📊 Total unread ${userId}: ${total}`);
      return total;
    } catch (error) {
      console.warn("⚠️ Erreur getTotalUnreadCount:", error.message);
      return await this.primaryStore.countAllUnreadMessages(userId);
    }
  }

  /**
   * ✅ Nettoyer les compteurs expirés
   */
  async cleanupExpiredUnreadCounts() {
    if (!this.redis) return 0;

    try {
      let deleted = 0;
      const patterns = [
        `${this.userUnreadPrefix}:*`,
        `${this.conversationUnreadPrefix}:*`,
      ];

      for (const pattern of patterns) {
        let cursor = 0;

        do {
          const result = await this.redis.scan(cursor, {
            MATCH: pattern,
            COUNT: 100,
          });

          cursor = result.cursor;

          if (result.keys.length > 0) {
            const expiredKeys = await Promise.all(
              result.keys.map(async (key) => {
                const ttl = await this.redis.ttl(key);
                return ttl <= 0 ? key : null;
              })
            );

            const toDelete = expiredKeys.filter(Boolean);
            if (toDelete.length > 0) {
              await this.redis.del(...toDelete);
              deleted += toDelete.length;
            }
          }
        } while (cursor !== 0);
      }

      if (deleted > 0) {
        console.log(`🧹 Nettoyage unread: ${deleted} compteurs supprimés`);
      }

      return deleted;
    } catch (error) {
      console.warn("⚠️ Erreur cleanupExpiredUnreadCounts:", error.message);
      return 0;
    }
  }

  // ===== LIRE LES MESSAGES D'UNE CONVERSATION =====
  /**
   * ✅ Cache paginez seulement
   */
  async findByConversation(conversationId, options = {}) {
    const { page = 1, limit = 50, userId, useCache = true } = options;
    const cacheKey = `messages:${conversationId}:p${page}:l${limit}`;

    try {
      // 1. ✅ VÉRIFIER LE CACHE PAGINÉ
      if (useCache && this.cache) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          console.log(
            `📦 Messages page ${page} depuis cache: ${conversationId}`
          );
          return { messages: cached, fromCache: true };
        }
      }

      // 2. ✅ CACHE MISS → MongoDB
      console.log(`🔍 Lecture page ${page} depuis MongoDB: ${conversationId}`);
      const result = await this.primaryStore.findByConversation(
        conversationId,
        {
          page: parseInt(page),
          limit: parseInt(limit),
          userId,
        }
      );

      // 3. ✅ METTRE EN CACHE LA PAGE
      if (useCache && this.cache && result.length > 0) {
        await this.cache.set(cacheKey, result, this.shortTTL);
        console.log(`💾 Page ${page} mise en cache: ${result.length} messages`);
      }

      return { messages: result, fromCache: false };
    } catch (error) {
      console.error("❌ Erreur findByConversation:", error.message);
      throw error;
    }
  }

  // ===== MARQUER COMME LU =====
  /**
   * ✅ Mise à jour + Reset unread + Invalidation
   */
  async markMessagesAsRead(conversationId, userId, messageIds = null) {
    try {
      // 1. ✅ Mise à jour MongoDB
      const result = await this.primaryStore.updateMessageStatus(
        conversationId,
        userId,
        "READ",
        messageIds
      );

      if (result.modifiedCount > 0) {
        // 2. ✅ Réinitialiser unread
        await this.resetUnreadCount(conversationId, userId);

        // 3. ✅ Invalider caches
        await this.invalidateConversationCaches(conversationId);
      }

      return result;
    } catch (error) {
      console.error("❌ Erreur markMessagesAsRead:", error.message);
      throw error;
    }
  }

  // ===== MARQUER COMME LIVRÉ =====
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
      console.error("❌ Erreur markMessagesAsDelivered:", error.message);
      throw error;
    }
  }

  // ===== METTRE À JOUR LE STATUT =====
  /**
   * ✅ Mise à jour générique avec gestion unread conditionnelle
   */
  async updateMessageStatus(conversationId, userId, status, messageIds = null) {
    try {
      // 1. ✅ Mise à jour MongoDB
      const result = await this.primaryStore.updateMessageStatus(
        conversationId,
        userId,
        status,
        messageIds
      );

      // 2. ✅ Invalider caches
      await this.invalidateConversationCaches(conversationId);

      // 3. ✅ Gérer unread selon le statut
      if (status === "READ") {
        await this.resetUnreadCount(conversationId, userId);
      }

      return result;
    } catch (error) {
      console.error("❌ Erreur updateMessageStatus:", error.message);
      throw error;
    }
  }

  // ===== SUPPRIMER UN MESSAGE =====
  async deleteMessage(messageId) {
    try {
      const result = await this.primaryStore.deleteById(messageId);

      if (result && result.conversationId) {
        await this.invalidateConversationCaches(result.conversationId);
      }

      return result;
    } catch (error) {
      console.error("❌ Erreur deleteMessage:", error.message);
      throw error;
    }
  }

  // ===== METTRE À JOUR LE CONTENU =====
  async updateMessageContent(messageId, newContent) {
    try {
      const result = await this.primaryStore.updateMessageContent(
        messageId,
        newContent
      );

      await this.invalidateConversationCaches(result.conversationId);

      return result;
    } catch (error) {
      console.error("❌ Erreur updateMessageContent:", error.message);
      throw error;
    }
  }

  // ===== INVALIDATION STRATÉGIQUE =====
  /**
   * ✅ CORRIGER : Supprimer last_message et message_count patterns
   */
  async invalidateConversationCaches(conversationId) {
    if (!this.cache) return;

    const patterns = [
      `messages:${conversationId}:*`, // Pages paginées
      `last_messages:${conversationId}`, // Les 50 derniers
      `conversation:${conversationId}*`, // Metas conversation
    ];

    let invalidated = 0;
    for (const pattern of patterns) {
      try {
        const deleted = await this.cache.delete(pattern);
        invalidated += deleted;
        if (deleted > 0) {
          console.log(`🗑️ Invalidé: ${pattern} (${deleted} keys)`);
        }
      } catch (error) {
        console.warn(`⚠️ Erreur invalidation ${pattern}:`, error.message);
      }
    }

    if (invalidated > 0) {
      console.log(`🗑️ Total: ${invalidated} keys invalidées`);
    }
  }

  // ===== NETTOYAGE GLOBAL =====
  async clearCache() {
    if (!this.cache) return;

    try {
      await this.cache.delete("messages:*");
      await this.cache.delete("last_messages:*");
      await this.cache.delete("conversation:*");
      console.log("✅ Tous les caches messages nettoyés");
    } catch (error) {
      console.error("❌ Erreur clearCache:", error.message);
    }
  }
}

module.exports = CachedMessageRepository;
