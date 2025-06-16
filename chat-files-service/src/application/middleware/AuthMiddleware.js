/**
 * Middleware d'authentification
 * CENADI Chat-Files-Service
 */

const jwt = require('jsonwebtoken');
const { createLogger } = require('../../shared/utils/logger');
const { AuthenticationException } = require('../../shared/exceptions/AuthenticationException');
const config = require('../../shared/config');

const logger = createLogger('AuthMiddleware');

class AuthMiddleware {
  /**
   * Plugin Fastify pour l'authentification
   */
  static async register(fastify, options) {
    fastify.decorate('authenticate', AuthMiddleware.authenticate);
    fastify.decorate('authenticateOptional', AuthMiddleware.authenticateOptional);
  }

  /**
   * Middleware d'authentification obligatoire
   */
  static async authenticate(request, reply) {
    try {
      const token = AuthMiddleware.extractToken(request);
      
      if (!token) {
        throw new AuthenticationException('Token d\'authentification requis');
      }

      const decoded = AuthMiddleware.verifyToken(token);
      request.user = decoded;

      logger.debug('Utilisateur authentifié:', { userId: decoded.id, email: decoded.email });

    } catch (error) {
      logger.warn('Échec de l\'authentification:', { error: error.message, ip: request.ip });
      
      reply.status(401).send({
        success: false,
        error: 'Non autorisé',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Middleware d'authentification optionnelle
   */
  static async authenticateOptional(request, reply) {
    try {
      const token = AuthMiddleware.extractToken(request);
      
      if (token) {
        const decoded = AuthMiddleware.verifyToken(token);
        request.user = decoded;
        logger.debug('Utilisateur authentifié (optionnel):', { userId: decoded.id });
      } else {
        request.user = null;
        logger.debug('Accès anonyme autorisé');
      }

    } catch (error) {
      // En mode optionnel, on continue même si le token est invalide
      request.user = null;
      logger.debug('Token invalide en mode optionnel:', { error: error.message });
    }
  }

  /**
   * Extraire le token de la requête
   */
  static extractToken(request) {
    // Chercher dans l'en-tête Authorization
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Chercher dans les cookies
    const cookieToken = request.cookies?.token;
    if (cookieToken) {
      return cookieToken;
    }

    // Chercher dans les paramètres de requête (pour WebSocket)
    const queryToken = request.query?.token;
    if (queryToken) {
      return queryToken;
    }

    return null;
  }

  /**
   * Vérifier et décoder le token JWT
   */
  static verifyToken(token) {
    try {
      const decoded = jwt.verify(token, config.security.jwtSecret);
      
      // Vérifier l'expiration
      if (decoded.exp && decoded.exp < Date.now() / 1000) {
        throw new AuthenticationException('Token expiré');
      }

      // Vérifier les champs requis
      if (!decoded.id || !decoded.email) {
        throw new AuthenticationException('Token invalide - données manquantes');
      }

      return {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
        roles: decoded.roles || [],
        permissions: decoded.permissions || [],
        tokenType: decoded.tokenType || 'access',
        iat: decoded.iat,
        exp: decoded.exp
      };

    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationException('Token JWT invalide');
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationException('Token expiré');
      }
      if (error instanceof jwt.NotBeforeError) {
        throw new AuthenticationException('Token pas encore valide');
      }
      
      throw error;
    }
  }

  /**
   * Middleware pour vérifier les permissions
   */
  static requirePermission(permission) {
    return async (request, reply) => {
      try {
        if (!request.user) {
          throw new AuthenticationException('Authentification requise');
        }

        const userPermissions = request.user.permissions || [];
        const userRoles = request.user.roles || [];

        // Vérifier la permission directe
        if (userPermissions.includes(permission)) {
          return;
        }

        // Vérifier les permissions via les rôles
        if (userRoles.includes('admin') || userRoles.includes('super_admin')) {
          return;
        }

        throw new AuthenticationException(`Permission requise: ${permission}`);

      } catch (error) {
        logger.warn('Permission refusée:', { 
          userId: request.user?.id, 
          permission, 
          error: error.message 
        });
        
        reply.status(403).send({
          success: false,
          error: 'Accès interdit',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  /**
   * Middleware pour vérifier les rôles
   */
  static requireRole(role) {
    return async (request, reply) => {
      try {
        if (!request.user) {
          throw new AuthenticationException('Authentification requise');
        }

        const userRoles = request.user.roles || [];

        if (!userRoles.includes(role) && !userRoles.includes('super_admin')) {
          throw new AuthenticationException(`Rôle requis: ${role}`);
        }

      } catch (error) {
        logger.warn('Rôle insuffisant:', { 
          userId: request.user?.id, 
          requiredRole: role, 
          userRoles: request.user?.roles,
          error: error.message 
        });
        
        reply.status(403).send({
          success: false,
          error: 'Accès interdit',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  /**
   * Middleware pour vérifier que l'utilisateur peut accéder à une ressource
   */
  static requireOwnershipOrAdmin(resourceUserIdField = 'userId') {
    return async (request, reply) => {
      try {
        if (!request.user) {
          throw new AuthenticationException('Authentification requise');
        }

        const userId = request.user.id;
        const userRoles = request.user.roles || [];
        
        // Les admins ont accès à tout
        if (userRoles.includes('admin') || userRoles.includes('super_admin')) {
          return;
        }

        // Récupérer l'ID du propriétaire de la ressource
        const resourceUserId = request.params[resourceUserIdField] || 
                              request.body[resourceUserIdField] || 
                              request.query[resourceUserIdField];

        if (!resourceUserId || resourceUserId !== userId) {
          throw new AuthenticationException('Accès à cette ressource non autorisé');
        }

      } catch (error) {
        logger.warn('Accès à la ressource refusé:', { 
          userId: request.user?.id, 
          resourceField: resourceUserIdField,
          error: error.message 
        });
        
        reply.status(403).send({
          success: false,
          error: 'Accès interdit',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    };
  }
}

// Métadonnées pour Fastify
AuthMiddleware[Symbol.for('skip-override')] = true;

module.exports = AuthMiddleware;
