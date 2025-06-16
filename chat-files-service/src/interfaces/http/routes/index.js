/**
 * Routes Index - Chat Files Service
 * CENADI Chat-Files-Service
 * Point d'entrée de toutes les routes API (sans administration)
 */

const express = require('express');
const { createLogger } = require('../../../shared/utils/logger');

// Import des middlewares
const {
  AuthMiddleware,
  UploadMiddleware,
  RateLimitMiddleware,
  ValidationMiddleware,
  CorsMiddleware,
  ErrorHandlerMiddleware
} = require('../middlewares');

// Import des routes
const filesRoutes = require('./files');
const usersRoutes = require('./users');
const chatsRoutes = require('./chats');
const healthRoutes = require('./health');

const logger = createLogger('Routes');

class RoutesManager {
  constructor(options = {}) {
    this.options = {
      enableCors: options.enableCors !== false,
      enableRateLimit: options.enableRateLimit !== false,
      enableAuth: options.enableAuth !== false,
      apiPrefix: options.apiPrefix || '/api',
      version: options.version || 'v1',
      ...options
    };

    // Initialiser les middlewares
    this.auth = new AuthMiddleware(options.auth);
    this.upload = new UploadMiddleware(options.upload);
    this.rateLimit = new RateLimitMiddleware(options.rateLimit);
    this.validation = new ValidationMiddleware(options.validation);
    this.cors = new CorsMiddleware(options.cors);
    this.errorHandler = new ErrorHandlerMiddleware(options.errorHandler);

    logger.info('🛣️ RoutesManager initialisé (service autonome)', {
      apiPrefix: this.options.apiPrefix,
      version: this.options.version,
      enableCors: this.options.enableCors
    });
  }

  // Configurer toutes les routes
  setupRoutes(app) {
    const router = express.Router();

    // Middlewares globaux
    this.setupGlobalMiddlewares(router);

    // Routes publiques (sans auth)
    this.setupPublicRoutes(router);

    // Routes protégées (avec auth)
    this.setupProtectedRoutes(router);

    // Gestion des erreurs
    this.setupErrorHandling(router);

    // Monter le router sur l'app
    app.use(`${this.options.apiPrefix}/${this.options.version}`, router);

    logger.info('✅ Toutes les routes configurées (service messagerie)');
    return router;
  }

  // Middlewares globaux
  setupGlobalMiddlewares(router) {
    // CORS
    if (this.options.enableCors) {
      router.use(this.cors.handle());
    }

    // Rate limiting global
    if (this.options.enableRateLimit) {
      router.use(this.rateLimit.apiLimiter());
    }

    // Parsing JSON
    router.use(express.json({ limit: '10mb' }));
    router.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request ID pour traçabilité
    router.use((req, res, next) => {
      req.requestId = require('crypto').randomBytes(16).toString('hex');
      res.set('X-Request-ID', req.requestId);
      next();
    });

    // Logging des requêtes
    router.use((req, res, next) => {
      logger.debug('📥 Requête API:', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.requestId
      });
      next();
    });
  }

  // Routes publiques
  setupPublicRoutes(router) {
    // Health checks (toujours publics)
    router.use('/health', healthRoutes.createRouter());

    // Téléchargement public avec token de partage
    router.use('/files', filesRoutes.createPublicRouter({
      auth: this.auth,
      validation: this.validation,
      rateLimit: this.rateLimit,
      cors: this.cors
    }));

    logger.debug('✅ Routes publiques configurées');
  }

  // Routes protégées (agents publics uniquement)
  setupProtectedRoutes(router) {
    // Authentification requise pour toutes les routes suivantes
    if (this.options.enableAuth) {
      router.use(this.auth.authenticate());
      router.use(this.auth.addVisibilityContext());
    }

    // Routes des fichiers (fonctionnalités principales)
    router.use('/files', filesRoutes.createProtectedRouter({
      auth: this.auth,
      upload: this.upload,
      validation: this.validation,
      rateLimit: this.rateLimit,
      cors: this.cors
    }));

    // Routes des utilisateurs (profils et avatars)
    router.use('/users', usersRoutes.createRouter({
      auth: this.auth,
      upload: this.upload,
      validation: this.validation,
      rateLimit: this.rateLimit
    }));

    // Routes des chats (gestion par chat)
    router.use('/chats', chatsRoutes.createRouter({
      auth: this.auth,
      validation: this.validation,
      rateLimit: this.rateLimit
    }));

    logger.debug('✅ Routes protégées configurées');
  }

  // Gestion des erreurs
  setupErrorHandling(router) {
    // Route 404
    router.use(this.errorHandler.notFound());

    // Gestionnaire d'erreurs global
    router.use(this.errorHandler.handle());
  }

  // Obtenir les statistiques des routes
  getStats() {
    return {
      auth: this.auth.getStats?.() || {},
      rateLimit: this.rateLimit.getStats?.() || {},
      cors: this.cors.getStats?.() || {},
      errors: this.errorHandler.getErrorStats?.() || {}
    };
  }
}

module.exports = RoutesManager;
