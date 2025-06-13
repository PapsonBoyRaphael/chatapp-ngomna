const { createClient } = require('redis');
const config = require('../../../shared/config');
const logger = require('../../../shared/utils/logger');

class RedisConnection {
  constructor() {
    this.client = null;
  }

  async connect() {
    try {
      this.client = createClient({
        url: config.database.redis.url,
        socket: {
          connectTimeout: 5000,
          commandTimeout: 5000,
        },
        retry_strategy: (options) => {
          if (options.attempt > 3) {
            return new Error('Max retry attempts reached');
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.client.on('error', (err) => {
        logger.error('❌ Redis Client Error:', err.message);
      });

      this.client.on('connect', () => {
        logger.info('✅ Redis connected');
      });

      await this.client.connect();
      
      // Test de connexion
      await this.client.ping();
      
    } catch (error) {
      logger.error('❌ Redis connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.quit();
        logger.info('📴 Redis disconnected');
      }
    } catch (error) {
      logger.error('❌ Redis disconnect error:', error);
    }
  }

  getClient() {
    return this.client;
  }
}

module.exports = new RedisConnection();
