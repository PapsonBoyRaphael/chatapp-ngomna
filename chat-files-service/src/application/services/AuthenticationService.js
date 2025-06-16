/**
 * Service d'authentification
 * CENADI Chat-Files-Service
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createLogger } = require('../../shared/utils/logger');
const { AuthenticationException } = require('../../shared/exceptions/AuthenticationException');
const config = require('../../shared/config');

const logger = createLogger('AuthenticationService');

class AuthenticationService {
  constructor(dependencies = {}) {
    this.userServiceClient = dependencies.userServiceClient;
    this.redisClient = dependencies.redisClient;
    this.tokenBlacklist = new Set(); // Cache local pour les tokens révoqués
  }

  /**
   * Valider un token JWT
   */
  async validateToken(token) {
    try {
      // Vérifier si le token est dans la blacklist
      if (await this.isTokenBlacklisted(token)) {
        throw new AuthenticationException('Token révoqué');
      }

      // Décoder et vérifier le token
      const decoded = jwt.verify(token, config.security.jwtSecret);

      // Vérifications additionnelles
      await this.validateTokenClaims(decoded);

      // Enrichir avec les données utilisateur si nécessaire
      const userInfo = await this.enrichUserInfo(decoded);

      logger.debug('Token validé avec succès:', { userId: decoded.id });

      return userInfo;

    } catch (error) {
      logger.warn('Validation de token échouée:', { error: error.message });
      throw new AuthenticationException(`Token invalide: ${error.message}`);
    }
  }

  /**
   * Valider les claims du token
   */
  async validateTokenClaims(decoded) {
    // Vérifier l'expiration
    if (decoded.exp && decoded.exp < Date.now() / 1000) {
      throw new AuthenticationException('Token expiré');
    }

    // Vérifier les champs obligatoires
    if (!decoded.id || !decoded.email) {
      throw new AuthenticationException('Token invalide - données manquantes');
    }

    // Vérifier le type de token
    if (decoded.tokenType && decoded.tokenType !== 'access') {
      throw new AuthenticationException('Type de token invalide');
    }

    return true;
  }

  /**
   * Enrichir les informations utilisateur
   */
  async enrichUserInfo(decoded) {
    try {
      // Si on a un client pour le service utilisateur, récupérer les infos à jour
      if (this.userServiceClient) {
        const userInfo = await this.userServiceClient.getUserInfo(decoded.id);
        
        return {
          ...decoded,
          ...userInfo,
          // Garder les infos du token en priorité pour certains champs critiques
          id: decoded.id,
          email: decoded.email,
          iat: decoded.iat,
          exp: decoded.exp
        };
      }

      // Sinon retourner les données du token
      return decoded;

    } catch (error) {
      logger.warn('Impossible d\'enrichir les infos utilisateur:', { 
        userId: decoded.id, 
        error: error.message 
      });
      
      // En cas d'erreur, retourner les données du token
      return decoded;
    }
  }

  /**
   * Vérifier si un token est dans la blacklist
   */
  async isTokenBlacklisted(token) {
    try {
      // Vérifier le cache local
      if (this.tokenBlacklist.has(token)) {
        return true;
      }

      // Vérifier dans Redis si disponible
      if (this.redisClient) {
        const isBlacklisted = await this.redisClient.get(`blacklist:${token}`);
        if (isBlacklisted) {
          // Ajouter au cache local
          this.tokenBlacklist.add(token);
          return true;
        }
      }

      return false;

    } catch (error) {
      logger.warn('Erreur lors de la vérification de la blacklist:', { error: error.message });
      // En cas d'erreur, on assume que le token n'est pas blacklisté
      return false;
    }
  }

  /**
   * Ajouter un token à la blacklist
   */
  async blacklistToken(token, expiresAt = null) {
    try {
      // Ajouter au cache local
      this.tokenBlacklist.add(token);

      // Ajouter à Redis si disponible
      if (this.redisClient) {
        const ttl = expiresAt ? Math.max(0, expiresAt - Date.now() / 1000) : 86400; // 24h par défaut
        await this.redisClient.setex(`blacklist:${token}`, ttl, '1');
      }

      logger.info('Token ajouté à la blacklist');

    } catch (error) {
      logger.error('Erreur lors de l\'ajout à la blacklist:', { error: error.message });
      throw error;
    }
  }

  /**
   * Vérifier les permissions d'un utilisateur
   */
  async hasPermission(user, permission) {
    try {
      // Vérifier les permissions directes
      if (user.permissions && user.permissions.includes(permission)) {
        return true;
      }

      // Vérifier les rôles avec permissions étendues
      if (user.roles) {
        // Super admin a toutes les permissions
        if (user.roles.includes('super_admin')) {
          return true;
        }

        // Admin a la plupart des permissions
        if (user.roles.includes('admin') && this.isAdminPermission(permission)) {
          return true;
        }
      }

      return false;

    } catch (error) {
      logger.error('Erreur lors de la vérification des permissions:', { 
        userId: user.id, 
        permission, 
        error: error.message 
      });
      return false;
    }
  }

  /**
   * Vérifier si une permission est accordée aux admins
   */
  isAdminPermission(permission) {
    const adminPermissions = [
      'chat.read',
      'chat.write',
      'chat.delete',
      'files.upload',
      'files.download',
      'files.delete',
      'conversations.create',
      'conversations.read',
      'conversations.update',
      'conversations.delete'
    ];

    return adminPermissions.includes(permission);
  }

  /**
   * Vérifier si un utilisateur peut accéder à une ressource
   */
  async canAccessResource(user, resourceType, resourceId, action = 'read') {
    try {
      // Vérifier la permission générale
      const permission = `${resourceType}.${action}`;
      if (await this.hasPermission(user, permission)) {
        return true;
      }

      // Vérifier la propriété de la ressource
      if (await this.isResourceOwner(user, resourceType, resourceId)) {
        return true;
      }

      // Vérifier l'accès via la participation (pour les conversations)
      if (resourceType === 'conversation') {
        return await this.isConversationParticipant(user.id, resourceId);
      }

      return false;

    } catch (error) {
      logger.error('Erreur lors de la vérification d\'accès à la ressource:', {
        userId: user.id,
        resourceType,
        resourceId,
        action,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Vérifier si l'utilisateur est propriétaire d'une ressource
   */
  async isResourceOwner(user, resourceType, resourceId) {
    try {
      // Cette logique devrait être implémentée selon les besoins spécifiques
      // Pour l'instant, retourner false (sera implémenté dans les use cases)
      return false;

    } catch (error) {
      logger.error('Erreur lors de la vérification de propriété:', { error: error.message });
      return false;
    }
  }

  /**
   * Vérifier si l'utilisateur participe à une conversation
   */
  async isConversationParticipant(userId, conversationId) {
    try {
      // Cette logique sera implémentée par les repositories
      // Pour l'instant, retourner false
      return false;

    } catch (error) {
      logger.error('Erreur lors de la vérification de participation:', { error: error.message });
      return false;
    }
  }

  /**
   * Générer un hash de mot de passe
   */
  async hashPassword(password) {
    try {
      const saltRounds = config.security.bcryptRounds || 12;
      return await bcrypt.hash(password, saltRounds);
    } catch (error) {
      logger.error('Erreur lors du hachage du mot de passe:', { error: error.message });
      throw new AuthenticationException('Erreur de traitement du mot de passe');
    }
  }

  /**
   * Vérifier un mot de passe
   */
  async verifyPassword(password, hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error('Erreur lors de la vérification du mot de passe:', { error: error.message });
      return false;
    }
  }

  /**
   * Nettoyer la blacklist (tâche de maintenance)
   */
  async cleanupBlacklist() {
    try {
      // Nettoyer le cache local (limiter la taille)
      if (this.tokenBlacklist.size > 1000) {
        this.tokenBlacklist.clear();
      }

      logger.debug('Nettoyage de la blacklist effectué');

    } catch (error) {
      logger.error('Erreur lors du nettoyage de la blacklist:', { error: error.message });
    }
  }
}

module.exports = AuthenticationService;
