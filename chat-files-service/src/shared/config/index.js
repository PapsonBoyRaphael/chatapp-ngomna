/**
 * Configuration - Chat Files Service
 * CENADI Chat-Files-Service
 * Configuration centralisée (sans dépendance circulaire)
 */

const path = require('path');

// Logger simple pour éviter la dépendance circulaire
const simpleLogger = {
  info: (msg, meta) => console.log(`[INFO] [Config] ${msg}`, meta || ''),
  warn: (msg, meta) => console.warn(`[WARN] [Config] ${msg}`, meta || ''),
  error: (msg, meta) => console.error(`[ERROR] [Config] ${msg}`, meta || ''),
  debug: (msg, meta) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEBUG] [Config] ${msg}`, meta || '');
    }
  }
};

// Fonction pour charger les variables d'environnement
function loadEnvVariables() {
  try {
    require('dotenv').config();
    simpleLogger.info('Variables d\'environnement chargées depuis .env');
  } catch (error) {
    simpleLogger.warn('Fichier .env non trouvé, utilisation des variables système');
  }
}

// Charger les variables d'environnement
loadEnvVariables();

// Fonction pour obtenir une variable d'environnement avec valeur par défaut
function getEnvVar(name, defaultValue, type = 'string') {
  const value = process.env[name];
  
  if (value === undefined || value === '') {
    return defaultValue;
  }

  switch (type) {
    case 'number':
      const num = parseInt(value, 10);
      return isNaN(num) ? defaultValue : num;
    case 'boolean':
      return value.toLowerCase() === 'true';
    case 'array':
      return value.split(',').map(item => item.trim());
    default:
      return value;
  }
}

// Configuration de base
const config = {
  // Application
  app: {
    name: getEnvVar('APP_NAME', 'chat-files-service'),
    version: getEnvVar('APP_VERSION', '1.0.0'),
    environment: getEnvVar('NODE_ENV', 'development'),
    port: getEnvVar('PORT', 3001, 'number'),
    host: getEnvVar('HOST', '0.0.0.0'),
    baseUrl: getEnvVar('BASE_URL', 'http://localhost:3001')
  },

  // Serveur
  server: {
    cors: {
      origin: getEnvVar('CORS_ORIGIN', '*'),
      credentials: getEnvVar('CORS_CREDENTIALS', true, 'boolean'),
      methods: getEnvVar('CORS_METHODS', 'GET,HEAD,PUT,PATCH,POST,DELETE', 'array')
    },
    rateLimit: {
      windowMs: getEnvVar('RATE_LIMIT_WINDOW', 15 * 60 * 1000, 'number'), // 15 minutes
      max: getEnvVar('RATE_LIMIT_MAX', 100, 'number'), // 100 requêtes par fenêtre
      message: 'Trop de requêtes depuis cette IP'
    },
    bodyLimit: getEnvVar('BODY_LIMIT', '100mb'),
    timeout: getEnvVar('SERVER_TIMEOUT', 30000, 'number') // 30 secondes
  },

  // Base de données MongoDB
  database: {
    mongodb: {
      uri: getEnvVar('MONGODB_URI', 'mongodb://localhost:27017/chat_files_service'),
      options: {
        maxPoolSize: getEnvVar('MONGODB_MAX_POOL_SIZE', 10, 'number'),
        serverSelectionTimeoutMS: getEnvVar('MONGODB_SERVER_SELECTION_TIMEOUT', 5000, 'number'),
        socketTimeoutMS: getEnvVar('MONGODB_SOCKET_TIMEOUT', 45000, 'number'),
        bufferMaxEntries: 0, // Disable mongoose buffering
        retryWrites: true,
        w: 'majority'
      }
    }
  },

  // Redis pour cache et sessions
  redis: {
    uri: getEnvVar('REDIS_URI', 'redis://localhost:6379'),
    options: {
      retryDelayOnFailover: getEnvVar('REDIS_RETRY_DELAY', 100, 'number'),
      maxRetriesPerRequest: getEnvVar('REDIS_MAX_RETRIES', 3, 'number'),
      lazyConnect: true,
      keepAlive: true,
      family: 4 // IPv4
    },
    keyPrefix: getEnvVar('REDIS_KEY_PREFIX', 'chat_files:'),
    ttl: {
      default: getEnvVar('REDIS_TTL_DEFAULT', 3600, 'number'), // 1 heure
      session: getEnvVar('REDIS_TTL_SESSION', 86400, 'number'), // 24 heures
      cache: getEnvVar('REDIS_TTL_CACHE', 1800, 'number'), // 30 minutes
      tempData: getEnvVar('REDIS_TTL_TEMP', 300, 'number') // 5 minutes
    }
  },

  // Stockage des fichiers
  storage: {
    type: getEnvVar('STORAGE_TYPE', 'local'), // local, s3, gcs
    basePath: path.resolve(getEnvVar('STORAGE_BASE_PATH', './storage')),
    uploads: {
      path: path.resolve(getEnvVar('STORAGE_UPLOADS_PATH', './storage/uploads')),
      maxFileSize: getEnvVar('STORAGE_MAX_FILE_SIZE', 100 * 1024 * 1024, 'number'), // 100MB
      allowedTypes: getEnvVar('STORAGE_ALLOWED_TYPES', 'image/*,video/*,audio/*,application/pdf,text/*', 'array'),
      blockedExtensions: getEnvVar('STORAGE_BLOCKED_EXTENSIONS', 'exe,bat,cmd,com,scr', 'array')
    },
    thumbnails: {
      path: path.resolve(getEnvVar('STORAGE_THUMBNAILS_PATH', './storage/thumbnails')),
      sizes: getEnvVar('THUMBNAIL_SIZES', '150x150,300x300,600x600', 'array').map(size => {
        const [width, height] = size.split('x').map(Number);
        return { width, height };
      }),
      quality: getEnvVar('THUMBNAIL_QUALITY', 80, 'number'),
      format: getEnvVar('THUMBNAIL_FORMAT', 'jpeg')
    },
    temp: {
      path: path.resolve(getEnvVar('STORAGE_TEMP_PATH', './temp')),
      cleanupInterval: getEnvVar('TEMP_CLEANUP_INTERVAL', 3600000, 'number'), // 1 heure
      maxAge: getEnvVar('TEMP_MAX_AGE', 3600000, 'number') // 1 heure
    }
  },

  // Authentification JWT
  auth: {
    jwt: {
      secret: getEnvVar('JWT_SECRET', 'your-super-secret-jwt-key-change-this-in-production'),
      expiresIn: getEnvVar('JWT_EXPIRES_IN', '24h'),
      algorithm: getEnvVar('JWT_ALGORITHM', 'HS256'),
      issuer: getEnvVar('JWT_ISSUER', 'cenadi-chat-files-service'),
      audience: getEnvVar('JWT_AUDIENCE', 'cenadi-agents')
    },
    bcrypt: {
      saltRounds: getEnvVar('BCRYPT_SALT_ROUNDS', 12, 'number')
    }
  },

  // Services externes
  services: {
    chatService: {
      baseUrl: getEnvVar('CHAT_SERVICE_URL', 'http://localhost:3000'),
      timeout: getEnvVar('CHAT_SERVICE_TIMEOUT', 5000, 'number'),
      retries: getEnvVar('CHAT_SERVICE_RETRIES', 3, 'number')
    },
    visibilityService: {
      baseUrl: getEnvVar('VISIBILITY_SERVICE_URL', 'http://localhost:3002'),
      timeout: getEnvVar('VISIBILITY_SERVICE_TIMEOUT', 5000, 'number'),
      retries: getEnvVar('VISIBILITY_SERVICE_RETRIES', 3, 'number')
    },
    notificationService: {
      baseUrl: getEnvVar('NOTIFICATION_SERVICE_URL', 'http://localhost:3003'),
      timeout: getEnvVar('NOTIFICATION_SERVICE_TIMEOUT', 5000, 'number'),
      retries: getEnvVar('NOTIFICATION_SERVICE_RETRIES', 3, 'number')
    }
  },

  // Logging
  logging: {
    level: getEnvVar('LOG_LEVEL', 'info'),
    logDir: path.resolve(getEnvVar('LOG_DIR', './logs')),
    maxFiles: getEnvVar('LOG_MAX_FILES', 5, 'number'),
    maxSize: getEnvVar('LOG_MAX_SIZE', '10m'),
    colorize: getEnvVar('LOG_COLORIZE', config?.app?.environment !== 'production', 'boolean'),
    enableFileLogging: getEnvVar('LOG_ENABLE_FILE', true, 'boolean'),
    enableConsoleLogging: getEnvVar('LOG_ENABLE_CONSOLE', true, 'boolean')
  },

  // Traitement des fichiers
  processing: {
    maxConcurrentProcessing: getEnvVar('PROCESSING_MAX_CONCURRENT', 5, 'number'),
    enableThumbnails: getEnvVar('PROCESSING_ENABLE_THUMBNAILS', true, 'boolean'),
    enableMetadataExtraction: getEnvVar('PROCESSING_ENABLE_METADATA', true, 'boolean'),
    enableOptimization: getEnvVar('PROCESSING_ENABLE_OPTIMIZATION', false, 'boolean'),
    timeout: getEnvVar('PROCESSING_TIMEOUT', 300000, 'number'), // 5 minutes
    retries: getEnvVar('PROCESSING_RETRIES', 3, 'number')
  },

  // Partage de fichiers
  sharing: {
    maxExpirationDays: getEnvVar('SHARING_MAX_EXPIRATION_DAYS', 30, 'number'),
    maxDownloads: getEnvVar('SHARING_MAX_DOWNLOADS', 1000, 'number'),
    enablePasswordProtection: getEnvVar('SHARING_ENABLE_PASSWORD', true, 'boolean'),
    defaultExpiration: getEnvVar('SHARING_DEFAULT_EXPIRATION', 86400, 'number'), // 24 heures
    cleanupInterval: getEnvVar('SHARING_CLEANUP_INTERVAL', 3600000, 'number') // 1 heure
  },

  // Sécurité
  security: {
    enableEncryption: getEnvVar('SECURITY_ENABLE_ENCRYPTION', false, 'boolean'),
    encryptionKey: getEnvVar('SECURITY_ENCRYPTION_KEY', 'your-encryption-key-32-characters'),
    enableVirusScan: getEnvVar('SECURITY_ENABLE_VIRUS_SCAN', false, 'boolean'),
    maxRequestSize: getEnvVar('SECURITY_MAX_REQUEST_SIZE', '100mb'),
    allowedOrigins: getEnvVar('SECURITY_ALLOWED_ORIGINS', '*', 'array'),
    enableCSRF: getEnvVar('SECURITY_ENABLE_CSRF', false, 'boolean')
  },

  // Monitoring et métriques
  monitoring: {
    enableMetrics: getEnvVar('MONITORING_ENABLE_METRICS', true, 'boolean'),
    metricsInterval: getEnvVar('MONITORING_METRICS_INTERVAL', 60000, 'number'), // 1 minute
    enableHealthCheck: getEnvVar('MONITORING_ENABLE_HEALTH_CHECK', true, 'boolean'),
    healthCheckInterval: getEnvVar('MONITORING_HEALTH_CHECK_INTERVAL', 30000, 'number'), // 30 secondes
    enablePerformanceTracking: getEnvVar('MONITORING_ENABLE_PERFORMANCE', true, 'boolean')
  }
};

// Validation de la configuration
function validateConfig() {
  const errors = [];

  // Vérifier les champs obligatoires
  if (!config.database.mongodb.uri) {
    errors.push('MONGODB_URI est requis');
  }

  if (!config.auth.jwt.secret || config.auth.jwt.secret === 'your-super-secret-jwt-key-change-this-in-production') {
    errors.push('JWT_SECRET doit être défini avec une valeur sécurisée');
  }

  if (!config.storage.basePath) {
    errors.push('STORAGE_BASE_PATH est requis');
  }

  // Vérifier les ports
  if (config.app.port < 1 || config.app.port > 65535) {
    errors.push('PORT doit être entre 1 et 65535');
  }

  // Vérifier les tailles de fichiers
  if (config.storage.uploads.maxFileSize < 1024) {
    errors.push('STORAGE_MAX_FILE_SIZE doit être au moins 1KB');
  }

  if (errors.length > 0) {
    simpleLogger.error('Erreurs de configuration détectées:', errors);
    throw new Error(`Configuration invalide: ${errors.join(', ')}`);
  }

  simpleLogger.info('✅ Configuration validée avec succès');
}

// Afficher la configuration au démarrage (sans données sensibles)
function displayConfig() {
  if (config.app.environment === 'development') {
    const safeConfig = {
      app: config.app,
      server: { ...config.server, rateLimit: { ...config.server.rateLimit } },
      storage: { ...config.storage, uploads: { ...config.storage.uploads } },
      logging: config.logging,
      processing: config.processing
    };

    simpleLogger.info('Configuration actuelle:', safeConfig);
  }
}

// Créer les dossiers nécessaires
function createDirectories() {
  const fs = require('fs');
  const directories = [
    config.storage.basePath,
    config.storage.uploads.path,
    config.storage.thumbnails.path,
    config.storage.temp.path,
    config.logging.logDir
  ];

  directories.forEach(dir => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        simpleLogger.info(`📁 Dossier créé: ${dir}`);
      }
    } catch (error) {
      simpleLogger.warn(`⚠️ Impossible de créer le dossier ${dir}:`, error.message);
    }
  });
}

// Initialiser la configuration
function initializeConfig() {
  try {
    validateConfig();
    createDirectories();
    displayConfig();
    
    simpleLogger.info('🚀 Configuration initialisée avec succès');
    
    // Maintenant on peut configurer les loggers avec la vraie config
    setTimeout(() => {
      try {
        const { configureLoggers } = require('../utils/logger');
        configureLoggers(config);
      } catch (error) {
        simpleLogger.warn('⚠️ Impossible de reconfigurer les loggers:', error.message);
      }
    }, 100);
    
    return config;
  } catch (error) {
    simpleLogger.error('❌ Erreur initialisation configuration:', error.message);
    process.exit(1);
  }
}

// Exporter la configuration
module.exports = initializeConfig();

// Fonction pour obtenir la configuration (utile pour les tests)
module.exports.getConfig = () => config;
module.exports.validateConfig = validateConfig;
module.exports.createDirectories = createDirectories;
