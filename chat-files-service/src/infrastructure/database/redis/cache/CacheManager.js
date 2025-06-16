/**
 * Gestionnaire de Cache Redis
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('CacheManager');

class CacheManager {
  constructor(redisClient) {
    this.redis = redisClient;
    this.defaultTTL = 3600; // 1 heure par défaut
    this.keyPrefix = 'cache:';
  }

  // Méthodes de base

  async get(key) {
    try {
      const fullKey = this.buildKey(key);
      const value = await this.redis.get(fullKey);
      
      if (value === null) {
        logger.debug('Cache miss:', { key });
        return null;
      }

      logger.debug('Cache hit:', { key });
      return JSON.parse(value);

    } catch (error) {
      logger.error('Erreur récupération cache:', { error: error.message, key });
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    try {
      const fullKey = this.buildKey(key);
      const serializedValue = JSON.stringify(value);

      if (ttl > 0) {
        await this.redis.setex(fullKey, ttl, serializedValue);
      } else {
        await this.redis.set(fullKey, serializedValue);
      }

      logger.debug('Cache set:', { key, ttl });
      return true;

    } catch (error) {
      logger.error('Erreur mise en cache:', { error: error.message, key });
      return false;
    }
  }

  async del(key) {
    try {
      const fullKey = this.buildKey(key);
      const result = await this.redis.del(fullKey);
      
      logger.debug('Cache delete:', { key, deleted: result > 0 });
      return result > 0;

    } catch (error) {
      logger.error('Erreur suppression cache:', { error: error.message, key });
      return false;
    }
  }

  async exists(key) {
    try {
      const fullKey = this.buildKey(key);
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      logger.error('Erreur vérification existence cache:', { error: error.message, key });
      return false;
    }
  }

  async ttl(key) {
    try {
      const fullKey = this.buildKey(key);
      return await this.redis.ttl(fullKey);
    } catch (error) {
      logger.error('Erreur récupération TTL:', { error: error.message, key });
      return -1;
    }
  }

  async expire(key, ttl) {
    try {
      const fullKey = this.buildKey(key);
      const result = await this.redis.expire(fullKey, ttl);
      return result === 1;
    } catch (error) {
      logger.error('Erreur mise à jour TTL:', { error: error.message, key, ttl });
      return false;
    }
  }

  // Méthodes avancées

  async mget(keys) {
    try {
      const fullKeys = keys.map(key => this.buildKey(key));
      const values = await this.redis.mget(...fullKeys);
      
      const result = {};
      keys.forEach((key, index) => {
        if (values[index] !== null) {
          result[key] = JSON.parse(values[index]);
        }
      });

      logger.debug('Cache mget:', { 
        requested: keys.length, 
        found: Object.keys(result).length 
      });

      return result;

    } catch (error) {
      logger.error('Erreur récupération multiple cache:', { error: error.message, keys });
      return {};
    }
  }

  async mset(keyValuePairs, ttl = this.defaultTTL) {
    try {
      const pipeline = this.redis.pipeline();
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const fullKey = this.buildKey(key);
        const serializedValue = JSON.stringify(value);
        
        if (ttl > 0) {
          pipeline.setex(fullKey, ttl, serializedValue);
        } else {
          pipeline.set(fullKey, serializedValue);
        }
      }

      await pipeline.exec();
      
      logger.debug('Cache mset:', { 
        count: Object.keys(keyValuePairs).length, 
        ttl 
      });

      return true;

    } catch (error) {
      logger.error('Erreur mise en cache multiple:', { 
        error: error.message, 
        keys: Object.keys(keyValuePairs) 
      });
      return false;
    }
  }

  async increment(key, amount = 1, ttl = this.defaultTTL) {
    try {
      const fullKey = this.buildKey(key);
      const result = await this.redis.incrby(fullKey, amount);
      
      if (ttl > 0) {
        await this.redis.expire(fullKey, ttl);
      }

      return result;

    } catch (error) {
      logger.error('Erreur incrémentation cache:', { error: error.message, key, amount });
      return null;
    }
  }

  async decrement(key, amount = 1) {
    try {
      const fullKey = this.buildKey(key);
      return await this.redis.decrby(fullKey, amount);
    } catch (error) {
      logger.error('Erreur décrémentation cache:', { error: error.message, key, amount });
      return null;
    }
  }

  // Cache avec fonction de récupération

  async getOrSet(key, fetchFunction, ttl = this.defaultTTL) {
    try {
      // Essayer de récupérer depuis le cache
      let value = await this.get(key);
      
      if (value !== null) {
        return value;
      }

      // Si pas en cache, exécuter la fonction de récupération
      logger.debug('Cache miss, exécution fonction:', { key });
      value = await fetchFunction();
      
      if (value !== null && value !== undefined) {
        await this.set(key, value, ttl);
      }

      return value;

    } catch (error) {
      logger.error('Erreur getOrSet cache:', { error: error.message, key });
      throw error;
    }
  }

  // Gestion des patterns

  async deletePattern(pattern) {
    try {
      const fullPattern = this.buildKey(pattern);
      const keys = await this.redis.keys(fullPattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.redis.del(...keys);
      
      logger.debug('Cache delete pattern:', { 
        pattern, 
        keysFound: keys.length, 
        deleted: result 
      });

      return result;

    } catch (error) {
      logger.error('Erreur suppression pattern cache:', { error: error.message, pattern });
      return 0;
    }
  }

  async getKeys(pattern) {
    try {
      const fullPattern = this.buildKey(pattern);
      const keys = await this.redis.keys(fullPattern);
      
      // Retirer le préfixe des clés
      return keys.map(key => key.replace(this.buildKey(''), ''));

    } catch (error) {
      logger.error('Erreur récupération clés pattern:', { error: error.message, pattern });
      return [];
    }
  }

  // Cache spécifique aux fichiers

  async cacheFileMetadata(fileId, metadata, ttl = 7200) { // 2 heures
    const key = `file:metadata:${fileId}`;
    return await this.set(key, metadata, ttl);
  }

  async getFileMetadata(fileId) {
    const key = `file:metadata:${fileId}`;
    return await this.get(key);
  }

  async invalidateFileCache(fileId) {
    const patterns = [
      `file:metadata:${fileId}`,
      `file:permissions:${fileId}:*`,
      `file:stats:${fileId}`,
      `conversation:*:files:*`
    ];

    let totalDeleted = 0;
    for (const pattern of patterns) {
      totalDeleted += await this.deletePattern(pattern);
    }

    logger.info('Cache fichier invalidé:', { fileId, deleted: totalDeleted });
    return totalDeleted;
  }

  // Cache des permissions

  async cacheFilePermissions(fileId, userId, permissions, ttl = 1800) { // 30 minutes
    const key = `file:permissions:${fileId}:${userId}`;
    return await this.set(key, permissions, ttl);
  }

  async getFilePermissions(fileId, userId) {
    const key = `file:permissions:${fileId}:${userId}`;
    return await this.get(key);
  }

  // Cache des conversations

  async cacheConversationFiles(conversationId, files, ttl = 600) { // 10 minutes
    const key = `conversation:${conversationId}:files`;
    return await this.set(key, files, ttl);
  }

  async getConversationFiles(conversationId) {
    const key = `conversation:${conversationId}:files`;
    return await this.get(key);
  }

  // Cache des statistiques

  async cacheUserStorageStats(userId, stats, ttl = 3600) { // 1 heure
    const key = `user:${userId}:storage:stats`;
    return await this.set(key, stats, ttl);
  }

  async getUserStorageStats(userId) {
    const key = `user:${userId}:storage:stats`;
    return await this.get(key);
  }

  async invalidateUserCache(userId) {
    const patterns = [
      `user:${userId}:*`,
      `file:permissions:*:${userId}`,
      `conversation:*:participant:${userId}`
    ];

    let totalDeleted = 0;
    for (const pattern of patterns) {
      totalDeleted += await this.deletePattern(pattern);
    }

    logger.info('Cache utilisateur invalidé:', { userId, deleted: totalDeleted });
    return totalDeleted;
  }

  // Utilitaires

  buildKey(key) {
    return `${this.keyPrefix}${key}`;
  }

  async clear() {
    try {
      const pattern = this.buildKey('*');
      return await this.deletePattern(pattern);
    } catch (error) {
      logger.error('Erreur vidage cache:', { error: error.message });
      return 0;
    }
  }

  async getStats() {
    try {
      const pattern = this.buildKey('*');
      const keys = await this.redis.keys(pattern);
      
      const stats = {
        totalKeys: keys.length,
        categories: {}
      };

      // Analyser les catégories de clés
      for (const key of keys) {
        const cleanKey = key.replace(this.buildKey(''), '');
        const category = cleanKey.split(':')[0];
        
        if (!stats.categories[category]) {
          stats.categories[category] = 0;
        }
        stats.categories[category]++;
      }

      return stats;

    } catch (error) {
      logger.error('Erreur statistiques cache:', { error: error.message });
      return { totalKeys: 0, categories: {} };
    }
  }
}

module.exports = CacheManager;
