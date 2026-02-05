/**
 * CacheService - Adapter compatissant pour @chatapp-ngomna/shared
 * ✅ Wrapper autour du CacheService du shared
 * ✅ Signature compatible avec l'utilisation locale (redisClient en param)
 * ✅ Utilise les fonctionnalités avancées du shared
 */

const { CacheService: SharedCacheService } = require("../../../shared");

class CacheService {
  constructor(redisClient, options = {}) {
    if (!redisClient) {
      throw new Error("redisClient est requis pour CacheService");
    }

    // ✅ Créer l'instance du shared avec les options
    this._cacheService = new SharedCacheService(options);

    // ✅ Initialiser immédiatement avec le client fourni
    this._cacheService.initializeWithClient(redisClient);
  }

  // ✅ DÉLÉGUER TOUTES LES MÉTHODES AU SHARED
  async get(key) {
    return await this._cacheService.get(key);
  }

  async set(key, value, ttl) {
    return await this._cacheService.set(key, value, ttl);
  }

  async delete(keyOrPattern) {
    return await this._cacheService.delete(keyOrPattern);
  }

  async cacheLastMessages(conversationId, messages, ttl) {
    if (this._cacheService.cacheLastMessages) {
      return await this._cacheService.cacheLastMessages(
        conversationId,
        messages,
        ttl,
      );
    }
    // Fallback : mettre en cache manuellement
    return await this.set(`lastMessages:${conversationId}`, messages, ttl);
  }

  async getLastMessages(conversationId) {
    if (this._cacheService.getLastMessages) {
      return await this._cacheService.getLastMessages(conversationId);
    }
    // Fallback
    return await this.get(`lastMessages:${conversationId}`);
  }

  async renewTTL(key, ttl) {
    if (this._cacheService.renewTTL) {
      return await this._cacheService.renewTTL(key, ttl);
    }
    return true;
  }

  async _deleteByPattern(pattern) {
    if (this._cacheService._deleteByPattern) {
      return await this._cacheService._deleteByPattern(pattern);
    }
    return true;
  }

  sanitizeKey(key) {
    if (this._cacheService.sanitizeKey) {
      return this._cacheService.sanitizeKey(key);
    }
    return key || "unknown";
  }
}

module.exports = CacheService;
