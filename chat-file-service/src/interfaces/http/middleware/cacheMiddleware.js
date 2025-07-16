class CacheMiddleware {
  constructor(redisClient = null) {
    this.redisClient = redisClient;
    this.defaultTTL = 300000; // 5 minutes
  }

  // Cache générique
  checkCache = (ttl = this.defaultTTL) => {
    return async (req, res, next) => {
      if (!this.redisClient) {
        return next(); // Pass-through si pas de Redis
      }

      try {
        const cacheKey = this.generateCacheKey(req);
        const cached = await this.redisClient.get(cacheKey);

        if (cached) {
          const data = JSON.parse(cached);
          return res.json({
            ...data,
            fromCache: true,
            cachedAt: new Date().toISOString(),
          });
        }

        // Stocker la fonction originale pour sauvegarder la réponse
        const originalJson = res.json;
        res.json = function (data) {
          // Sauvegarder en cache
          if (data.success && data.data) {
            setImmediate(async () => {
              try {
                await this.redisClient.setex(
                  cacheKey,
                  Math.floor(ttl / 1000),
                  JSON.stringify(data)
                );
              } catch (error) {
                console.warn("⚠️ Erreur sauvegarde cache:", error.message);
              }
            });
          }
          return originalJson.call(this, data);
        };

        next();
      } catch (error) {
        console.warn("⚠️ Erreur cache middleware:", error.message);
        next();
      }
    };
  };

  // Cache spécifique pour les messages
  checkMessagesCache = async (req, res, next) => {
    if (!this.redisClient) {
      return next();
    }

    try {
      const { conversationId, page = 1, limit = 20 } = req.query;
      const cacheKey = `messages:${conversationId}:p${page}:l${limit}`;

      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        return res.json({
          ...data,
          fromCache: true,
        });
      }

      next();
    } catch (error) {
      console.warn("⚠️ Erreur cache messages:", error.message);
      next();
    }
  };

  // Cache spécifique pour les conversations
  checkConversationsCache = async (req, res, next) => {
    if (!this.redisClient) {
      return next();
    }

    try {
      const userId = req.user?.id;
      const { page = 1, limit = 20, archived = false } = req.query;
      const cacheKey = `conversations:${userId}:p${page}:l${limit}:a${archived}`;

      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        return res.json({
          ...data,
          fromCache: true,
        });
      }

      next();
    } catch (error) {
      console.warn("⚠️ Erreur cache conversations:", error.message);
      next();
    }
  };

  // Cache pour une conversation spécifique
  checkConversationCache = async (req, res, next) => {
    if (!this.redisClient) {
      return next();
    }

    try {
      const { conversationId } = req.params;
      const cacheKey = `conversation:${conversationId}`;

      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        return res.json({
          success: true,
          data,
          fromCache: true,
        });
      }

      next();
    } catch (error) {
      console.warn("⚠️ Erreur cache conversation:", error.message);
      next();
    }
  };

  // Cache pour un message spécifique
  checkMessageCache = async (req, res, next) => {
    if (!this.redisClient) {
      return next();
    }

    try {
      const { messageId } = req.params;
      const cacheKey = `message:${messageId}`;

      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        return res.json({
          success: true,
          data,
          fromCache: true,
        });
      }

      next();
    } catch (error) {
      console.warn("⚠️ Erreur cache message:", error.message);
      next();
    }
  };

  // Générer une clé de cache
  generateCacheKey(req) {
    const { method, path, query, user } = req;
    const userId = user?.id || "anonymous";
    const queryString = Object.keys(query)
      .sort()
      .map((key) => `${key}=${query[key]}`)
      .join("&");

    return `${method}:${path}:${userId}:${queryString}`;
  }

  // Invalider le cache
  async invalidateCache(pattern) {
    if (!this.redisClient) {
      return false;
    }

    try {
      const keys = await this.redisClient.keys(pattern);
      if (keys.length > 0) {
        await this.redisClient.del(keys);
        console.log(`🗑️ Cache invalidé: ${keys.length} clés`);
      }
      return true;
    } catch (error) {
      console.warn("⚠️ Erreur invalidation cache:", error.message);
      return false;
    }
  }
}

module.exports = CacheMiddleware;
