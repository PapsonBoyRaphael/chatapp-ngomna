/**
 * UnreadMessageManager - Gestionnaire de messages non lus avec Redis
 * Optimisé pour gérer les compteurs de messages non lus par conversation et par utilisateur
 */
class UnreadMessageManager {
  constructor(redis, messageRepository) {
    this.redis = redis;
    this.primaryStore = messageRepository; // ← nouveau
    this.keyPrefix = "unread";
    this.userUnreadPrefix = "user_unread";
    this.conversationUnreadPrefix = "conversation_unread";
    this.defaultTTL = 3 * 24 * 3600; // 3 jours
  }

  // Incrémenter le compteur de messages non lus
  async incrementUnreadCount(conversationId, userId) {
    try {
      const userKey = `${this.userUnreadPrefix}:${userId}:${conversationId}`;
      const conversationKey = `${this.conversationUnreadPrefix}:${conversationId}:${userId}`;

      // Incrémenter les deux compteurs
      const [userResult, convResult] = await Promise.all([
        this.redis.incr(userKey),
        this.redis.incr(conversationKey),
      ]);

      // Définir/renouveler TTL
      await Promise.all([
        this.redis.expire(userKey, this.defaultTTL),
        this.redis.expire(conversationKey, this.defaultTTL),
      ]);

      console.log(
        `📈 Compteur incrémenté pour ${userId} dans ${conversationId}: ${userResult}`
      );
      return userResult;
    } catch (error) {
      console.error("❌ Erreur incrementUnreadCount:", error);
      return 0;
    }
  }

  // Réinitialiser le compteur de messages non lus
  async resetUnreadCount(conversationId, userId) {
    try {
      const userKey = `${this.userUnreadPrefix}:${userId}:${conversationId}`;
      const conversationKey = `${this.conversationUnreadPrefix}:${conversationId}:${userId}`;

      await Promise.all([
        this.redis.del(userKey),
        this.redis.del(conversationKey),
      ]);

      console.log(
        `🔄 Compteur réinitialisé pour ${userId} dans ${conversationId}`
      );
      return true;
    } catch (error) {
      console.error("❌ Erreur resetUnreadCount:", error);
      return false;
    }
  }

  // Obtenir le nombre de messages non lus pour un utilisateur dans une conversation
  async getUnreadCount(conversationId, userId) {
    try {
      const userKey = `${this.userUnreadPrefix}:${userId}:${conversationId}`;
      const cached = await this.redis.get(userKey);

      // 1. Si on a un compteur Redis → on le renvoie (rapide)
      if (cached !== null) {
        const count = parseInt(cached) || 0;
        console.log(`Hit Redis unread: ${count}`);
        return count;
      }

      // 2. CACHE MISS ou EXPIRED → on recalcule depuis MongoDB
      console.log(
        `Miss Redis → recalcul depuis MongoDB pour ${userId} dans ${conversationId}`
      );

      // DEMANDE AU REPOSITORY DE RECALCULER
      const realCount = await this.recalculateFromDB(conversationId, userId);

      // 3. On recrée le compteur Redis avec le bon TTL
      if (realCount > 0) {
        await this.redis.set(userKey, realCount, { EX: this.defaultTTL });
      }

      return realCount;
    } catch (error) {
      console.error("Erreur getUnreadCount:", error);
      // En cas d'erreur → fallback sur MongoDB
      return await this.recalculateFromDB(conversationId, userId);
    }
  }

  // Obtenir le total des messages non lus pour un utilisateur
  async getTotalUnreadCount(userId) {
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
          total += counts.reduce(
            (sum, count) => sum + (parseInt(count) || 0),
            0
          );
        }
      } while (cursor !== 0);

      // 2. Si Redis vide → recalcul depuis MongoDB
      if (total === 0) {
        console.log(`Total Redis = 0 → recalcul global depuis MongoDB`);
        total = await this.primaryStore.countAllUnreadMessages(userId);

        // Optionnel : recréer les clés Redis pour les conversations actives
        // (tu peux le faire en arrière-plan)
      }

      return total;
    } catch (error) {
      console.error("❌ Erreur getTotalUnreadCount:", error);
      return await this.primaryStore.countAllUnreadMessages(userId);
    }
  }

  async recalculateFromDB(conversationId, userId) {
    try {
      // Appelle ton CachedMessageRepository ou MessageRepository
      // pour compter les messages non lus
      const count = await this.primaryStore.countUnreadMessages(
        conversationId,
        userId
      );
      console.log(`Recalculé depuis MongoDB: ${count} non-lus`);
      return count;
    } catch (error) {
      console.error("Erreur recalcul MongoDB:", error);
      return 0;
    }
  }

  // Nettoyer les compteurs expirés
  async cleanup() {
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
            const expired = await Promise.all(
              result.keys.map(async (key) => {
                const ttl = await this.redis.ttl(key);
                return ttl <= 0 ? key : null;
              })
            );

            const keysToDelete = expired.filter(Boolean);
            if (keysToDelete.length > 0) {
              await this.redis.del(keysToDelete);
              deleted += keysToDelete.length;
            }
          }
        } while (cursor !== 0);
      }

      console.log(`🧹 Nettoyage terminé: ${deleted} compteurs supprimés`);
      return deleted;
    } catch (error) {
      console.error("❌ Erreur cleanup:", error);
      return 0;
    }
  }
}

module.exports = UnreadMessageManager;
