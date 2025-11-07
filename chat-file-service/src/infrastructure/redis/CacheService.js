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
      const key = `last_messages:${roomId}`;
      const data = {
        messages: messages.slice(0, 50), // Limiter aux 50 derniers messages
        cachedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return await this.set(key, data, ttl);
    } catch (err) {
      console.warn("⚠️ Cache lastMessages error:", err.message);
      return false;
    }
  }

  // Récupérer les derniers messages cachés d'une room
  async getCachedLastMessages(roomId) {
    try {
      const key = `last_messages:${roomId}`;
      const cached = await this.get(key);

      if (cached) {
        try {
          // Vérifier que les données sont valides
          if (cached.messages && Array.isArray(cached.messages)) {
            return cached;
          } else {
            // Données invalides -> nettoyer et retourner null
            await this.delete(key);
            return null;
          }
        } catch (parseError) {
          console.warn(`⚠️ Cache parse error for ${key}:`, parseError.message);
          await this.delete(key); // Nettoyer les données corrompues
          return null;
        }
      }
      return null;
    } catch (err) {
      console.warn("⚠️ GetCachedLastMessages error:", err.message);
      return null;
    }
  }

  // Invalider le cache des messages d'une room
  async invalidateRoomMessages(roomId) {
    try {
      const pattern = `last_messages:${roomId}*`;
      const count = await this.delete(pattern);
      console.log(`🗑️ Invalidated ${count} cache entries for room ${roomId}`);
      return count;
    } catch (err) {
      console.warn("⚠️ InvalidateRoomMessages error:", err.message);
      return 0;
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
