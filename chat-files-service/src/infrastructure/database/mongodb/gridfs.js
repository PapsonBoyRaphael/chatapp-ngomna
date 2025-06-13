const { GridFSBucket } = require('mongodb');
const mongoConnection = require('./connection');
const logger = require('../../../shared/utils/logger');

class GridFSConfig {
  constructor() {
    this.bucket = null;
  }

  initialize() {
    const db = mongoConnection.getDb();
    this.bucket = new GridFSBucket(db, {
      bucketName: 'files',
      chunkSizeBytes: 1024 * 1024 // 1MB chunks
    });
    
    logger.info('✅ GridFS initialized');
  }

  getBucket() {
    if (!this.bucket) {
      this.initialize();
    }
    return this.bucket;
  }
}

module.exports = new GridFSConfig();
