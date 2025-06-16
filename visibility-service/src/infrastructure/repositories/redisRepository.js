const client = require('../database/redisClient');

class RedisRepository {
  async set(key, value, ttlSeconds) {
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  }

  async get(key) {
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  }
}

module.exports = new RedisRepository();