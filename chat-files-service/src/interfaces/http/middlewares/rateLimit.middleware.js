/**
 * Rate Limiting Middleware - Chat Files Service
 * CENADI Chat-Files-Service
 * Protection contre les abus et surcharge pour messagerie
 */

const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('RateLimitMiddleware');

class RateLimitMiddleware {
  constructor(options = {}) {
    this.options = {
      // Limites par défaut pour messagerie
      requests: {
        perMinute: options.requestsPerMinute || 60,      // 60 requêtes/minute
        perHour: options.requestsPerHour || 1000,        // 1000 requêtes/heure
        perDay: options.requestsPerDay || 10000          // 10k requêtes/jour
      },
      
      // Limites spécifiques par endpoint
      endpoints: {
        '/api/files/upload': {
          perMinute: 10,    // 10 uploads/minute
          perHour: 100,     // 100 uploads/heure
          sizePerMinute: 100 * 1024 * 1024,  // 100MB/minute
          sizePerHour: 1024 * 1024 * 1024    // 1GB/heure
        },
        '/api/files/:fileId/download': {
          perMinute: 30,    // 30 téléchargements/minute
          perHour: 500,     // 500 téléchargements/heure
          sizePerMinute: 500 * 1024 * 1024,  // 500MB/minute
          sizePerHour: 5 * 1024 * 1024 * 1024 // 5GB/heure
        },
        '/api/files': {
          perMinute: 120,   // 120 listings/minute (pour interface chat)
          perHour: 2000     // 2000 listings/heure
        }
      },
      
      // Configuration de stockage
      storage: options.storage || 'memory', // 'memory', 'redis'
      redisUrl: options.redisUrl || process.env.REDIS_URL,
      keyPrefix: options.keyPrefix || 'ratelimit:chat-files:',
      
      // Comportement
      skipSuccessfulRequests: false,
      skipFailedRequests: true,
      enableHeaderInfo: true,
      customHeaders: {
        remaining: 'X-RateLimit-Remaining',
        reset: 'X-RateLimit-Reset',
        total: 'X-RateLimit-Limit'
      },
      
      // Exemptions
      whitelist: options.whitelist || [],          // IPs exemptées
      skipIf: options.skipIf,                      // Fonction custom d'exemption
      
      // Escalation progressive
      enableWarnings: true,
      warningThreshold: 0.8,                       // Warning à 80% de la limite
      enableSlowdown: true,                        // Ralentir avant bloquer
      slowdownThreshold: 0.9,                      // Ralentir à 90%
      slowdownDelay: 1000,                         // 1 seconde de délai
      
      ...options
    };

    // Stockage en mémoire ou Redis
    this.store = this.createStore();
    this.slowdownStore = new Map(); // Pour les délais progressifs

    logger.info('🚦 RateLimitMiddleware créé pour messagerie', {
      storage: this.options.storage,
      requestsPerMinute: this.options.requests.perMinute,
      enableWarnings: this.options.enableWarnings,
      enableSlowdown: this.options.enableSlowdown
    });
  }

  // Middleware principal de rate limiting
  createLimiter(customOptions = {}) {
    const config = { ...this.options, ...customOptions };
    
    return async (req, res, next) => {
      try {
        const key = this.generateKey(req);
        const endpoint = this.detectEndpoint(req.path);
        const limits = this.getLimitsForEndpoint(endpoint);
        
        // Vérifier les exemptions
        if (this.shouldSkip(req)) {
          return next();
        }

        // Obtenir les compteurs actuels
        const counts = await this.getCounts(key);
        
        // Vérifier chaque limite (minute, heure, jour)
        const checkResults = await this.checkAllLimits(counts, limits, req);
        
        if (checkResults.blocked) {
          return this.sendRateLimitResponse(res, checkResults);
        }

        // Incrémenter les compteurs
        await this.incrementCounts(key, req, limits);
        
        // Ajouter les headers informatifs
        if (this.options.enableHeaderInfo) {
          this.addRateLimitHeaders(res, checkResults, limits);
        }

        // Gestion des warnings et ralentissements
        await this.handleProgressive(req, res, checkResults, limits);
        
        next();

      } catch (error) {
        logger.error('❌ Erreur rate limiting:', {
          error: error.message,
          path: req.path,
          ip: req.ip
        });
        
        // En cas d'erreur, laisser passer (fail-open)
        next();
      }
    };
  }

  // Limiter spécialement pour uploads
  uploadLimiter() {
    return this.createLimiter({
      name: 'upload',
      requests: {
        perMinute: 10,
        perHour: 100
      },
      trackSize: true,
      sizeLimit: {
        perMinute: 100 * 1024 * 1024,  // 100MB/minute
        perHour: 1024 * 1024 * 1024    // 1GB/heure
      }
    });
  }

  // Limiter pour téléchargements
  downloadLimiter() {
    return this.createLimiter({
      name: 'download',
      requests: {
        perMinute: 30,
        perHour: 500
      },
      trackSize: true,
      sizeLimit: {
        perMinute: 500 * 1024 * 1024,  // 500MB/minute
        perHour: 5 * 1024 * 1024 * 1024 // 5GB/heure
      }
    });
  }

  // Limiter pour API générale
  apiLimiter() {
    return this.createLimiter({
      name: 'api',
      requests: {
        perMinute: 60,
        perHour: 1000,
        perDay: 10000
      }
    });
  }

  // Limiter strict pour opérations sensibles
  strictLimiter() {
    return this.createLimiter({
      name: 'strict',
      requests: {
        perMinute: 5,
        perHour: 20
      },
      enableSlowdown: true,
      slowdownDelay: 2000
    });
  }

  // Génération de clé unique par utilisateur/IP
  generateKey(req) {
    const userId = req.user?.id || 'anonymous';
    const ip = this.getClientIP(req);
    const endpoint = this.detectEndpoint(req.path);
    
    return `${this.options.keyPrefix}${userId}:${ip}:${endpoint}`;
  }

  // Détection d'endpoint pour appliquer les bonnes limites
  detectEndpoint(path) {
    // Normaliser les paramètres d'URL
    const normalizedPath = path
      .replace(/\/[0-9a-f-]{24,}/g, '/:id')  // MongoDB ObjectId
      .replace(/\/\d+/g, '/:id')             // IDs numériques
      .replace(/\/[a-f0-9]{32,}/g, '/:hash') // Hashes
      .replace(/\/[^\/]+\.(jpg|png|pdf|mp4)$/i, '/:file'); // Fichiers

    // Trouver la configuration correspondante
    for (const [pattern, config] of Object.entries(this.options.endpoints)) {
      if (this.matchEndpoint(normalizedPath, pattern)) {
        return pattern;
      }
    }

    return 'default';
  }

  // Correspondance d'endpoint avec patterns
  matchEndpoint(path, pattern) {
    const regexPattern = pattern
      .replace(/:[^\/]+/g, '[^/]+')
      .replace(/\*/g, '.*');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  // Obtenir les limites pour un endpoint
  getLimitsForEndpoint(endpoint) {
    if (endpoint === 'default') {
      return this.options.requests;
    }
    
    return {
      ...this.options.requests,
      ...this.options.endpoints[endpoint]
    };
  }

  // Obtenir les compteurs actuels
  async getCounts(key) {
    try {
      const results = await Promise.all([
        this.store.get(`${key}:minute`),
        this.store.get(`${key}:hour`),
        this.store.get(`${key}:day`),
        this.store.get(`${key}:size:minute`),
        this.store.get(`${key}:size:hour`)
      ]);

      return {
        minute: parseInt(results[0]) || 0,
        hour: parseInt(results[1]) || 0,
        day: parseInt(results[2]) || 0,
        sizeMinute: parseInt(results[3]) || 0,
        sizeHour: parseInt(results[4]) || 0
      };

    } catch (error) {
      logger.warn('⚠️ Erreur récupération compteurs:', { error: error.message });
      return { minute: 0, hour: 0, day: 0, sizeMinute: 0, sizeHour: 0 };
    }
  }

  // Vérifier toutes les limites
  async checkAllLimits(counts, limits, req) {
    const results = {
      blocked: false,
      reason: null,
      resetTime: null,
      remaining: {},
      warnings: []
    };

    // Vérifier les limites de requêtes
    if (limits.perMinute && counts.minute >= limits.perMinute) {
      results.blocked = true;
      results.reason = 'Limite par minute atteinte';
      results.resetTime = this.getNextReset('minute');
      return results;
    }

    if (limits.perHour && counts.hour >= limits.perHour) {
      results.blocked = true;
      results.reason = 'Limite par heure atteinte';
      results.resetTime = this.getNextReset('hour');
      return results;
    }

    if (limits.perDay && counts.day >= limits.perDay) {
      results.blocked = true;
      results.reason = 'Limite journalière atteinte';
      results.resetTime = this.getNextReset('day');
      return results;
    }

    // Vérifier les limites de taille si applicable
    const fileSize = this.getRequestSize(req);
    if (fileSize > 0) {
      if (limits.sizePerMinute && counts.sizeMinute + fileSize > limits.sizePerMinute) {
        results.blocked = true;
        results.reason = 'Limite de taille par minute atteinte';
        results.resetTime = this.getNextReset('minute');
        return results;
      }

      if (limits.sizePerHour && counts.sizeHour + fileSize > limits.sizePerHour) {
        results.blocked = true;
        results.reason = 'Limite de taille par heure atteinte';
        results.resetTime = this.getNextReset('hour');
        return results;
      }
    }

    // Calculer les valeurs restantes
    results.remaining = {
      minute: Math.max(0, (limits.perMinute || Infinity) - counts.minute),
      hour: Math.max(0, (limits.perHour || Infinity) - counts.hour),
      day: Math.max(0, (limits.perDay || Infinity) - counts.day)
    };

    // Générer les warnings
    if (this.options.enableWarnings) {
      this.addWarnings(results, counts, limits);
    }

    return results;
  }

  // Incrémenter les compteurs
  async incrementCounts(key, req, limits) {
    const now = Date.now();
    const fileSize = this.getRequestSize(req);
    
    try {
      const operations = [
        this.store.increment(`${key}:minute`, 60, 1),
        this.store.increment(`${key}:hour`, 3600, 1),
        this.store.increment(`${key}:day`, 86400, 1)
      ];

      // Incrémenter la taille si applicable
      if (fileSize > 0) {
        operations.push(
          this.store.increment(`${key}:size:minute`, 60, fileSize),
          this.store.increment(`${key}:size:hour`, 3600, fileSize)
        );
      }

      await Promise.all(operations);

    } catch (error) {
      logger.warn('⚠️ Erreur incrémentation compteurs:', { error: error.message });
    }
  }

  // Gestion progressive (warnings, slowdown)
  async handleProgressive(req, res, checkResults, limits) {
    // Warnings
    if (checkResults.warnings.length > 0) {
      logger.warn('⚠️ Rate limit warning:', {
        userId: req.user?.id,
        ip: req.ip,
        warnings: checkResults.warnings
      });
      
      res.set('X-RateLimit-Warning', checkResults.warnings.join(', '));
    }

    // Slowdown progressif
    if (this.options.enableSlowdown) {
      const slowdownDelay = this.calculateSlowdownDelay(checkResults, limits);
      if (slowdownDelay > 0) {
        logger.debug('🐌 Ralentissement appliqué:', {
          userId: req.user?.id,
          delay: slowdownDelay
        });
        
        await this.delay(slowdownDelay);
        res.set('X-RateLimit-Slowdown', slowdownDelay.toString());
      }
    }
  }

  // Calculer le délai de ralentissement
  calculateSlowdownDelay(checkResults, limits) {
    let maxUsage = 0;
    
    if (limits.perMinute) {
      const usage = (limits.perMinute - checkResults.remaining.minute) / limits.perMinute;
      maxUsage = Math.max(maxUsage, usage);
    }
    
    if (limits.perHour) {
      const usage = (limits.perHour - checkResults.remaining.hour) / limits.perHour;
      maxUsage = Math.max(maxUsage, usage);
    }

    if (maxUsage >= this.options.slowdownThreshold) {
      const intensity = (maxUsage - this.options.slowdownThreshold) / (1 - this.options.slowdownThreshold);
      return Math.round(this.options.slowdownDelay * intensity);
    }

    return 0;
  }

  // Ajouter des warnings
  addWarnings(results, counts, limits) {
    const threshold = this.options.warningThreshold;

    if (limits.perMinute && counts.minute >= limits.perMinute * threshold) {
      results.warnings.push(`Approche limite par minute: ${counts.minute}/${limits.perMinute}`);
    }

    if (limits.perHour && counts.hour >= limits.perHour * threshold) {
      results.warnings.push(`Approche limite par heure: ${counts.hour}/${limits.perHour}`);
    }

    if (limits.perDay && counts.day >= limits.perDay * threshold) {
      results.warnings.push(`Approche limite journalière: ${counts.day}/${limits.perDay}`);
    }
  }

  // Vérifier si la requête doit être exemptée
  shouldSkip(req) {
    // Whitelist IP
    if (this.options.whitelist.includes(this.getClientIP(req))) {
      return true;
    }

    // Fonction custom
    if (this.options.skipIf && this.options.skipIf(req)) {
      return true;
    }

    // Health checks
    if (req.path === '/health' || req.path === '/api/health') {
      return true;
    }

    return false;
  }

  // Obtenir l'IP du client
  getClientIP(req) {
    return req.ip || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress ||
           req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           'unknown';
  }

  // Obtenir la taille de la requête
  getRequestSize(req) {
    // Taille du fichier uploadé
    if (req.file) return req.file.size;
    if (req.files && req.files.length > 0) {
      return req.files.reduce((sum, file) => sum + file.size, 0);
    }
    
    // Taille du body pour autres requêtes
    const contentLength = req.headers['content-length'];
    return contentLength ? parseInt(contentLength) : 0;
  }

  // Obtenir le prochain reset
  getNextReset(period) {
    const now = new Date();
    
    switch (period) {
      case 'minute':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 
                       now.getHours(), now.getMinutes() + 1, 0, 0);
      case 'hour':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 
                       now.getHours() + 1, 0, 0, 0);
      case 'day':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 
                       0, 0, 0, 0);
      default:
        return new Date(now.getTime() + 60000); // 1 minute par défaut
    }
  }

  // Ajouter les headers de rate limiting
  addRateLimitHeaders(res, checkResults, limits) {
    const headers = this.options.customHeaders;
    
    res.set(headers.total, (limits.perMinute || limits.perHour || limits.perDay).toString());
    res.set(headers.remaining, Math.min(...Object.values(checkResults.remaining)).toString());
    
    if (checkResults.resetTime) {
      res.set(headers.reset, Math.ceil(checkResults.resetTime.getTime() / 1000).toString());
    }
  }

  // Envoyer la réponse de rate limiting
  sendRateLimitResponse(res, checkResults) {
    const retryAfter = checkResults.resetTime ? 
      Math.ceil((checkResults.resetTime.getTime() - Date.now()) / 1000) : 60;

    res.set('Retry-After', retryAfter.toString());
    
    return res.status(429).json({
      error: 'Limite de requêtes dépassée',
      message: checkResults.reason,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter,
      resetTime: checkResults.resetTime,
      timestamp: new Date().toISOString()
    });
  }

  // Utilitaire de délai
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Créer le store (mémoire ou Redis)
  createStore() {
    if (this.options.storage === 'redis') {
      return this.createRedisStore();
    }
    return this.createMemoryStore();
  }

  // Store en mémoire
  createMemoryStore() {
    const store = new Map();
    
    return {
      get: async (key) => store.get(key) || 0,
      
      increment: async (key, ttlSeconds, incrementBy = 1) => {
        const current = store.get(key) || 0;
        const newValue = current + incrementBy;
        store.set(key, newValue);
        
        // Nettoyage automatique
        setTimeout(() => store.delete(key), ttlSeconds * 1000);
        
        return newValue;
      }
    };
  }

  // Store Redis (optionnel)
  createRedisStore() {
    try {
      const redis = require('redis');
      const client = redis.createClient({ url: this.options.redisUrl });
      
      client.on('error', (err) => {
        logger.warn('⚠️ Erreur Redis rate limiting:', { error: err.message });
      });

      return {
        get: async (key) => {
          try {
            const value = await client.get(key);
            return value ? parseInt(value) : 0;
          } catch (error) {
            return 0;
          }
        },
        
        increment: async (key, ttlSeconds, incrementBy = 1) => {
          try {
            const multi = client.multi();
            multi.incrby(key, incrementBy);
            multi.expire(key, ttlSeconds);
            const results = await multi.exec();
            return results[0][1];
          } catch (error) {
            return 0;
          }
        }
      };
      
    } catch (error) {
      logger.warn('⚠️ Redis non disponible, utilisation mémoire:', { error: error.message });
      return this.createMemoryStore();
    }
  }

  // Nettoyage périodique (pour store mémoire)
  startCleanupTimer() {
    if (this.options.storage === 'memory') {
      setInterval(() => {
        // Le nettoyage se fait automatiquement via setTimeout dans increment
        logger.debug('🧹 Nettoyage rate limiting en cours...');
      }, 5 * 60 * 1000); // Chaque 5 minutes
    }
  }

  // Stats et monitoring
  getStats() {
    return {
      storage: this.options.storage,
      limits: this.options.requests,
      endpoints: Object.keys(this.options.endpoints).length,
      enableWarnings: this.options.enableWarnings,
      enableSlowdown: this.options.enableSlowdown
    };
  }
}

module.exports = RateLimitMiddleware;
