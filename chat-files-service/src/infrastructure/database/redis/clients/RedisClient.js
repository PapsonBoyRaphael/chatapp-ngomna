/**
 * Client Redis de base
 * CENADI Chat-Files-Service
 */

const Redis = require('ioredis');
const { createLogger } = require('../../../shared/utils/logger');
const { ConfigService } = require('../../../shared/config/ConfigService');

const logger = createLogger('RedisClient');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.retryAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 1000; // 1 seconde
    
    this.config = {
      host: ConfigService.get('REDIS_HOST', 'localhost'),
      port: ConfigService.get('REDIS_PORT', 6379),
      password: ConfigService.get('REDIS_PASSWORD'),
      db: ConfigService.get('REDIS_DB', 0),
      keyPrefix: ConfigService.get('REDIS_KEY_PREFIX', 'chat-files:'),
      connectTimeout: ConfigService.get('REDIS_CONNECT_TIMEOUT', 10000),
      lazyConnect: true,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false
    };
  }

  async connect() {
    try {
      if (this.client && this.isConnected) {
        logger.debug('Client Redis déjà connecté');
        return this.client;
      }

      logger.info('Connexion à Redis...', {
        host: this.config.host,
        port: this.config.port,
        db: this.config.db
      });

      this.client = new Redis(this.config);

      // Événements de connexion
      this.client.on('connect', () => {
        logger.info('Connexion Redis établie');
        this.isConnected = true;
        this.retryAttempts = 0;
      });

      this.client.on('ready', () => {
        logger.info('Client Redis prêt');
      });

      this.client.on('error', (error) => {
        logger.error('Erreur Redis:', { error: error.message });
        this.isConnected = false;
      });

      this.client.on('close', () => {
        logger.warn('Connexion Redis fermée');
        this.isConnected = false;
      });

      this.client.on('reconnecting', (delay) => {
        logger.info('Reconnexion Redis...', { delay });
      });

      this.client.on('end', () => {
        logger.warn('Connexion Redis terminée');
        this.isConnected = false;
      });

      // Tester la connexion
      await this.client.ping();
      
      return this.client;

    } catch (error) {
      logger.error('Erreur connexion Redis:', { error: error.message });
      this.isConnected = false;
      
      if (this.retryAttempts < this.maxRetries) {
        this.retryAttempts++;
        logger.info(`Tentative de reconnexion ${this.retryAttempts}/${this.maxRetries}...`);
        
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * this.retryAttempts));
        return this.connect();
      }
      
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        logger.info('Déconnexion Redis...');
        await this.client.quit();
        this.client = null;
        this.isConnected = false;
        logger.info('Redis déconnecté');
      }
    } catch (error) {
      logger.error('Erreur déconnexion Redis:', { error: error.message });
      throw error;
    }
  }

  getClient() {
    if (!this.client || !this.isConnected) {
      throw new Error('Client Redis non connecté');
    }
    return this.client;
  }

  async ping() {
    try {
      const client = this.getClient();
      const result = await client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Erreur ping Redis:', { error: error.message });
      return false;
    }
  }

  async flushdb() {
    try {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('FLUSHDB non autorisé en production');
      }
      
      const client = this.getClient();
      await client.flushdb();
      logger.info('Base Redis vidée');
    } catch (error) {
      logger.error('Erreur vidage Redis:', { error: error.message });
      throw error;
    }
  }

  async info() {
    try {
      const client = this.getClient();
      const info = await client.info();
      return info;
    } catch (error) {
      logger.error('Erreur info Redis:', { error: error.message });
      throw error;
    }
  }

  async getStats() {
    try {
      const client = this.getClient();
      const info = await client.info('memory');
      const keyspace = await client.info('keyspace');
      
      return {
        connected: this.isConnected,
        memory: this.parseInfo(info),
        keyspace: this.parseInfo(keyspace)
      };
    } catch (error) {
      logger.error('Erreur stats Redis:', { error: error.message });
      return {
        connected: false,
        error: error.message
      };
    }
  }

  parseInfo(infoString) {
    const result = {};
    const lines = infoString.split('\r\n');
    
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key] = value;
        }
      }
    }
    
    return result;
  }

  // Méthodes utilitaires pour les clés
  buildKey(...parts) {
    return parts.filter(part => part !== undefined && part !== null).join(':');
  }

  addPrefix(key) {
    return `${this.config.keyPrefix}${key}`;
  }

  removePrefix(key) {
    if (key.startsWith(this.config.keyPrefix)) {
      return key.substring(this.config.keyPrefix.length);
    }
    return key;
  }
}

module.exports = RedisClient;
