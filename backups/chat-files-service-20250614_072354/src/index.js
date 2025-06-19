const fastify = require('fastify')({ logger: false });
const path = require('path');

// Configuration
const config = require('./shared/config');
const logger = require('./shared/utils/logger');

// Initialisation de l'application
async function start() {
  try {
    logger.info('🚀 Starting Chat-Files-Service...');

    // Enregistrer les plugins
    await registerPlugins(config);

    // Initialiser les connexions
    const connections = await initializeConnections(logger);

    // Enregistrer les routes
    await registerRoutes(logger);

    // Initialiser Socket.IO si activé
    if (config.websocket.enabled) {
      const SocketIOServer = require('./interfaces/websocket/SocketIOServer');
      await SocketIOServer.initialize(fastify.server, config);
      logger.info('✅ Socket.IO initialized');
    }

    // Démarrer le serveur
    const host = config.server.host;
    const port = config.server.port;

    await fastify.listen({ host, port });

    logger.info('🎯 Chat-Files-Service running', {
      host,
      port,
      environment: config.app.environment,
      connections: {
        mongodb: connections.mongodb ? '✅' : '❌',
        redis: connections.redis ? '✅' : '❌',
        kafka: connections.kafka ? '✅' : '❌'
      }
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

async function registerPlugins(config) {
  // CORS
  await fastify.register(require('@fastify/cors'), config.security.cors);

  // Security headers
  await fastify.register(require('@fastify/helmet'), {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  });

  // Compression
  await fastify.register(require('@fastify/compress'), {
    global: true
  });

  // Servir les fichiers statiques
  await fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/public/'
  });

  // Multipart support for file uploads
  await fastify.register(require('@fastify/multipart'), {
    limits: {
      fileSize: config.fileStorage.maxFileSize,
      files: 5,
      fieldSize: 1024 * 1024
    }
  });

  // Rate limiting
  await fastify.register(require('@fastify/rate-limit'), {
    max: config.security.rateLimiting.max,
    timeWindow: config.security.rateLimiting.windowMs,
    errorResponseBuilder: function (request, context) {
      return {
        error: 'Too Many Requests',
        message: config.security.rateLimiting.message,
        statusCode: 429,
        retryAfter: Math.round(context.ttl / 1000)
      };
    }
  });
}

async function initializeConnections(logger) {
  const connections = {};

  // MongoDB
  try {
    const mongoConnection = require('./infrastructure/database/mongodb/connection');
    await mongoConnection.connect();
    connections.mongodb = true;
    logger.info('✅ MongoDB connected');
  } catch (error) {
    connections.mongodb = false;
    logger.warn('⚠️ MongoDB connection failed:', error.message);
  }

  // Redis
  try {
    const redisConnection = require('./infrastructure/database/redis/connection');
    await redisConnection.connect();
    connections.redis = true;
    logger.info('✅ Redis connected');
  } catch (error) {
    connections.redis = false;
    logger.warn('⚠️ Redis connection failed:', error.message);
  }

  // Kafka
  try {
    const kafkaService = require('./infrastructure/messaging/kafka/KafkaService');
    connections.kafka = await kafkaService.initialize();
    if (connections.kafka) {
      logger.info('✅ Kafka connected and ready');
    }
  } catch (error) {
    connections.kafka = false;
    logger.warn('⚠️ Kafka initialization failed:', error.message);
  }

  return connections;
}

async function registerRoutes(logger) {
  // Routes principales avec préfixe API
  await fastify.register(require('./interfaces/http/routes'), {
    prefix: '/api/v1'
  });

  // Route de base pour vérifier que le service fonctionne
  fastify.get('/', async (request, reply) => {
    return {
      service: 'CENADI Chat-Files-Service',
      status: 'running',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      documentation: '/api/v1',
      health: '/api/v1/health',
      tester: '/tester'
    };
  });

  // Route pour servir le testeur HTML directement
  fastify.get('/tester', async (request, reply) => {
    reply.type('text/html');
    const fs = require('fs');
    const path = require('path');
    
    try {
      const htmlPath = path.join(__dirname, 'public', 'chat-files-service-tester.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');
      return htmlContent;
    } catch (error) {
      reply.code(404);
      return {
        error: 'Testeur HTML non trouvé',
        message: 'Le fichier de test n\'a pas été trouvé dans src/public/',
        statusCode: 404
      };
    }
  });

  // Handler global pour les erreurs
  fastify.setErrorHandler(async (error, request, reply) => {
    const statusCode = error.statusCode || 500;

    // Log l'erreur
    logger.error('Request error:', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
      statusCode
    });

    // Réponse d'erreur standardisée
    reply.code(statusCode);
    return {
      error: error.name || 'Internal Server Error',
      message: statusCode === 500 ? 'An unexpected error occurred' : error.message,
      statusCode,
      timestamp: new Date().toISOString()
    };
  });
}

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('🔄 Shutting down gracefully...');
  try {
    await fastify.close();

    // Fermer les connexions
    try {
      const mongoConnection = require('./infrastructure/database/mongodb/connection');
      await mongoConnection.disconnect();
    } catch (error) {
      console.warn('MongoDB disconnect warning:', error.message);
    }

    try {
      const redisConnection = require('./infrastructure/database/redis/connection');
      await redisConnection.disconnect();
    } catch (error) {
      console.warn('Redis disconnect warning:', error.message);
    }

    // Fermer Kafka
    try {
      const kafkaService = require('./infrastructure/messaging/kafka/KafkaService');
      await kafkaService.disconnect();
    } catch (error) {
      console.warn('Kafka disconnect warning:', error.message);
    }

    console.log('✅ Server closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// Signal handlers
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Démarrer l'application
start();
