/**
 * CacheService - Service de cache Redis optimisé pour 500k+ users
 * Gère UNIQUEMENT le cache stratégique (pas les messages individuels)
 */
class CacheService {
  constructor(redisClient, options = {}) {
    this.redis = redisClient;
    this.options = {
      defaultTTL: options.defaultTTL || 3600,
      keyPrefix: options.keyPrefix || "chat",
      maxScanCount: options.maxScanCount || 100,
      ...options,
    };
  }

  // ✅ CACHE BASIQUE
  async get(key) {
    try {
      const cacheKey = `${this.options.keyPrefix}:${this.sanitizeKey(key)}`;
      const value = await this.redis.get(cacheKey);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      console.warn("⚠️ Cache get error:", err.message);
      return null;
    }
  }

  async set(key, value, ttl = this.options.defaultTTL) {
    try {
      const cacheKey = `${this.options.keyPrefix}:${this.sanitizeKey(key)}`;
      const data = JSON.stringify(value);
      await this.redis.setEx(cacheKey, ttl, data);
      return true;
    } catch (err) {
      console.warn("⚠️ Cache set error:", err.message);
      return false;
    }
  }

  async delete(keyOrPattern) {
    try {
      if (keyOrPattern.includes("*")) {
        return await this._deleteByPattern(keyOrPattern);
      } else {
        const cacheKey = `${this.options.keyPrefix}:${this.sanitizeKey(
          keyOrPattern
        )}`;
        return await this.redis.del(cacheKey);
      }
    } catch (err) {
      console.warn("⚠️ Cache delete error:", err.message);
      return 0;
    }
  }

  async _deleteByPattern(pattern) {
    let deletedCount = 0;
    let cursor = 0;

    try {
      do {
        const result = await this.redis.scan(cursor, {
          MATCH: `${this.options.keyPrefix}:${pattern}`,
          COUNT: this.options.maxScanCount,
        });

        cursor = result.cursor;
        if (result.keys.length > 0) {
          const count = await this.redis.del(result.keys);
          deletedCount += count;
        }
      } while (cursor !== 0);

      return deletedCount;
    } catch (err) {
      console.warn("⚠️ Cache deleteByPattern error:", err.message);
      return deletedCount;
    }
  }

  // Cache des derniers messages d'une room
  async cacheLastMessages(roomId, messages, ttl = 3600) {
    try {
      const cacheKey = `${
        this.options.keyPrefix
      }:last_messages:${this.sanitizeKey(roomId)}`;

      const data = {
        messages: Array.isArray(messages) ? messages.slice(0, 50) : [],
        cachedAt: new Date().toISOString(),
        count: (Array.isArray(messages) ? messages.length : 0).toString(),
      };

      await this.redis.setEx(cacheKey, ttl, JSON.stringify(data));
      console.log(
        `💾 Last messages cachés: ${data.count} messages (${roomId})`
      );
      return cacheKey;
    } catch (err) {
      console.warn("⚠️ Erreur cacheLastMessages:", err.message);
      return null;
    }
  }

  // Récupérer les derniers messages cachés d'une room
  async getCachedLastMessages(roomId) {
    try {
      const cacheKey = `${
        this.options.keyPrefix
      }:last_messages:${this.sanitizeKey(roomId)}`;

      const cached = await this.redis.get(cacheKey);
      if (!cached) {
        console.log(`📦 Last messages miss: ${roomId}`);
        return null;
      }

      const data = JSON.parse(cached);
      console.log(`📦 Last messages hit: ${data.count} messages (${roomId})`);
      return data.messages || [];
    } catch (err) {
      console.warn("⚠️ Erreur getCachedLastMessages:", err.message);
      return null;
    }
  }

  // Invalider le cache des messages d'une room
  async invalidateRoomMessages(roomId) {
    try {
      const patterns = [
        `${this.options.keyPrefix}:last_messages:${this.sanitizeKey(roomId)}`,
        `${this.options.keyPrefix}:messages:${this.sanitizeKey(roomId)}:*`,
      ];

      for (const pattern of patterns) {
        try {
          await this.redis.del(pattern);
          console.log(`🗑️ Invalidé: ${pattern}`);
        } catch (err) {
          console.warn(`⚠️ Erreur invalidation ${pattern}:`, err.message);
        }
      }
    } catch (err) {
      console.error("❌ Erreur invalidateRoomMessages:", err.message);
    }
  }

  /**
   * Renouveler le TTL d'une clé existante
   * Utile pour les cache hits - étendre la vie des entrées utilisées
   */
  async renewTTL(key, ttl = this.options.defaultTTL) {
    try {
      const cacheKey = `${this.options.keyPrefix}:${this.sanitizeKey(key)}`;

      // Vérifier existence
      const exists = await this.redis.exists(cacheKey);
      if (!exists) {
        console.warn(`⚠️ renewTTL: Clé inexistante: ${key} (non renouvelée)`);
        return false;
      }

      // Appliquer TTL
      await this.redis.expire(cacheKey, ttl);
      console.log(`🔄 TTL renouvelé: ${key} (${ttl}s)`);
      return true;
    } catch (err) {
      console.error(`❌ Erreur renewTTL ${key}:`, err.message);
      return false;
    }
  }

  // ✅ UTILITAIRES
  sanitizeKey(key) {
    if (!key || key === "null" || key === "undefined") return null;
    return String(key).trim();
  }

  // ✅ STATISTIQUES
  async getStats() {
    try {
      const info = await this.redis.info("memory");
      return {
        memoryUsage:
          info
            .split("\n")
            .find((line) => line.startsWith("used_memory_human"))
            ?.split(":")[1] || "unknown",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return { error: error.message };
    }
  }
}

module.exports = CacheService;
