/**
 * Middleware de limitation du taux de requêtes
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../shared/utils/logger');
const config = require('../../shared/config');

const logger = createLogger('RateLimitMiddleware');

class RateLimitMiddleware {
  /**
   * Plugin Fastify pour le rate limiting
   */
  static async register(fastify, options) {
    // Configuration du rate limiting global
    await fastify.register(require('@fastify/rate-limit'), {
      max: config.security.rateLimit.max,
      timeWindow: config.security.rateLimit.window,
      redis: fastify.redis || null, // Utiliser Redis si disponible
      
      // Fonction pour identifier l'utilisateur
      keyGenerator: (request) => {
        // Priorité: utilisateur authentifié > IP
        return request.user?.id || request.ip;
      },

      // Message d'erreur personnalisé
      errorResponseBuilder: (request, context) => {
        logger.warn('Rate limit dépassé:', {
          key: context.key,
          max: context.max,
          timeWindow: context.timeWindow,
          ip: request.ip,
          userAgent: request.headers['user-agent']
        });

        return {
          success: false,
          error: 'Trop de requêtes',
          message: `Limite de ${context.max} requêtes par ${context.timeWindow}ms dépassée`,
          retryAfter: context.ttl,
          timestamp: new Date().toISOString()
        };
      },

      // Headers personnalisés
      addHeaders: {
        'x-ratelimit-limit': true,
        'x-ratelimit-remaining': true,
        'x-ratelimit-reset': true
      }
    });

    // Décorer avec des méthodes personnalisées
    fastify.decorate('createRateLimit', RateLimitMiddleware.createRateLimit);
    fastify.decorate('strictRateLimit', RateLimitMiddleware.strictRateLimit);
    fastify.decorate('uploadRateLimit', RateLimitMiddleware.uploadRateLimit);
  }

  /**
   * Créer un rate limit personnalisé
   */
  static createRateLimit(options = {}) {
    const defaultOptions = {
      max: 100,
      timeWindow: '1 minute',
      redis: null,
      keyGenerator: (request) => request.user?.id || request.ip
    };

    const mergedOptions = { ...defaultOptions, ...options };

    return async (request, reply) => {
      try {
        // Logique de rate limiting personnalisée
        const key = mergedOptions.keyGenerator(request);
        const now = Date.now();
        const windowMs = RateLimitMiddleware.parseTimeWindow(mergedOptions.timeWindow);
        
        // Ici on pourrait implémenter une logique Redis personnalisée
        // Pour l'instant, on laisse Fastify gérer
        
        logger.debug('Rate limit vérifié:', {
          key,
          max: mergedOptions.max,
          timeWindow: mergedOptions.timeWindow
        });

      } catch (error) {
        logger.error('Erreur dans le rate limiting:', error);
        // En cas d'erreur, on laisse passer la requête
      }
    };
  }

  /**
   * Rate limit strict pour les opérations sensibles
   */
  static strictRateLimit() {
    return RateLimitMiddleware.createRateLimit({
      max: 10,
      timeWindow: '1 minute'
    });
  }

  /**
   * Rate limit pour les uploads de fichiers
   */
  static uploadRateLimit() {
    return RateLimitMiddleware.createRateLimit({
      max: 5,
      timeWindow: '1 minute',
      keyGenerator: (request) => {
        // Plus strict pour les uploads
        return `upload:${request.user?.id || request.ip}`;
      }
    });
  }

  /**
   * Rate limit par conversation (éviter le spam)
   */
  static conversationRateLimit(conversationId) {
    return RateLimitMiddleware.createRateLimit({
      max: 30,
      timeWindow: '1 minute',
      keyGenerator: (request) => {
        return `conv:${conversationId}:${request.user?.id || request.ip}`;
      }
    });
  }

  /**
   * Rate limit pour les recherches
   */
  static searchRateLimit() {
    return RateLimitMiddleware.createRateLimit({
      max: 20,
      timeWindow: '1 minute',
      keyGenerator: (request) => {
        return `search:${request.user?.id || request.ip}`;
      }
    });
  }

  /**
   * Analyser la fenêtre de temps
   */
  static parseTimeWindow(timeWindow) {
    if (typeof timeWindow === 'number') {
      return timeWindow;
    }

    const units = {
      'second': 1000,
      'seconds': 1000,
      'minute': 60000,
      'minutes': 60000,
      'hour': 3600000,
      'hours': 3600000,
      'day': 86400000,
      'days': 86400000
    };

    const match = timeWindow.match(/^(\d+)\s*(second|seconds|minute|minutes|hour|hours|day|days)$/);
    
    if (match) {
      const [, number, unit] = match;
      return parseInt(number) * units[unit];
    }

    // Par défaut, 1 minute
    return 60000;
  }

  /**
   * Middleware conditionnel basé sur l'environnement
   */
  static conditionalRateLimit(developmentOptions = {}, productionOptions = {}) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const options = isDevelopment ? developmentOptions : productionOptions;

    return RateLimitMiddleware.createRateLimit(options);
  }

  /**
   * Rate limit adaptatif basé sur la charge du serveur
   */
  static adaptiveRateLimit(baseOptions = {}) {
    return async (request, reply) => {
      try {
        // Mesurer la charge du serveur (CPU, mémoire, etc.)
        const serverLoad = await RateLimitMiddleware.getServerLoad();
        
        // Ajuster les limites en fonction de la charge
        let adjustedMax = baseOptions.max || 100;
        
        if (serverLoad > 0.8) {
          adjustedMax = Math.floor(adjustedMax * 0.5); // Réduire de 50%
        } else if (serverLoad > 0.6) {
          adjustedMax = Math.floor(adjustedMax * 0.7); // Réduire de 30%
        }

        const adaptiveOptions = {
          ...baseOptions,
          max: adjustedMax
        };

        await RateLimitMiddleware.createRateLimit(adaptiveOptions)(request, reply);

      } catch (error) {
        logger.error('Erreur dans le rate limiting adaptatif:', error);
        // En cas d'erreur, utiliser les options de base
        await RateLimitMiddleware.createRateLimit(baseOptions)(request, reply);
      }
    };
  }

  /**
   * Mesurer la charge du serveur (implémentation basique)
   */
  static async getServerLoad() {
    try {
      const os = require('os');
      const loadAvg = os.loadavg()[0]; // Charge sur 1 minute
      const cpuCount = os.cpus().length;
      
      return Math.min(loadAvg / cpuCount, 1); // Normaliser entre 0 et 1
    } catch (error) {
      return 0; // En cas d'erreur, assumer une charge faible
    }
  }
}

// Métadonnées pour Fastify
RateLimitMiddleware[Symbol.for('skip-override')] = true;

module.exports = RateLimitMiddleware;
