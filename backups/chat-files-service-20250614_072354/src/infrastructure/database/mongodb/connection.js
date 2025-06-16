const { MongoClient } = require('mongodb');
const config = require('../../../shared/config');
const logger = require('../../../shared/utils/logger');

class MongoConnection {
  constructor() {
    this.client = null;
    this.db = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.client = new MongoClient(config.database.mongodb.uri, config.database.mongodb.options);
      await this.client.connect();
      this.db = this.client.db(config.database.mongodb.dbName);
      await this.db.admin().ping();
      this.isConnected = true;
      logger.info('✅ MongoDB connected successfully');
      return this.db;
    } catch (error) {
      this.isConnected = false;
      logger.error('❌ MongoDB connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.close();
        this.isConnected = false;
        logger.info('📴 MongoDB disconnected');
      }
    } catch (error) {
      logger.warn('⚠️ MongoDB disconnect error:', error.message);
    }
  }

  getDb() {
    if (!this.isConnected || !this.db) {
      throw new Error('MongoDB not connected');
    }
    return this.db;
  }

  isConnected() {
    return this.isConnected;
  }
}

module.exports = new MongoConnection();
