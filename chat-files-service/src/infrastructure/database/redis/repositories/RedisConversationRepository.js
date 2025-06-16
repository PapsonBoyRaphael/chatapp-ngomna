/**
 * Repository Redis : Conversations
 * CENADI Chat-Files-Service
 */

const RedisBaseRepository = require('./RedisBaseRepository');
const { createLogger } = require('../../../../shared/utils/logger');

const logger = createLogger('RedisConversationRepository');

class RedisConversationRepository extends RedisBaseRepository {
  constructor(redisClient) {
    super(redisClient, 'conversation:');
    this.participantsTTL = 1800; // 30 minutes
    this.metadataTTL = 3600; // 1 heure
    this.filesTTL = 600; // 10 minutes
  }

  // Cache des participants

  async cacheConversationParticipants(conversationId, participants) {
    try {
      const key = `participants:${conversationId}`;
      await this.set(key, participants, this.participantsTTL);
      
      logger.debug('Participants conversation cachés:', { conversationId, count: participants.length });
      return true;

    } catch (error) {
      logger.error('Erreur cache participants:', { error: error.message, conversationId });
      return false;
    }
  }

  async getConversationParticipants(conversationId) {
    try {
      const key = `participants:${conversationId}`;
      return await this.get(key);
    } catch (error) {
      logger.error('Erreur récupération participants cache:', { error: error.message, conversationId });
      return null;
    }
  }

  async addParticipantToCache(conversationId, participant) {
    try {
      const participants = await this.getConversationParticipants(conversationId);
      if (!participants) {
        return false; // Cache manquant, ne pas essayer de le maintenir
      }

      const existingIndex = participants.findIndex(p => p.userId === participant.userId);
      if (existingIndex === -1) {
        participants.push(participant);
        await this.cacheConversationParticipants(conversationId, participants);
      }

      return true;

    } catch (error) {
      logger.error('Erreur ajout participant cache:', { error: error.message, conversationId });
      return false;
    }
  }

  async removeParticipantFromCache(conversationId, userId) {
    try {
      const participants = await this.getConversationParticipants(conversationId);
      if (!participants) {
        return false;
      }

      const filteredParticipants = participants.filter(p => p.userId !== userId);
      if (filteredParticipants.length !== participants.length) {
        await this.cacheConversationParticipants(conversationId, filteredParticipants);
      }

      return true;

    } catch (error) {
      logger.error('Erreur suppression participant cache:', { error: error.message, conversationId });
      return false;
    }
  }

  // Cache des métadonnées de conversation

  async cacheConversationMetadata(conversationId, metadata) {
    try {
      const key = `metadata:${conversationId}`;
      await this.set(key, metadata, this.metadataTTL);
      
      logger.debug('Métadonnées conversation cachées:', { conversationId });
      return true;

    } catch (error) {
      logger.error('Erreur cache métadonnées conversation:', { error: error.message, conversationId });
      return false;
    }
  }

  async getConversationMetadata(conversationId) {
    try {
      const key = `metadata:${conversationId}`;
      return await this.get(key);
    } catch (error) {
      logger.error('Erreur récupération métadonnées conversation cache:', { error: error.message, conversationId });
      return null;
    }
  }

  // Cache des fichiers de conversation

  async cacheConversationFiles(conversationId, files) {
    try {
      const key = `files:${conversationId}`;
      await this.set(key, files, this.filesTTL);
      
      logger.debug('Fichiers conversation cachés:', { conversationId, count: files.length });
      return true;

    } catch (error) {
      logger.error('Erreur cache fichiers conversation:', { error: error.message, conversationId });
      return false;
    }
  }

  async getConversationFiles(conversationId) {
    try {
      const key = `files:${conversationId}`;
      return await this.get(key);
    } catch (error) {
      logger.error('Erreur récupération fichiers conversation cache:', { error: error.message, conversationId });
      return null;
    }
  }

  async addFileToConversationCache(conversationId, file) {
    try {
      const files = await this.getConversationFiles(conversationId);
      if (!files) {
        return false; // Cache manquant
      }

      // Ajouter au début de la liste (plus récent)
      files.unshift(file);
      
      // Limiter à 50 fichiers dans le cache
      if (files.length > 50) {
        files.splice(50);
      }

      await this.cacheConversationFiles(conversationId, files);
      return true;

    } catch (error) {
      logger.error('Erreur ajout fichier conversation cache:', { error: error.message, conversationId });
      return false;
    }
  }

  async removeFileFromConversationCache(conversationId, fileId) {
    try {
      const files = await this.getConversationFiles(conversationId);
      if (!files) {
        return false;
      }

      const filteredFiles = files.filter(f => f.id !== fileId);
      if (filteredFiles.length !== files.length) {
        await this.cacheConversationFiles(conversationId, filteredFiles);
      }

      return true;

    } catch (error) {
      logger.error('Erreur suppression fichier conversation cache:', { error: error.message, conversationId });
      return false;
    }
  }

  // Gestion des conversations utilisateur

  async cacheUserConversations(userId, conversations) {
    try {
      const key = `user:${userId}:conversations`;
      await this.set(key, conversations, this.metadataTTL);
      
      logger.debug('Conversations utilisateur cachées:', { userId, count: conversations.length });
      return true;

    } catch (error) {
      logger.error('Erreur cache conversations utilisateur:', { error: error.message, userId });
      return false;
    }
  }

  async getUserConversations(userId) {
    try {
      const key = `user:${userId}:conversations`;
      return await this.get(key);
    } catch (error) {
      logger.error('Erreur récupération conversations utilisateur cache:', { error: error.message, userId });
      return null;
    }
  }

  // Permissions de conversation

  async cacheUserConversationPermissions(conversationId, userId, permissions) {
    try {
      const key = `permissions:${conversationId}:${userId}`;
      await this.set(key, permissions, this.participantsTTL);
      
      logger.debug('Permissions conversation cachées:', { conversationId, userId });
      return true;

    } catch (error) {
      logger.error('Erreur cache permissions conversation:', { error: error.message, conversationId, userId });
      return false;
    }
  }

  async getUserConversationPermissions(conversationId, userId) {
    try {
      const key = `permissions:${conversationId}:${userId}`;
      return await this.get(key);
    } catch (error) {
      logger.error('Erreur récupération permissions conversation cache:', { error: error.message, conversationId, userId });
      return null;
    }
  }

  // Statistiques de conversation

  async cacheConversationStats(conversationId, stats) {
    try {
      const key = `stats:${conversationId}`;
      await this.set(key, stats, 1800); // 30 minutes
      
      logger.debug('Statistiques conversation cachées:', { conversationId });
      return true;

    } catch (error) {
      logger.error('Erreur cache stats conversation:', { error: error.message, conversationId });
      return false;
    }
  }

  async getConversationStats(conversationId) {
    try {
      const key = `stats:${conversationId}`;
      return await this.get(key);
    } catch (error) {
      logger.error('Erreur récupération stats conversation cache:', { error: error.message, conversationId });
      return null;
    }
  }

  async incrementConversationMessageCount(conversationId) {
    try {
      const key = `stats:messages:${conversationId}`;
      const count = await this.increment(key, 1, 86400); // 24h TTL
      
      logger.debug('Compteur messages conversation incrémenté:', { conversationId, count });
      return count;

    } catch (error) {
      logger.error('Erreur incrémentation messages conversation:', { error: error.message, conversationId });
      throw error;
    }
  }

  async incrementConversationFileCount(conversationId) {
    try {
      const key = `stats:files:${conversationId}`;
      const count = await this.increment(key, 1, 86400);
      
      logger.debug('Compteur fichiers conversation incrémenté:', { conversationId, count });
      return count;

    } catch (error) {
      logger.error('Erreur incrémentation fichiers conversation:', { error: error.message, conversationId });
      throw error;
    }
  }

  // Dernière activité

  async updateConversationLastActivity(conversationId, timestamp = null) {
    try {
      const key = `last_activity:${conversationId}`;
      const activity = timestamp || new Date().toISOString();
      
      await this.set(key, activity, 86400); // 24h
      
      logger.debug('Dernière activité conversation mise à jour:', { conversationId, activity });
      return true;

    } catch (error) {
      logger.error('Erreur mise à jour activité conversation:', { error: error.message, conversationId });
      return false;
    }
  }

  async getConversationLastActivity(conversationId) {
    try {
      const key = `last_activity:${conversationId}`;
      return await this.get(key);
    } catch (error) {
      logger.error('Erreur récupération activité conversation:', { error: error.message, conversationId });
      return null;
    }
  }

  // Messages non lus

  async setUserUnreadCount(conversationId, userId, count) {
    try {
      const key = `unread:${conversationId}:${userId}`;
      await this.set(key, count, 86400);
      
      logger.debug('Compteur non lus mis à jour:', { conversationId, userId, count });
      return true;

    } catch (error) {
      logger.error('Erreur mise à jour non lus:', { error: error.message, conversationId, userId });
      return false;
    }
  }

  async getUserUnreadCount(conversationId, userId) {
    try {
      const key = `unread:${conversationId}:${userId}`;
      const count = await this.get(key);
      return count || 0;
    } catch (error) {
      logger.error('Erreur récupération non lus:', { error: error.message, conversationId, userId });
      return 0;
    }
  }

  async incrementUserUnreadCount(conversationId, userId) {
    try {
      const key = `unread:${conversationId}:${userId}`;
      const count = await this.increment(key, 1, 86400);
      
      logger.debug('Compteur non lus incrémenté:', { conversationId, userId, count });
      return count;

    } catch (error) {
      logger.error('Erreur incrémentation non lus:', { error: error.message, conversationId, userId });
      throw error;
    }
  }

  async resetUserUnreadCount(conversationId, userId) {
    try {
      const key = `unread:${conversationId}:${userId}`;
      await this.del(key);
      
      logger.debug('Compteur non lus réinitialisé:', { conversationId, userId });
      return true;

    } catch (error) {
      logger.error('Erreur réinitialisation non lus:', { error: error.message, conversationId, userId });
      return false;
    }
  }

  // Typing indicators

  async setUserTyping(conversationId, userId, ttl = 10) {
    try {
      const key = `typing:${conversationId}:${userId}`;
      await this.set(key, { timestamp: new Date().toISOString() }, ttl);
      
      logger.debug('Utilisateur en train de taper:', { conversationId, userId });
      return true;

    } catch (error) {
      logger.error('Erreur indication frappe:', { error: error.message, conversationId, userId });
      return false;
    }
  }

  async removeUserTyping(conversationId, userId) {
    try {
      const key = `typing:${conversationId}:${userId}`;
      await this.del(key);
      
      logger.debug('Indication frappe supprimée:', { conversationId, userId });
      return true;

    } catch (error) {
      logger.error('Erreur suppression indication frappe:', { error: error.message, conversationId, userId });
      return false;
    }
  }

  async getTypingUsers(conversationId) {
    try {
      const pattern = `typing:${conversationId}:*`;
      const keys = await this.keys(pattern);
      
      const typingUsers = [];
      for (const key of keys) {
        const parts = key.split(':');
        const userId = parts[parts.length - 1];
        const data = await this.get(key.replace(this.buildKey(''), ''));
        
        if (data) {
          typingUsers.push({
            userId,
            timestamp: data.timestamp
          });
        }
      }

      return typingUsers;

    } catch (error) {
      logger.error('Erreur récupération utilisateurs qui tapent:', { error: error.message, conversationId });
      return [];
    }
  }

  // Invalidation de cache

  async invalidateConversationCache(conversationId) {
    try {
      const patterns = [
        `participants:${conversationId}`,
        `metadata:${conversationId}`,
        `files:${conversationId}`,
        `stats:${conversationId}`,
        `stats:messages:${conversationId}`,
        `stats:files:${conversationId}`,
        `last_activity:${conversationId}`,
        `permissions:${conversationId}:*`,
        `unread:${conversationId}:*`,
        `typing:${conversationId}:*`
      ];

      let totalDeleted = 0;
      for (const pattern of patterns) {
        if (pattern.includes('*')) {
          totalDeleted += await this.deletePattern(pattern);
        } else {
          const deleted = await this.del(pattern);
          if (deleted) totalDeleted++;
        }
      }

      logger.info('Cache conversation invalidé:', { conversationId, deleted: totalDeleted });
      return totalDeleted;

    } catch (error) {
      logger.error('Erreur invalidation cache conversation:', { error: error.message, conversationId });
      return 0;
    }
  }

  async invalidateUserConversationsCache(userId) {
    try {
      const patterns = [
        `user:${userId}:conversations`,
        `permissions:*:${userId}`,
        `unread:*:${userId}`,
        `typing:*:${userId}`
      ];

      let totalDeleted = 0;
      for (const pattern of patterns) {
        if (pattern.includes('*')) {
          totalDeleted += await this.deletePattern(pattern);
        } else {
          const deleted = await this.del(pattern);
          if (deleted) totalDeleted++;
        }
      }

      logger.info('Cache conversations utilisateur invalidé:', { userId, deleted: totalDeleted });
      return totalDeleted;

    } catch (error) {
      logger.error('Erreur invalidation cache conversations utilisateur:', { error: error.message, userId });
      return 0;
    }
  }

  // Recherche et filtrage

  async cacheConversationSearch(searchQuery, userId, results, ttl = 300) {
    try {
      const key = `search:${userId}:${Buffer.from(searchQuery).toString('base64')}`;
      await this.set(key, results, ttl);
      
      logger.debug('Résultats recherche conversation cachés:', { userId, query: searchQuery });
      return true;

    } catch (error) {
      logger.error('Erreur cache recherche conversation:', { error: error.message, userId });
      return false;
    }
  }

  async getConversationSearch(searchQuery, userId) {
    try {
      const key = `search:${userId}:${Buffer.from(searchQuery).toString('base64')}`;
      return await this.get(key);
    } catch (error) {
      logger.error('Erreur récupération recherche conversation cache:', { error: error.message, userId });
      return null;
    }
  }
}

module.exports = RedisConversationRepository;
