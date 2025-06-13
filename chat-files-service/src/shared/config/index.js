const path = require('path');

const config = {
  server: {
    port: process.env.PORT || 3001,
    host: process.env.HOST || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  
  database: {
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/chat_cenadi_dev',
      dbName: process.env.MONGODB_DB_NAME || 'chat_cenadi_dev'
    },
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD || '',
      db: parseInt(process.env.REDIS_DB) || 0
    }
  },
  
  kafka: {
    brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
    clientId: process.env.KAFKA_CLIENT_ID || 'chat-files-service',
    groupId: process.env.KAFKA_GROUP_ID || 'chat-files-group'
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  
  fileStorage: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 52428800, // 50MB
    allowedTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm',
      'application/pdf', 'text/plain'
    ],
    tempDir: path.join(__dirname, '../../../temp')
  },
  
  externalServices: {
    authUserService: process.env.AUTH_USER_SERVICE_URL || 'http://localhost:3000',
    visibilityService: process.env.VISIBILITY_SERVICE_URL || 'http://localhost:3002'
  },
  
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY || 'your-32-character-encryption-key',
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  },
  
  monitoring: {
    logLevel: process.env.LOG_LEVEL || 'info',
    enableMetrics: process.env.ENABLE_METRICS === 'true'
  }
};

module.exports = config;
