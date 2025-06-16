/**
 * CORS Middleware - Chat Files Service
 * CENADI Chat-Files-Service
 * Gestion des accès cross-origin pour applications web
 */

const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('CorsMiddleware');

class CorsMiddleware {
  constructor(options = {}) {
    this.options = {
      // Origines autorisées pour messagerie
      allowedOrigins: options.allowedOrigins || [
        'http://localhost:3000',     // Dev React/Vue
        'http://localhost:8080',     // Dev Vue CLI
        'http://localhost:4200',     // Dev Angular
        'https://chat.cenadi.com',   // Production
        'https://app.cenadi.com',    // App web
        'https://admin.cenadi.com'   // Interface admin
      ],
      
      // Méthodes autorisées
      allowedMethods: options.allowedMethods || [
        'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'
      ],
      
      // Headers autorisés
      allowedHeaders: options.allowedHeaders || [
        'Origin', 'X-Requested-With', 'Content-Type', 'Accept',
        'Authorization', 'X-API-Key', 'X-User-ID', 'X-Chat-ID',
        'X-File-Type', 'X-Upload-Type', 'Cache-Control'
      ],
      
      // Headers exposés au client
      exposedHeaders: options.exposedHeaders || [
        'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset',
        'X-File-ID', 'X-File-Size', 'X-File-Type', 'X-Upload-Status',
        'Content-Disposition', 'Content-Length', 'Content-Range'
      ],
      
      // Configuration
      credentials: options.credentials !== false,  // Cookies/auth headers
      maxAge: options.maxAge || 86400,             // Cache preflight 24h
      preflightContinue: options.preflightContinue || false,
      optionsSuccessStatus: options.optionsSuccessStatus || 204,
      
      // Sécurité
      enableDynamicOrigin: options.enableDynamicOrigin || true,
      trustedDomains: options.trustedDomains || ['cenadi.com', 'localhost'],
      blockSuspiciousOrigins: options.blockSuspiciousOrigins !== false,
      
      // Logging
      logRequests: options.logRequests || false,
      logBlocked: options.logBlocked !== false,
      
      ...options
    };

    this.originCache = new Map(); // Cache pour éviter revalidation
    this.blockedOrigins = new Set(); // Liste des origines bloquées

    logger.info('🌐 CorsMiddleware créé pour messagerie', {
      allowedOrigins: this.options.allowedOrigins.length,
      credentials: this.options.credentials,
      enableDynamicOrigin: this.options.enableDynamicOrigin
    });
  }

  // Middleware principal CORS
  handle() {
    return (req, res, next) => {
      const origin = req.headers.origin;
      
      try {
        // Log si activé
        if (this.options.logRequests) {
          logger.debug('🌐 Requête CORS:', {
            origin,
            method: req.method,
            path: req.path,
            userAgent: req.headers['user-agent']
          });
        }

        // Vérifier l'origine
        const originCheck = this.checkOrigin(origin, req);
        
        if (!originCheck.allowed) {
          if (this.options.logBlocked) {
            logger.warn('🚫 Origine bloquée:', {
              origin,
              reason: originCheck.reason,
              ip: req.ip,
              path: req.path
            });
          }
          
          return this.sendCorsError(res, originCheck.reason);
        }

        // Définir les headers CORS
        this.setCorsHeaders(res, origin, req);

        // Gérer les requêtes preflight OPTIONS
        if (req.method === 'OPTIONS') {
          return this.handlePreflight(req, res);
        }

        next();

      } catch (error) {
        logger.error('❌ Erreur CORS:', {
          origin,
          error: error.message,
          path: req.path
        });
        
        // En cas d'erreur, on bloque par sécurité
        return this.sendCorsError(res, 'Erreur de validation CORS');
      }
    };
  }

  // Vérifier l'origine
  checkOrigin(origin, req) {
    // Pas d'origine = requête same-origin ou outil (curl, etc.)
    if (!origin) {
      return { allowed: true, reason: 'same-origin' };
    }

    // Vérifier le cache
    if (this.originCache.has(origin)) {
      const cached = this.originCache.get(origin);
      return { allowed: cached.allowed, reason: cached.reason };
    }

    // Vérifier les origines bloquées
    if (this.blockedOrigins.has(origin)) {
      return { allowed: false, reason: 'origine bloquée' };
    }

    // Vérifier les origines explicitement autorisées
    if (this.options.allowedOrigins.includes(origin)) {
      this.cacheOriginResult(origin, true, 'liste autorisée');
      return { allowed: true, reason: 'liste autorisée' };
    }

    // Vérification dynamique si activée
    if (this.options.enableDynamicOrigin) {
      const dynamicCheck = this.checkDynamicOrigin(origin, req);
      this.cacheOriginResult(origin, dynamicCheck.allowed, dynamicCheck.reason);
      return dynamicCheck;
    }

    // Par défaut, refuser
    this.cacheOriginResult(origin, false, 'non autorisée');
    return { allowed: false, reason: 'origine non autorisée' };
  }

  // Vérification dynamique des origines
  checkDynamicOrigin(origin, req) {
    try {
      const url = new URL(origin);
      
      // Vérifier le protocole
      if (!['http:', 'https:'].includes(url.protocol)) {
        return { allowed: false, reason: 'protocole non autorisé' };
      }

      // Vérifier les domaines de confiance
      const hostname = url.hostname;
      
      // Localhost pour développement
      if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
        return { allowed: true, reason: 'localhost' };
      }

      // Domaines de confiance
      for (const trustedDomain of this.options.trustedDomains) {
        if (hostname === trustedDomain || hostname.endsWith(`.${trustedDomain}`)) {
          return { allowed: true, reason: `domaine de confiance: ${trustedDomain}` };
        }
      }

      // Vérifications de sécurité
      if (this.options.blockSuspiciousOrigins) {
        const securityCheck = this.securityCheck(url, req);
        if (!securityCheck.allowed) {
          return securityCheck;
        }
      }

      return { allowed: false, reason: 'domaine non reconnu' };

    } catch (error) {
      return { allowed: false, reason: 'URL invalide' };
    }
  }

  // Vérifications de sécurité
  securityCheck(url, req) {
    // Bloquer les IPs suspectes
    const ipPattern = /^\d+\.\d+\.\d+\.\d+$/;
    if (ipPattern.test(url.hostname)) {
      // Autoriser seulement les IPs locales
      if (!url.hostname.startsWith('192.168.') && 
          !url.hostname.startsWith('10.') && 
          !url.hostname.startsWith('172.')) {
        return { allowed: false, reason: 'IP publique non autorisée' };
      }
    }

    // Bloquer les ports suspects
    const suspiciousPorts = ['22', '23', '25', '53', '110', '143', '993', '995'];
    if (url.port && suspiciousPorts.includes(url.port)) {
      return { allowed: false, reason: 'port suspect' };
    }

    // Vérifier les sous-domaines suspects
    const suspiciousSubdomains = ['admin', 'api', 'ftp', 'mail', 'smtp', 'ssh'];
    const subdomain = url.hostname.split('.')[0];
    if (suspiciousSubdomains.includes(subdomain.toLowerCase())) {
      // Log mais n'interdit pas forcément
      logger.warn('⚠️ Sous-domaine suspect détecté:', {
        origin: url.origin,
        subdomain,
        ip: req.ip
      });
    }

    return { allowed: true, reason: 'vérifications passées' };
  }

  // Définir les headers CORS
  setCorsHeaders(res, origin, req) {
    // Access-Control-Allow-Origin
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      res.header('Access-Control-Allow-Origin', '*');
    }

    // Access-Control-Allow-Methods
    res.header('Access-Control-Allow-Methods', this.options.allowedMethods.join(', '));

    // Access-Control-Allow-Headers
    res.header('Access-Control-Allow-Headers', this.options.allowedHeaders.join(', '));

    // Access-Control-Expose-Headers
    if (this.options.exposedHeaders.length > 0) {
      res.header('Access-Control-Expose-Headers', this.options.exposedHeaders.join(', '));
    }

    // Access-Control-Allow-Credentials
    if (this.options.credentials) {
      res.header('Access-Control-Allow-Credentials', 'true');
    }

    // Access-Control-Max-Age (pour preflight)
    res.header('Access-Control-Max-Age', this.options.maxAge.toString());

    // Headers de sécurité supplémentaires
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
  }

  // Gérer les requêtes preflight
  handlePreflight(req, res) {
    const requestedMethod = req.headers['access-control-request-method'];
    const requestedHeaders = req.headers['access-control-request-headers'];

    // Vérifier la méthode demandée
    if (requestedMethod && !this.options.allowedMethods.includes(requestedMethod)) {
      logger.warn('⚠️ Méthode preflight non autorisée:', {
        method: requestedMethod,
        origin: req.headers.origin
      });
      
      return res.status(405).json({
        error: 'Méthode non autorisée',
        code: 'METHOD_NOT_ALLOWED'
      });
    }

    // Vérifier les headers demandés
    if (requestedHeaders) {
      const headers = requestedHeaders.split(',').map(h => h.trim());
      const unauthorizedHeaders = headers.filter(h => 
        !this.options.allowedHeaders.includes(h)
      );
      
      if (unauthorizedHeaders.length > 0) {
        logger.warn('⚠️ Headers preflight non autorisés:', {
          headers: unauthorizedHeaders,
          origin: req.headers.origin
        });
        
        return res.status(400).json({
          error: 'Headers non autorisés',
          code: 'HEADERS_NOT_ALLOWED',
          details: unauthorizedHeaders
        });
      }
    }

    // Répondre au preflight
    if (this.options.preflightContinue) {
      return next();
    } else {
      return res.status(this.options.optionsSuccessStatus).send();
    }
  }

  // Cache des résultats d'origine
  cacheOriginResult(origin, allowed, reason) {
    // Limiter la taille du cache
    if (this.originCache.size > 1000) {
      const firstKey = this.originCache.keys().next().value;
      this.originCache.delete(firstKey);
    }

    this.originCache.set(origin, {
      allowed,
      reason,
      timestamp: Date.now()
    });

    // Auto-nettoyage après 1 heure
    setTimeout(() => {
      this.originCache.delete(origin);
    }, 60 * 60 * 1000);
  }

  // CORS spécialisé pour uploads
  uploadCors() {
    return (req, res, next) => {
      // Headers spéciaux pour upload
      res.header('Access-Control-Allow-Headers', [
        ...this.options.allowedHeaders,
        'Content-Type',
        'Content-Length',
        'Content-Range',
        'X-Upload-Content-Type',
        'X-Upload-Content-Length'
      ].join(', '));

      // Méthodes pour upload
      res.header('Access-Control-Allow-Methods', 'POST, PUT, PATCH, OPTIONS');

      // Headers exposés pour upload
      res.header('Access-Control-Expose-Headers', [
        ...this.options.exposedHeaders,
        'X-Upload-Progress',
        'X-Upload-Status',
        'X-File-ID'
      ].join(', '));

      this.handle()(req, res, next);
    };
  }

  // CORS pour téléchargements
  downloadCors() {
    return (req, res, next) => {
      // Headers pour téléchargement
      res.header('Access-Control-Expose-Headers', [
        ...this.options.exposedHeaders,
        'Content-Disposition',
        'Content-Type',
        'Content-Length',
        'Accept-Ranges'
      ].join(', '));

      this.handle()(req, res, next);
    };
  }

  // Bloquer une origine
  blockOrigin(origin, reason = 'bloquée manuellement') {
    this.blockedOrigins.add(origin);
    this.originCache.delete(origin);
    
    logger.warn('🚫 Origine bloquée:', { origin, reason });
  }

  // Débloquer une origine
  unblockOrigin(origin) {
    this.blockedOrigins.delete(origin);
    this.originCache.delete(origin);
    
    logger.info('✅ Origine débloquée:', { origin });
  }

  // Ajouter une origine autorisée
  addAllowedOrigin(origin) {
    if (!this.options.allowedOrigins.includes(origin)) {
      this.options.allowedOrigins.push(origin);
      this.originCache.delete(origin);
      
      logger.info('✅ Origine ajoutée:', { origin });
    }
  }

  // Réponse d'erreur CORS
  sendCorsError(res, reason) {
    return res.status(403).json({
      error: 'Accès CORS refusé',
      message: reason,
      code: 'CORS_BLOCKED',
      timestamp: new Date().toISOString()
    });
  }

  // Nettoyer les caches
  cleanup() {
    this.originCache.clear();
    logger.debug('🧹 Cache CORS nettoyé');
  }

  // Statistiques
  getStats() {
    return {
      allowedOrigins: this.options.allowedOrigins.length,
      cachedOrigins: this.originCache.size,
      blockedOrigins: this.blockedOrigins.size,
      trustedDomains: this.options.trustedDomains.length
    };
  }

  // Configuration pour développement
  static development() {
    return new CorsMiddleware({
      allowedOrigins: ['*'],
      credentials: true,
      logRequests: true,
      blockSuspiciousOrigins: false
    });
  }

  // Configuration pour production
  static production(allowedOrigins = []) {
    return new CorsMiddleware({
      allowedOrigins,
      credentials: true,
      enableDynamicOrigin: false,
      blockSuspiciousOrigins: true,
      logBlocked: true
    });
  }
}

module.exports = CorsMiddleware;
