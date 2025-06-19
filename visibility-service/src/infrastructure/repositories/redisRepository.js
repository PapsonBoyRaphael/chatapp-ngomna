const client = require('../database/redisClient');

class RedisRepository {
  async set(key, value, ttlSeconds) {
    try {
      await client.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (error) {
      console.error('Redis Set Error:', error.message);
    }
  }

  async get(key) {
    try {
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis Get Error:', error.message);
      return null;
    }
  }

  async cacheUnitSearch(query, units) {
    const key = `units:search:${query.toLowerCase()}`;
    await this.set(key, units, 300); // 5-minute TTL
  }

  async getCachedUnitSearch(query) {
    const key = `units:search:${query.toLowerCase()}`;
    return await this.get(key);
  }
}

module.exports = new RedisRepository();