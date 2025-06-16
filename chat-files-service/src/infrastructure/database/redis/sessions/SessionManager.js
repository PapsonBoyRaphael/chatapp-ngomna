/**
 * Gestionnaire de Sessions Redis
 * CENADI Chat-Files-Service
 */

const crypto = require('crypto');
const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('SessionManager');

class SessionManager {
  constructor(redisClient) {
    this.redis = redisClient;
    this.keyPrefix = 'session:';
    this.defaultTTL = 24 * 3600; // 24 heures
    this.maxSessions = 10; // Maximum de sessions par utilisateur
  }

  // Gestion des sessions

  async createSession(userId, sessionData = {}) {
    try {
      const sessionId = this.generateSessionId();
      const sessionKey = this.buildSessionKey(sessionId);
      
      const session = {
        id: sessionId,
        userId,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        userAgent: sessionData.userAgent || null,
        ipAddress: sessionData.ipAddress || null,
        deviceInfo: sessionData.deviceInfo || {},
        metadata: sessionData.metadata || {}
      };

      // Stocker la session
      await this.redis.setex(sessionKey, this.defaultTTL, JSON.stringify(session));
      
      // Ajouter à la liste des sessions utilisateur
      await this.addToUserSessions(userId, sessionId);
      
      logger.info('Session créée:', { userId, sessionId });
      return session;

    } catch (error) {
      logger.error('Erreur création session:', { error: error.message, userId });
      throw error;
    }
  }

  async getSession(sessionId) {
    try {
      const sessionKey = this.buildSessionKey(sessionId);
      const sessionData = await this.redis.get(sessionKey);
      
      if (!sessionData) {
        return null;
      }

      const session = JSON.parse(sessionData);
      
      // Mettre à jour la dernière activité
      session.lastActivity = new Date().toISOString();
      await this.redis.setex(sessionKey, this.defaultTTL, JSON.stringify(session));
      
      return session;

    } catch (error) {
      logger.error('Erreur récupération session:', { error: error.message, sessionId });
      return null;
    }
  }

  async updateSession(sessionId, updateData) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session non trouvée');
      }

      // Merger les données
      const updatedSession = {
        ...session,
        ...updateData,
        lastActivity: new Date().toISOString()
      };

      const sessionKey = this.buildSessionKey(sessionId);
      await this.redis.setex(sessionKey, this.defaultTTL, JSON.stringify(updatedSession));
      
      logger.debug('Session mise à jour:', { sessionId });
      return updatedSession;

    } catch (error) {
      logger.error('Erreur mise à jour session:', { error: error.message, sessionId });
      throw error;
    }
  }

  async deleteSession(sessionId) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return false;
      }

      const sessionKey = this.buildSessionKey(sessionId);
      await this.redis.del(sessionKey);
      
      // Retirer de la liste des sessions utilisateur
      await this.removeFromUserSessions(session.userId, sessionId);
      
      logger.info('Session supprimée:', { sessionId, userId: session.userId });
      return true;

    } catch (error) {
      logger.error('Erreur suppression session:', { error: error.message, sessionId });
      return false;
    }
  }

  async extendSession(sessionId, additionalTTL = null) {
    try {
      const ttl = additionalTTL || this.defaultTTL;
      const sessionKey = this.buildSessionKey(sessionId);
      
      const result = await this.redis.expire(sessionKey, ttl);
      
      if (result === 1) {
        logger.debug('Session prolongée:', { sessionId, ttl });
        return true;
      }
      
      return false;

    } catch (error) {
      logger.error('Erreur prolongation session:', { error: error.message, sessionId });
      return false;
    }
  }

  // Gestion des sessions utilisateur

  async getUserSessions(userId) {
    try {
      const userSessionsKey = this.buildUserSessionsKey(userId);
      const sessionIds = await this.redis.smembers(userSessionsKey);
      
      const sessions = [];
      for (const sessionId of sessionIds) {
        const session = await this.getSession(sessionId);
        if (session) {
          sessions.push(session);
        } else {
          // Nettoyer les sessions expirées
          await this.removeFromUserSessions(userId, sessionId);
        }
      }

      return sessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

    } catch (error) {
      logger.error('Erreur récupération sessions utilisateur:', { error: error.message, userId });
      return [];
    }
  }

  async deleteAllUserSessions(userId, excludeSessionId = null) {
    try {
      const sessions = await this.getUserSessions(userId);
      let deletedCount = 0;

      for (const session of sessions) {
        if (session.id !== excludeSessionId) {
          const success = await this.deleteSession(session.id);
          if (success) deletedCount++;
        }
      }

      logger.info('Sessions utilisateur supprimées:', { userId, deletedCount });
      return deletedCount;

    } catch (error) {
      logger.error('Erreur suppression sessions utilisateur:', { error: error.message, userId });
      return 0;
    }
  }

  async limitUserSessions(userId) {
    try {
      const sessions = await this.getUserSessions(userId);
      
      if (sessions.length <= this.maxSessions) {
        return 0;
      }

      // Trier par dernière activité (plus anciennes en premier)
      const sortedSessions = sessions.sort((a, b) => 
        new Date(a.lastActivity) - new Date(b.lastActivity)
      );

      // Supprimer les sessions les plus anciennes
      const sessionsToDelete = sortedSessions.slice(0, sessions.length - this.maxSessions);
      let deletedCount = 0;

      for (const session of sessionsToDelete) {
        const success = await this.deleteSession(session.id);
        if (success) deletedCount++;
      }

      logger.info('Sessions utilisateur limitées:', { userId, deletedCount });
      return deletedCount;

    } catch (error) {
      logger.error('Erreur limitation sessions:', { error: error.message, userId });
      return 0;
    }
  }

  // Sessions actives et présence

  async setUserOnline(userId, sessionId) {
    try {
      const onlineKey = this.buildOnlineKey(userId);
      await this.redis.setex(onlineKey, 300, sessionId); // 5 minutes
      
      // Ajouter à la liste des utilisateurs en ligne
      const globalOnlineKey = 'online:users';
      await this.redis.sadd(globalOnlineKey, userId);
      await this.redis.expire(globalOnlineKey, 300);

      logger.debug('Utilisateur en ligne:', { userId, sessionId });

    } catch (error) {
      logger.error('Erreur mise en ligne:', { error: error.message, userId });
    }
  }

  async setUserOffline(userId) {
    try {
      const onlineKey = this.buildOnlineKey(userId);
      await this.redis.del(onlineKey);
      
      // Retirer de la liste des utilisateurs en ligne
      const globalOnlineKey = 'online:users';
      await this.redis.srem(globalOnlineKey, userId);

      logger.debug('Utilisateur hors ligne:', { userId });

    } catch (error) {
      logger.error('Erreur mise hors ligne:', { error: error.message, userId });
    }
  }

  async isUserOnline(userId) {
    try {
      const onlineKey = this.buildOnlineKey(userId);
      const sessionId = await this.redis.get(onlineKey);
      return sessionId !== null;
    } catch (error) {
      logger.error('Erreur vérification en ligne:', { error: error.message, userId });
      return false;
    }
  }

  async getOnlineUsers() {
    try {
      const globalOnlineKey = 'online:users';
      return await this.redis.smembers(globalOnlineKey);
    } catch (error) {
      logger.error('Erreur récupération utilisateurs en ligne:', { error: error.message });
      return [];
    }
  }

  async getUserLastSeen(userId) {
    try {
      const sessions = await this.getUserSessions(userId);
      if (sessions.length === 0) {
        return null;
      }

      // Retourner la dernière activité la plus récente
      const lastActivity = sessions.reduce((latest, session) => {
        const sessionActivity = new Date(session.lastActivity);
        return sessionActivity > latest ? sessionActivity : latest;
      }, new Date(0));

      return lastActivity;

    } catch (error) {
      logger.error('Erreur récupération dernière vue:', { error: error.message, userId });
      return null;
    }
  }

  // Méthodes de maintenance

  async cleanupExpiredSessions() {
    try {
      const pattern = this.buildSessionKey('*');
      const keys = await this.redis.keys(pattern);
      let cleanedCount = 0;

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -1) { // Clé sans expiration
          await this.redis.del(key);
          cleanedCount++;
        }
      }

      logger.info('Sessions expirées nettoyées:', { cleanedCount });
      return cleanedCount;

    } catch (error) {
      logger.error('Erreur nettoyage sessions:', { error: error.message });
      return 0;
    }
  }

  async getSessionStats() {
    try {
      const sessionPattern = this.buildSessionKey('*');
      const onlinePattern = 'online:*';
      
      const [sessionKeys, onlineKeys] = await Promise.all([
        this.redis.keys(sessionPattern),
        this.redis.keys(onlinePattern)
      ]);

      const onlineUsers = await this.getOnlineUsers();

      return {
        totalSessions: sessionKeys.length,
        onlineUsers: onlineUsers.length,
        onlineKeys: onlineKeys.length
      };

    } catch (error) {
      logger.error('Erreur statistiques sessions:', { error: error.message });
      return { totalSessions: 0, onlineUsers: 0, onlineKeys: 0 };
    }
  }

  // Méthodes utilitaires privées

  async addToUserSessions(userId, sessionId) {
    const userSessionsKey = this.buildUserSessionsKey(userId);
    await this.redis.sadd(userSessionsKey, sessionId);
    await this.redis.expire(userSessionsKey, this.defaultTTL);
    
    // Limiter le nombre de sessions
    await this.limitUserSessions(userId);
  }

  async removeFromUserSessions(userId, sessionId) {
    const userSessionsKey = this.buildUserSessionsKey(userId);
    await this.redis.srem(userSessionsKey, sessionId);
  }

  generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  buildSessionKey(sessionId) {
    return `${this.keyPrefix}${sessionId}`;
  }

  buildUserSessionsKey(userId) {
    return `user:${userId}:sessions`;
  }

  buildOnlineKey(userId) {
    return `online:${userId}`;
  }
}

module.exports = SessionManager;
