class CacheService {
  constructor(redisClient, defaultTTL = 3600) {
    this.redis = redisClient;
    this.defaultTTL = defaultTTL;
  }

  async get(key) {
    if (!this.redis) return null;
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      console.warn("⚠️ Erreur lecture cache:", err.message);
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    if (!this.redis) return false;
    try {
      const data = JSON.stringify(value);
      if (typeof this.redis.setex === "function") {
        await this.redis.setex(key, ttl, data);
      } else if (typeof this.redis.set === "function") {
        await this.redis.set(key, data, "EX", ttl);
      } else {
        console.warn("⚠️ Méthode set/setex non supportée");
        return false;
      }
      return true;
    } catch (err) {
      console.warn("⚠️ Erreur écriture cache:", err.message);
      return false;
    }
  }

  async del(keyOrPattern) {
    if (!this.redis) return 0;
    try {
      if (keyOrPattern.includes("*") && typeof this.redis.keys === "function") {
        const keys = await this.redis.keys(keyOrPattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
          return keys.length;
        }
        return 0;
      } else {
        return await this.redis.del(keyOrPattern);
      }
    } catch (err) {
      console.warn("⚠️ Erreur suppression cache:", err.message);
      return 0;
    }
  }

  // ✅ Ajout de la méthode keys pour compatibilité avec les repositories
  async keys(pattern) {
    if (!this.redis || typeof this.redis.keys !== "function") {
      throw new Error("Redis ne supporte pas la méthode keys");
    }
    return await this.redis.keys(pattern);
  }
}

module.exports = CacheService;
