/**
 * Authentication Middleware Simplifié - Chat Files Service
 * CENADI Chat-Files-Service
 * Délègue la gestion de visibilité au visibility-service
 */

const jwt = require('jsonwebtoken');
const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('AuthMiddleware');

class AuthMiddleware {
  constructor(options = {}) {
    this.options = {
      jwtSecret: options.jwtSecret || process.env.JWT_SECRET,
      jwtAlgorithm: options.jwtAlgorithm || 'HS256',
      enableApiKey: options.enableApiKey || true,
      apiKeyHeader: options.apiKeyHeader || 'x-api-key',
      enableBearer: options.enableBearer !== false,
      enableQuery: options.enableQuery || true, // Pour liens de partage/téléchargement
      cookieName: options.cookieName || 'authToken',
      enableGuest: options.enableGuest || false,
      visibilityServiceUrl: options.visibilityServiceUrl || process.env.VISIBILITY_SERVICE_URL,
      ...options
    };

    logger.info('🔐 AuthMiddleware simplifié initialisé', {
      enableApiKey: this.options.enableApiKey,
      enableBearer: this.options.enableBearer,
      visibilityServiceUrl: this.options.visibilityServiceUrl
    });
  }

  // Middleware principal d'authentification (simplifié)
  authenticate() {
    return async (req, res, next) => {
      try {
        const token = this.extractToken(req);
        
        if (!token) {
          // Vérifier si l'endpoint permet l'accès guest
          if (this.isGuestAllowed(req)) {
            req.user = { id: 'guest', role: 'user' };
            return next();
          }
          
          return this.unauthorizedResponse(res, 'Token d\'authentification requis');
        }

        // Valider le token
        const decoded = await this.validateToken(token);
        if (!decoded) {
          return this.unauthorizedResponse(res, 'Token invalide');
        }

        // Enrichir la requête avec les infos utilisateur (simplifiées)
        req.user = {
          id: decoded.id || decoded.userId,
          username: decoded.username,
          email: decoded.email,
          role: 'user', // Tous les utilisateurs ont le même rôle
          authenticatedAt: new Date()
        };
        req.token = token;

        // Log de l'activité
        logger.debug('🔓 Utilisateur authentifié:', {
          userId: req.user.id,
          username: req.user.username,
          route: `${req.method}:${req.path}`,
          ip: req.ip
        });

        next();

      } catch (error) {
        logger.error('❌ Erreur authentification:', {
          error: error.message,
          route: `${req.method}:${req.path}`,
          ip: req.ip
        });

        return this.unauthorizedResponse(res, 'Erreur d\'authentification');
      }
    };
  }

  // Middleware de vérification de propriété (optionnel)
  requireOwnership() {
    return async (req, res, next) => {
      try {
        if (!req.user || req.user.role === 'guest') {
          return this.forbiddenResponse(res, 'Authentification requise');
        }

        // Pour les opérations de modification (PUT, DELETE, PATCH)
        const isModifyOperation = ['PUT', 'DELETE', 'PATCH'].includes(req.method);
        
        if (isModifyOperation && req.params.fileId) {
          const isOwner = await this.checkFileOwnership(req.user.id, req.params.fileId);
          if (!isOwner) {
            return this.forbiddenResponse(res, 'Seul le propriétaire peut modifier ce fichier');
          }
        }

        next();

      } catch (error) {
        logger.error('❌ Erreur vérification propriété:', {
          userId: req.user?.id,
          error: error.message
        });

        return this.forbiddenResponse(res, 'Erreur de vérification de propriété');
      }
    };
  }

  // Middleware pour ajouter les infos de visibilité (délégué au visibility-service)
  addVisibilityContext() {
    return async (req, res, next) => {
      try {
        // Ajouter les informations nécessaires pour le visibility-service
        req.visibilityContext = {
          userId: req.user?.id,
          fileId: req.params?.fileId,
          chatId: req.params?.chatId || req.body?.chatId,
          operation: req.method.toLowerCase(),
          path: req.path,
          isGuest: req.user?.role === 'guest' || req.user?.id === 'guest'
        };

        // Headers pour le visibility-service
        req.visibilityHeaders = {
          'X-User-ID': req.user?.id || 'guest',
          'X-Operation': req.method,
          'X-Resource-Type': this.detectResourceType(req.path),
          'X-Client-IP': req.ip,
          'Authorization': req.headers.authorization
        };

        next();

      } catch (error) {
        logger.error('❌ Erreur contexte visibilité:', { error: error.message });
        next(); // Continuer même en cas d'erreur
      }
    };
  }

  // Extraction du token (inchangée)
  extractToken(req) {
    let token = null;

    // 1. Bearer Token dans Authorization header
    if (this.options.enableBearer && req.headers.authorization) {
      const matches = req.headers.authorization.match(/Bearer\s+(.+)/);
      if (matches) {
        token = matches[1];
      }
    }

    // 2. API Key dans header personnalisé
    if (!token && this.options.enableApiKey && req.headers[this.options.apiKeyHeader]) {
      token = req.headers[this.options.apiKeyHeader];
    }

    // 3. Cookie (pour interface web)
    if (!token && req.cookies && req.cookies[this.options.cookieName]) {
      token = req.cookies[this.options.cookieName];
    }

    // 4. Query parameter (pour liens de téléchargement/partage)
    if (!token && this.options.enableQuery && req.query.token) {
      token = req.query.token;
    }

    return token;
  }

  // Validation du token JWT (simplifiée)
  async validateToken(token) {
    try {
      const decoded = jwt.verify(token, this.options.jwtSecret, {
        algorithms: [this.options.jwtAlgorithm]
      });

      // Vérifications de base
      if (decoded.exp && Date.now() >= decoded.exp * 1000) {
        throw new Error('Token expiré');
      }

      return decoded;

    } catch (error) {
      logger.debug('Token invalide:', { error: error.message });
      return null;
    }
  }

  // Vérification simple de propriété de fichier
  async checkFileOwnership(userId, fileId) {
    try {
      const FileMetadata = require('../../../domain/models/FileMetadata');
      const file = await FileMetadata.findOne({ 
        fileId, 
        'chat.userId': userId 
      });

      return !!file;

    } catch (error) {
      logger.error('❌ Erreur vérification propriété fichier:', { 
        userId, 
        fileId, 
        error: error.message 
      });
      return false;
    }
  }

  // Routes autorisées pour les invités
  isGuestAllowed(req) {
    if (!this.options.enableGuest) return false;

    const guestRoutes = [
      'GET:/api/files/:fileId/public',        // Fichiers publics
      'GET:/api/files/:fileId/download',      // Téléchargement avec token
      'GET:/api/files/:fileId/preview',       // Prévisualisation publique
      'GET:/api/health',                      // Health check
      'GET:/api/files/shared/:shareToken'     // Liens de partage
    ];

    const currentRoute = `${req.method}:${req.path}`;
    return guestRoutes.some(route => this.matchRoute(route, currentRoute));
  }

  // Détecter le type de ressource pour le visibility-service
  detectResourceType(path) {
    if (path.includes('/files/')) return 'file';
    if (path.includes('/chats/')) return 'chat';
    if (path.includes('/users/')) return 'user';
    if (path.includes('/avatar')) return 'avatar';
    return 'unknown';
  }

  // Utilitaire de correspondance de routes
  matchRoute(pattern, actual) {
    const patternRegex = pattern.replace(/:[^/]+/g, '[^/]+');
    const regex = new RegExp(`^${patternRegex}$`);
    return regex.test(actual);
  }

  // Middleware pour extraire les infos de partage
  extractShareContext() {
    return (req, res, next) => {
      // Extraire le token de partage si présent
      const shareToken = req.params.shareToken || req.query.share || req.headers['x-share-token'];
      
      if (shareToken) {
        req.shareContext = {
          token: shareToken,
          isSharedAccess: true
        };
      }

      next();
    };
  }

  // Middleware pour logger les accès aux fichiers
  logFileAccess() {
    return (req, res, next) => {
      // Logger les accès aux fichiers pour audit
      if (req.params.fileId && req.method === 'GET') {
        logger.info('📥 Accès fichier:', {
          fileId: req.params.fileId,
          userId: req.user?.id || 'guest',
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          referrer: req.headers.referer
        });
      }

      next();
    };
  }

  // Réponses d'erreur standardisées
  unauthorizedResponse(res, message = 'Non authentifié') {
    return res.status(401).json({
      error: 'Unauthorized',
      message,
      code: 'AUTH_REQUIRED',
      timestamp: new Date().toISOString()
    });
  }

  forbiddenResponse(res, message = 'Accès interdit') {
    return res.status(403).json({
      error: 'Forbidden',
      message,
      code: 'ACCESS_DENIED',
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = AuthMiddleware;
