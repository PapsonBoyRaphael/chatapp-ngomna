const redis = require('redis');
const config = require('../../../shared/config');
const logger = require('../../../shared/utils/logger');

class RedisConnection {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.client = redis.createClient(config.database.redis);
      
      this.client.on('error', (err) => {
        logger.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('✅ Redis connected');
      });

      await this.client.connect();
      return this.client;
    } catch (error) {
      this.isConnected = false;
      logger.error('❌ Redis connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.disconnect();
        this.isConnected = false;
        logger.info('📴 Redis disconnected');
      }
    } catch (error) {
      logger.warn('⚠️ Redis disconnect error:', error.message);
    }
  }

  getClient() {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis not connected');
    }
    return this.client;
  }

  isConnected() {
    return this.isConnected;
  }
}

module.exports = new RedisConnection();
