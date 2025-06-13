const dotenv = require('dotenv');
dotenv.config();

// Supprimer le warning Kafka
process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';

const fastify = require('fastify')({
  logger:
    process.env.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }
      : true,
  trustProxy: true,
});

const config = require('./shared/config');
const logger = require('./shared/utils/logger');

async function start() {
  try {
    logger.info('🚀 Starting Chat-Files-Service...');

    // Register Fastify plugins
    await fastify.register(require('@fastify/cors'), {
      origin: true,
      credentials: true,
    });

    await fastify.register(require('@fastify/helmet'), {
      contentSecurityPolicy: false,
    });

    await fastify.register(require('@fastify/compress'));

    // Rate limiting
    await fastify.register(require('@fastify/rate-limit'), {
      max: 100,
      timeWindow: '15 minutes',
      cache: 10000,
      allowList: ['127.0.0.1'],
      keyGenerator: function (request) {
        return request.user?.id || request.ip;
      },
    });

    await fastify.register(require('@fastify/multipart'), {
      limits: {
        fileSize: config.fileStorage.maxFileSize,
        files: 10,
      },
    });

    logger.info('✅ Fastify plugins registered');

    // Connect to databases (avec gestion d'erreur)
    try {
      const mongoConnection = require('./infrastructure/database/mongodb/connection');
      await mongoConnection.connect();
      logger.info('✅ MongoDB connected');
    } catch (error) {
      logger.warn(
        '⚠️ MongoDB connection failed, continuing without it:',
        error.message
      );
    }

    try {
      const redisConnection = require('./infrastructure/database/redis/connection');
      await redisConnection.connect();
      logger.info('✅ Redis connected');
    } catch (error) {
      logger.warn(
        '⚠️ Redis connection failed, continuing without it:',
        error.message
      );
    }

    try {
      const kafkaProducer = require('./infrastructure/messaging/kafka/KafkaProducer');
      await kafkaProducer.connect();
      logger.info('✅ Kafka connected');
    } catch (error) {
      logger.warn(
        '⚠️ Kafka connection failed, continuing without it:',
        error.message
      );
    }

    // Register routes
    await fastify.register(require('./interfaces/http/routes'), {
      prefix: '/api/v1',
    });

    logger.info('✅ Routes registered');

    // Initialize WebSocket (optionnel)
    try {
      const SocketIOServer = require('./interfaces/websocket/SocketIOServer');
      const io = new SocketIOServer(fastify.server);
      await io.initialize();
      logger.info('✅ WebSocket server initialized');
    } catch (error) {
      logger.warn('⚠️ WebSocket initialization failed:', error.message);
    }

    // Start server
    const port = config.server.port;
    const host = config.server.host;

    await fastify.listen({ port, host });

    logger.info(`🎯 Chat-Files-Service running on ${host}:${port}`);
    logger.info(`📚 Health check: http://${host}:${port}/api/v1/health`);
    logger.info(`📋 API docs: http://${host}:${port}/api/v1`);
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('🔄 Shutting down gracefully...');
  try {
    await fastify.close();
    logger.info('✅ Server closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

start();
