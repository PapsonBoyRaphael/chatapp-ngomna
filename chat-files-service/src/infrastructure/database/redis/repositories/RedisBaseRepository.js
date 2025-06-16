/**
 * Repository Redis de Base
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../../shared/utils/logger');

const logger = createLogger('RedisBaseRepository');

class RedisBaseRepository {
  constructor(redisClient, keyPrefix = '') {
    this.redis = redisClient;
    this.keyPrefix = keyPrefix;
    this.defaultTTL = 3600; // 1 heure
  }

  // Méthodes de base

  buildKey(...parts) {
    const cleanParts = parts.filter(part => 
      part !== undefined && part !== null && part !== ''
    );
    return `${this.keyPrefix}${cleanParts.join(':')}`;
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

      logger.debug('Redis set:', { key: fullKey, ttl });
      return true;

    } catch (error) {
      logger.error('Erreur Redis set:', { error: error.message, key });
      throw error;
    }
  }

  async get(key) {
    try {
      const fullKey = this.buildKey(key);
      const value = await this.redis.get(fullKey);

      if (value === null) {
        return null;
      }

      return JSON.parse(value);

    } catch (error) {
      logger.error('Erreur Redis get:', { error: error.message, key });
      return null;
    }
  }

  async del(key) {
    try {
      const fullKey = this.buildKey(key);
      const result = await this.redis.del(fullKey);
      
      logger.debug('Redis del:', { key: fullKey, deleted: result > 0 });
      return result > 0;

    } catch (error) {
      logger.error('Erreur Redis del:', { error: error.message, key });
      return false;
    }
  }

  async exists(key) {
    try {
      const fullKey = this.buildKey(key);
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      logger.error('Erreur Redis exists:', { error: error.message, key });
      return false;
    }
  }

  async expire(key, ttl) {
    try {
      const fullKey = this.buildKey(key);
      const result = await this.redis.expire(fullKey, ttl);
      return result === 1;
    } catch (error) {
      logger.error('Erreur Redis expire:', { error: error.message, key, ttl });
      return false;
    }
  }

  async ttl(key) {
    try {
      const fullKey = this.buildKey(key);
      return await this.redis.ttl(fullKey);
    } catch (error) {
      logger.error('Erreur Redis ttl:', { error: error.message, key });
      return -1;
    }
  }

  // Méthodes pour sets

  async sadd(key, ...members) {
    try {
      const fullKey = this.buildKey(key);
      return await this.redis.sadd(fullKey, ...members);
    } catch (error) {
      logger.error('Erreur Redis sadd:', { error: error.message, key });
      throw error;
    }
  }

  async srem(key, ...members) {
    try {
      const fullKey = this.buildKey(key);
      return await this.redis.srem(fullKey, ...members);
    } catch (error) {
      logger.error('Erreur Redis srem:', { error: error.message, key });
      throw error;
    }
  }

  async smembers(key) {
    try {
      const fullKey = this.buildKey(key);
      return await this.redis.smembers(fullKey);
    } catch (error) {
      logger.error('Erreur Redis smembers:', { error: error.message, key });
      return [];
    }
  }

  async sismember(key, member) {
    try {
      const fullKey = this.buildKey(key);
      const result = await this.redis.sismember(fullKey, member);
      return result === 1;
    } catch (error) {
      logger.error('Erreur Redis sismember:', { error: error.message, key });
      return false;
    }
  }

  // Méthodes pour hashes

  async hset(key, field, value) {
    try {
      const fullKey = this.buildKey(key);
      const serializedValue = JSON.stringify(value);
      return await this.redis.hset(fullKey, field, serializedValue);
    } catch (error) {
      logger.error('Erreur Redis hset:', { error: error.message, key, field });
      throw error;
    }
  }

  async hget(key, field) {
    try {
      const fullKey = this.buildKey(key);
      const value = await this.redis.hget(fullKey, field);
      
      if (value === null) {
        return null;
      }

      return JSON.parse(value);

    } catch (error) {
      logger.error('Erreur Redis hget:', { error: error.message, key, field });
      return null;
    }
  }

  async hgetall(key) {
    try {
      const fullKey = this.buildKey(key);
      const hash = await this.redis.hgetall(fullKey);
      
      const result = {};
      for (const [field, value] of Object.entries(hash)) {
        try {
          result[field] = JSON.parse(value);
        } catch {
          result[field] = value; // Si pas JSON, garder la valeur brute
        }
      }

      return result;

    } catch (error) {
      logger.error('Erreur Redis hgetall:', { error: error.message, key });
      return {};
    }
  }

  async hdel(key, ...fields) {
    try {
      const fullKey = this.buildKey(key);
      return await this.redis.hdel(fullKey, ...fields);
    } catch (error) {
      logger.error('Erreur Redis hdel:', { error: error.message, key, fields });
      throw error;
    }
  }

  // Méthodes pour listes

  async lpush(key, ...values) {
    try {
      const fullKey = this.buildKey(key);
      const serializedValues = values.map(v => JSON.stringify(v));
      return await this.redis.lpush(fullKey, ...serializedValues);
    } catch (error) {
      logger.error('Erreur Redis lpush:', { error: error.message, key });
      throw error;
    }
  }

  async rpush(key, ...values) {
    try {
      const fullKey = this.buildKey(key);
      const serializedValues = values.map(v => JSON.stringify(v));
      return await this.redis.rpush(fullKey, ...serializedValues);
    } catch (error) {
      logger.error('Erreur Redis rpush:', { error: error.message, key });
      throw error;
    }
  }

  async lpop(key) {
    try {
      const fullKey = this.buildKey(key);
      const value = await this.redis.lpop(fullKey);
      
      if (value === null) {
        return null;
      }

      return JSON.parse(value);

    } catch (error) {
      logger.error('Erreur Redis lpop:', { error: error.message, key });
      return null;
    }
  }

  async rpop(key) {
    try {
      const fullKey = this.buildKey(key);
      const value = await this.redis.rpop(fullKey);
      
      if (value === null) {
        return null;
      }

      return JSON.parse(value);

    } catch (error) {
      logger.error('Erreur Redis rpop:', { error: error.message, key });
      return null;
    }
  }

  async lrange(key, start = 0, stop = -1) {
    try {
      const fullKey = this.buildKey(key);
      const values = await this.redis.lrange(fullKey, start, stop);
      
      return values.map(value => {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      });

    } catch (error) {
      logger.error('Erreur Redis lrange:', { error: error.message, key });
      return [];
    }
  }

  // Méthodes pour sorted sets

  async zadd(key, score, member) {
    try {
      const fullKey = this.buildKey(key);
      const serializedMember = JSON.stringify(member);
      return await this.redis.zadd(fullKey, score, serializedMember);
    } catch (error) {
      logger.error('Erreur Redis zadd:', { error: error.message, key });
      throw error;
    }
  }

  async zrange(key, start = 0, stop = -1, withScores = false) {
    try {
      const fullKey = this.buildKey(key);
      let values;
      
      if (withScores) {
        values = await this.redis.zrange(fullKey, start, stop, 'WITHSCORES');
        const result = [];
        for (let i = 0; i < values.length; i += 2) {
          result.push({
            member: JSON.parse(values[i]),
            score: parseFloat(values[i + 1])
          });
        }
        return result;
      } else {
        values = await this.redis.zrange(fullKey, start, stop);
        return values.map(value => JSON.parse(value));
      }

    } catch (error) {
      logger.error('Erreur Redis zrange:', { error: error.message, key });
      return [];
    }
  }

  async zrem(key, ...members) {
    try {
      const fullKey = this.buildKey(key);
      const serializedMembers = members.map(m => JSON.stringify(m));
      return await this.redis.zrem(fullKey, ...serializedMembers);
    } catch (error) {
      logger.error('Erreur Redis zrem:', { error: error.message, key });
      throw error;
    }
  }

  // Méthodes utilitaires

  async increment(key, amount = 1, ttl = null) {
    try {
      const fullKey = this.buildKey(key);
      const result = await this.redis.incrby(fullKey, amount);
      
      if (ttl !== null && ttl > 0) {
        await this.redis.expire(fullKey, ttl);
      }

      return result;

    } catch (error) {
      logger.error('Erreur Redis increment:', { error: error.message, key, amount });
      throw error;
    }
  }

  async decrement(key, amount = 1) {
    try {
      const fullKey = this.buildKey(key);
      return await this.redis.decrby(fullKey, amount);
    } catch (error) {
      logger.error('Erreur Redis decrement:', { error: error.message, key, amount });
      throw error;
    }
  }

  async keys(pattern) {
    try {
      const fullPattern = this.buildKey(pattern);
      return await this.redis.keys(fullPattern);
    } catch (error) {
      logger.error('Erreur Redis keys:', { error: error.message, pattern });
      return [];
    }
  }

  async deletePattern(pattern) {
    try {
      const keys = await this.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      return await this.redis.del(...keys);

    } catch (error) {
      logger.error('Erreur Redis deletePattern:', { error: error.message, pattern });
      return 0;
    }
  }

  // Pipeline et transactions

  pipeline() {
    return this.redis.pipeline();
  }

  async executePipeline(pipeline) {
    try {
      const results = await pipeline.exec();
      return results.map(([error, result]) => {
        if (error) throw error;
        return result;
      });
    } catch (error) {
      logger.error('Erreur pipeline Redis:', { error: error.message });
      throw error;
    }
  }

  // Verrouillage distribué

  async acquireLock(lockKey, ttl = 30, value = null) {
    try {
      const fullKey = this.buildKey('lock', lockKey);
      const lockValue = value || `${Date.now()}-${Math.random()}`;
      
      const result = await this.redis.set(fullKey, lockValue, 'PX', ttl * 1000, 'NX');
      
      if (result === 'OK') {
        logger.debug('Verrou acquis:', { lockKey, ttl });
        return { acquired: true, value: lockValue };
      }

      return { acquired: false, value: null };

    } catch (error) {
      logger.error('Erreur acquisition verrou:', { error: error.message, lockKey });
      return { acquired: false, value: null };
    }
  }

  async releaseLock(lockKey, lockValue) {
    try {
      const fullKey = this.buildKey('lock', lockKey);
      
      // Script Lua pour libération atomique
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      
      const result = await this.redis.eval(script, 1, fullKey, lockValue);
      
      logger.debug('Verrou libéré:', { lockKey, released: result === 1 });
      return result === 1;

    } catch (error) {
      logger.error('Erreur libération verrou:', { error: error.message, lockKey });
      return false;
    }
  }

  async withLock(lockKey, ttl, operation) {
    const lock = await this.acquireLock(lockKey, ttl);
    
    if (!lock.acquired) {
      throw new Error(`Impossible d'acquérir le verrou: ${lockKey}`);
    }

    try {
      return await operation();
    } finally {
      await this.releaseLock(lockKey, lock.value);
    }
  }
}

module.exports = RedisBaseRepository;
