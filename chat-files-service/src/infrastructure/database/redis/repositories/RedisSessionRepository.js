/**
 * Repository Redis : Sessions
 * CENADI Chat-Files-Service
 */

const RedisBaseRepository = require('./RedisBaseRepository');
const { createLogger } = require('../../../../shared/utils/logger');
const crypto = require('crypto');

const logger = createLogger('RedisSessionRepository');

class RedisSessionRepository extends RedisBaseRepository {
  constructor(redisClient) {
    super(redisClient, 'session:');
    this.sessionTTL = 86400; // 24 heures
    this.onlineTTL = 300; // 5 minutes
  }

  // Gestion des sessions

  async createSession(userId, sessionData = {}) {
    try {
      const sessionId = this.generateSessionId();
      const sessionKey = sessionId;
      
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
      await this.set(sessionKey, session, this.sessionTTL);
      
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
      const session = await this.get(sessionId);
      
      if (!session) {
        return null;
      }

      // Mettre à jour la dernière activité
      session.lastActivity = new Date().toISOString();
      await this.set(sessionId, session, this.sessionTTL);
      
      return session;

    } catch (error) {
      logger.error('Erreur récupération session:', { error: error.message, sessionId });
      return null;
    }
  }

  async updateSession(sessionId, updateData) {
    try {
      const session = await this.get(sessionId);
      if (!session) {
        throw new Error('Session non trouvée');
      }

      // Merger les données
      const updatedSession = {
        ...session,
        ...updateData,
        lastActivity: new Date().toISOString()
      };

      await this.set(sessionId, updatedSession, this.sessionTTL);
      
      logger.debug('Session mise à jour:', { sessionId });
      return updatedSession;

    } catch (error) {
      logger.error('Erreur mise à jour session:', { error: error.message, sessionId });
      throw error;
    }
  }

  async deleteSession(sessionId) {
    try {
      const session = await this.get(sessionId);
      if (!session) {
        return false;
      }

      await this.del(sessionId);
      
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
      const ttl = additionalTTL || this.sessionTTL;
      const result = await this.expire(sessionId, ttl);
      
      if (result) {
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

  async addToUserSessions(userId, sessionId) {
    try {
      const userSessionsKey = `user:${userId}:sessions`;
      await this.sadd(userSessionsKey, sessionId);
      await this.expire(userSessionsKey, this.sessionTTL);
      
      // Limiter le nombre de sessions
      await this.limitUserSessions(userId);

    } catch (error) {
      logger.error('Erreur ajout session utilisateur:', { error: error.message, userId, sessionId });
      throw error;
    }
  }

  async removeFromUserSessions(userId, sessionId) {
    try {
      const userSessionsKey = `user:${userId}:sessions`;
      await this.srem(userSessionsKey, sessionId);
    } catch (error) {
      logger.error('Erreur suppression session utilisateur:', { error: error.message, userId, sessionId });
    }
  }

  async getUserSessions(userId) {
    try {
      const userSessionsKey = `user:${userId}:sessions`;
      const sessionIds = await this.smembers(userSessionsKey);
      
      const sessions = [];
      for (const sessionId of sessionIds) {
        const session = await this.get(sessionId);
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

  async limitUserSessions(userId, maxSessions = 10) {
    try {
      const sessions = await this.getUserSessions(userId);
      
      if (sessions.length <= maxSessions) {
        return 0;
      }

      // Trier par dernière activité (plus anciennes en premier)
      const sortedSessions = sessions.sort((a, b) => 
        new Date(a.lastActivity) - new Date(b.lastActivity)
      );

      // Supprimer les sessions les plus anciennes
      const sessionsToDelete = sortedSessions.slice(0, sessions.length - maxSessions);
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

  // Présence en ligne

  async setUserOnline(userId, sessionId) {
    try {
      const onlineKey = `online:${userId}`;
      await this.set(onlineKey, { sessionId, timestamp: new Date().toISOString() }, this.onlineTTL);
      
      // Ajouter à la liste des utilisateurs en ligne
      const globalOnlineKey = 'online:users';
      await this.sadd(globalOnlineKey, userId);
      await this.expire(globalOnlineKey, this.onlineTTL);

      logger.debug('Utilisateur en ligne:', { userId, sessionId });

    } catch (error) {
      logger.error('Erreur mise en ligne:', { error: error.message, userId });
    }
  }

  async setUserOffline(userId) {
    try {
      const onlineKey = `online:${userId}`;
      await this.del(onlineKey);
      
      // Retirer de la liste des utilisateurs en ligne
      const globalOnlineKey = 'online:users';
      await this.srem(globalOnlineKey, userId);

      logger.debug('Utilisateur hors ligne:', { userId });

    } catch (error) {
      logger.error('Erreur mise hors ligne:', { error: error.message, userId });
    }
  }

  async isUserOnline(userId) {
    try {
      const onlineKey = `online:${userId}`;
      const onlineData = await this.get(onlineKey);
      return onlineData !== null;
    } catch (error) {
      logger.error('Erreur vérification en ligne:', { error: error.message, userId });
      return false;
    }
  }

  async getOnlineUsers() {
    try {
      const globalOnlineKey = 'online:users';
      return await this.smembers(globalOnlineKey);
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

  // Statistiques

  async getSessionStats() {
    try {
      const sessionPattern = '*';
      const onlinePattern = 'online:*';
      
      const [sessionKeys, onlineKeys] = await Promise.all([
        this.keys(sessionPattern),
        this.keys(onlinePattern)
      ]);

      // Filtrer pour ne compter que les vraies sessions (pas les métadonnées)
      const realSessionKeys = sessionKeys.filter(key => 
        !key.includes('user:') && !key.includes('online:')
      );

      const onlineUsers = await this.getOnlineUsers();

      return {
        totalSessions: realSessionKeys.length,
        onlineUsers: onlineUsers.length,
        onlineKeys: onlineKeys.length
      };

    } catch (error) {
      logger.error('Erreur statistiques sessions:', { error: error.message });
      return { totalSessions: 0, onlineUsers: 0, onlineKeys: 0 };
    }
  }

  // Utilitaires

  generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  async cleanupExpiredSessions() {
    try {
      const pattern = '*';
      const keys = await this.keys(pattern);
      let cleanedCount = 0;

      for (const key of keys) {
        // Ne nettoyer que les clés de session (pas les métadonnées)
        if (!key.includes('user:') && !key.includes('online:')) {
          const ttl = await this.ttl(key);
          if (ttl === -1) { // Clé sans expiration
            await this.del(key);
            cleanedCount++;
          }
        }
      }

      logger.info('Sessions expirées nettoyées:', { cleanedCount });
      return cleanedCount;

    } catch (error) {
      logger.error('Erreur nettoyage sessions:', { error: error.message });
      return 0;
    }
  }
}

module.exports = RedisSessionRepository;
