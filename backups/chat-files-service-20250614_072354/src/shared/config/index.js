const dotenv = require('dotenv');
dotenv.config();

const config = {
  server: {
    port: parseInt(process.env.PORT) || 3001,
    host: process.env.HOST || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development'
  },

  database: {
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/chat_cenadi_dev',
      dbName: process.env.MONGODB_DB_NAME || 'chat_cenadi_dev',
      options: {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        heartbeatFrequencyMS: 2000,
        maxIdleTimeMS: 30000,
        retryWrites: true,
        retryReads: true
      }
    },
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      options: {
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
        connectTimeout: 5000,
        commandTimeout: 5000,
        lazyConnect: true
      }
    }
  },

  kafka: {
    enabled: process.env.ENABLE_KAFKA === 'true',
    clientId: process.env.KAFKA_CLIENT_ID || 'chat-files-service',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    topics: {
      messages: 'chat.messages',
      files: 'chat.files',
      conversations: 'chat.conversations',
      notifications: 'chat.notifications'
    }
  },

  fileStorage: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024,
    allowedMimeTypes: [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'text/csv',
      'video/mp4', 'video/avi', 'video/mov',
      'audio/mp3', 'audio/wav', 'audio/ogg',
      'application/zip', 'application/rar'
    ],
    uploadPath: process.env.UPLOAD_PATH || './temp/uploads',
    thumbnailPath: process.env.THUMBNAIL_PATH || './temp/thumbnails',
    processingPath: process.env.PROCESSING_PATH || './temp/processing'
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    algorithms: ['HS256'],
    expiresIn: '24h'
  },

  externalServices: {
    authService: {
      url: process.env.AUTH_SERVICE_URL || 'http://localhost:3000',
      timeout: parseInt(process.env.AUTH_SERVICE_TIMEOUT) || 5000
    },
    visibilityService: {
      url: process.env.VISIBILITY_SERVICE_URL || 'http://localhost:3002',
      timeout: parseInt(process.env.VISIBILITY_SERVICE_TIMEOUT) || 5000
    }
  },

  websocket: {
    enabled: process.env.ENABLE_WEBSOCKET !== 'false',
    cors: {
      origin: process.env.WEBSOCKET_CORS_ORIGIN || '*',
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    pingTimeout: parseInt(process.env.WEBSOCKET_PING_TIMEOUT) || 60000,
    pingInterval: parseInt(process.env.WEBSOCKET_PING_INTERVAL) || 25000
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    directory: './logs',
    maxFileSize: process.env.LOG_MAX_SIZE || '10MB',
    maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5
  },

  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    rateLimiting: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
      message: 'Too many requests from this IP, please try again later'
    },
    cors: {
      origin: process.env.CORS_ORIGIN || true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
    }
  }
};

// Validation de la configuration
function validateConfig() {
  const errors = [];

  if (!config.server.port || config.server.port < 1 || config.server.port > 65535) {
    errors.push('Invalid server port');
  }

  if (!config.database.mongodb.uri) {
    errors.push('MongoDB URI is required');
  }

  if (!config.jwt.secret || config.jwt.secret === 'your-secret-key') {
    console.warn('⚠️ Warning: Using default JWT secret. Please set JWT_SECRET in production!');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
  }
}

// Valider la configuration au chargement
try {
  validateConfig();
} catch (error) {
  console.error('❌ Configuration Error:', error.message);
  process.exit(1);
}

module.exports = config;
