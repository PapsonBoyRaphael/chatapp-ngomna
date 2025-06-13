const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');
const config = require('../../../shared/config');
const logger = require('../../../shared/utils/logger');

class MongoConnection {
  constructor() {
    this.client = null;
    this.db = null;
    this.mongoose = null;
  }

  async connect() {
    try {
      // Connexion MongoDB native pour GridFS
      this.client = new MongoClient(config.database.mongodb.uri, {
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        useNewUrlParser: true
      });
      
      await this.client.connect();
      this.db = this.client.db(config.database.mongodb.dbName);
      
      // Test de connexion
      await this.db.admin().ping();
      
      logger.info('✅ MongoDB connected successfully');
      
    } catch (error) {
      logger.error('❌ MongoDB connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.close();
      }
      if (this.mongoose) {
        await mongoose.disconnect();
      }
      logger.info('📴 MongoDB disconnected');
    } catch (error) {
      logger.error('❌ MongoDB disconnect error:', error);
    }
  }

  getDb() {
    return this.db;
  }

  getClient() {
    return this.client;
  }
}

module.exports = new MongoConnection();
