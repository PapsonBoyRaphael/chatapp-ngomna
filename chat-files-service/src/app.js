/**
 * Configuration principale de l'application Fastify
 * CENADI Chat-Files-Service
 */

const fastify = require('fastify');
const path = require('path');
const config = require('./shared/config');
const { createLogger } = require('./shared/utils/logger');

const logger = createLogger('app');

/**
 * Créer et configurer l'instance Fastify
 */
const createApp = async () => {
  try {
    // Configuration de base Fastify
    const app = fastify({
      logger: {
        level: config.app.logLevel,
        transport: config.app.environment === 'development' ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname'
          }
        } : undefined
      },
      trustProxy: true,
      bodyLimit: config.files.maxFileSize,
      keepAliveTimeout: 30000,
      connectionTimeout: 10000
    });

    // Enregistrement des plugins de base
    await registerBasePlugins(app);
    
    // Enregistrement des middlewares
    await registerMiddlewares(app);
    
    // Enregistrement des routes
    await registerRoutes(app);
    
    // Gestion des erreurs
    await registerErrorHandlers(app);

    logger.info('✅ Application Fastify configurée avec succès');
    return app;

  } catch (error) {
    logger.error('❌ Erreur lors de la configuration de l\'application:', error);
    throw error;
  }
};

/**
 * Enregistrer les plugins de base
 */
const registerBasePlugins = async (app) => {
  // CORS
  await app.register(require('@fastify/cors'), config.security.cors);

  // Security headers
  await app.register(require('@fastify/helmet'), config.security.helmet);

  // Compression
  await app.register(require('@fastify/compress'), config.compression);

  // Support multipart pour upload de fichiers
  await app.register(require('@fastify/multipart'), config.files.multipart);

  // Fichiers statiques
  await app.register(require('@fastify/static'), {
    root: path.join(__dirname, '../storage'),
    prefix: '/static/',
    decorateReply: false
  });

  // Rate limiting
  await app.register(require('@fastify/rate-limit'), config.security.rateLimit);

  logger.info('✅ Plugins de base enregistrés');
};

/**
 * Enregistrer les middlewares
 */
const registerMiddlewares = async (app) => {
  // Middleware d'authentification
  await app.register(require('./interfaces/http/middlewares/authMiddleware'));
  
  // Middleware de validation
  await app.register(require('./interfaces/http/middlewares/validationMiddleware'));
  
  // Middleware de gestion des erreurs
  await app.register(require('./interfaces/http/middlewares/errorMiddleware'));

  logger.info('✅ Middlewares enregistrés');
};

/**
 * Enregistrer les routes
 */
const registerRoutes = async (app) => {
  // Routes principales
  await app.register(require('./interfaces/http/routes'), {
    prefix: '/api/v1'
  });

  // Route de santé (sans préfixe pour les health checks)
  app.get('/health', async (request, reply) => {
    return {
      status: 'healthy',
      service: config.app.name,
      version: config.app.version,
      timestamp: new Date().toISOString(),
      environment: config.app.environment
    };
  });

  // Route racine
  app.get('/', async (request, reply) => {
    return {
      service: config.app.name,
      version: config.app.version,
      status: 'running',
      timestamp: new Date().toISOString(),
      environment: config.app.environment,
      endpoints: {
        api: '/api/v1',
        health: '/health',
        docs: '/api/v1/docs',
        websocket: config.websocket.enabled ? 'ws://localhost:' + config.server.port : 'disabled'
      }
    };
  });

  logger.info('✅ Routes enregistrées');
};

/**
 * Enregistrer les gestionnaires d'erreurs
 */
const registerErrorHandlers = async (app) => {
  // Gestionnaire d'erreurs global
  app.setErrorHandler(async (error, request, reply) => {
    logger.error('Erreur non gérée:', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method
    });

    const statusCode = error.statusCode || 500;
    const isDevelopment = config.app.environment === 'development';

    reply.status(statusCode).send({
      error: true,
      message: error.message || 'Erreur interne du serveur',
      statusCode,
      timestamp: new Date().toISOString(),
      ...(isDevelopment && { stack: error.stack })
    });
  });

  // Gestionnaire pour les routes non trouvées
  app.setNotFoundHandler(async (request, reply) => {
    reply.status(404).send({
      error: true,
      message: 'Route non trouvée',
      statusCode: 404,
      timestamp: new Date().toISOString(),
      path: request.url
    });
  });

  logger.info('✅ Gestionnaires d\'erreurs enregistrés');
};

module.exports = createApp;
