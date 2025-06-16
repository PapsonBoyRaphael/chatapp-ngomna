/**
 * Repository Redis : Files
 * CENADI Chat-Files-Service
 */

const RedisBaseRepository = require('./RedisBaseRepository');
const { createLogger } = require('../../../../shared/utils/logger');

const logger = createLogger('RedisFileRepository');

class RedisFileRepository extends RedisBaseRepository {
  constructor(redisClient) {
    super(redisClient, 'file:');
    this.metadataTTL = 7200; // 2 heures
    this.permissionsTTL = 1800; // 30 minutes
    this.statsTTL = 3600; // 1 heure
  }

  // Cache des métadonnées de fichiers

  async cacheFileMetadata(fileId, metadata) {
    try {
      const key = `metadata:${fileId}`;
      await this.set(key, metadata, this.metadataTTL);
      
      logger.debug('Métadonnées fichier cachées:', { fileId });
      return true;

    } catch (error) {
      logger.error('Erreur cache métadonnées:', { error: error.message, fileId });
      return false;
    }
  }

  async getFileMetadata(fileId) {
    try {
      const key = `metadata:${fileId}`;
      return await this.get(key);
    } catch (error) {
      logger.error('Erreur récupération métadonnées cache:', { error: error.message, fileId });
      return null;
    }
  }

  async invalidateFileMetadata(fileId) {
    try {
      const key = `metadata:${fileId}`;
      return await this.del(key);
    } catch (error) {
      logger.error('Erreur invalidation métadonnées:', { error: error.message, fileId });
      return false;
    }
  }

  // Cache des permissions

  async cacheFilePermissions(fileId, userId, permissions) {
    try {
      const key = `permissions:${fileId}:${userId}`;
      await this.set(key, permissions, this.permissionsTTL);
      
      logger.debug('Permissions fichier cachées:', { fileId, userId });
      return true;

    } catch (error) {
      logger.error('Erreur cache permissions:', { error: error.message, fileId, userId });
      return false;
    }
  }

  async getFilePermissions(fileId, userId) {
    try {
      const key = `permissions:${fileId}:${userId}`;
      return await this.get(key);
    } catch (error) {
      logger.error('Erreur récupération permissions cache:', { error: error.message, fileId, userId });
      return null;
    }
  }

  async invalidateFilePermissions(fileId, userId = null) {
    try {
      if (userId) {
        const key = `permissions:${fileId}:${userId}`;
        return await this.del(key);
      } else {
        const pattern = `permissions:${fileId}:*`;
        return await this.deletePattern(pattern);
      }
    } catch (error) {
      logger.error('Erreur invalidation permissions:', { error: error.message, fileId, userId });
      return false;
    }
  }

  // Gestion des quotas utilisateur

  async getUserStorageUsed(userId) {
    try {
      const key = `storage:used:${userId}`;
      const used = await this.get(key);
      return used || 0;
    } catch (error) {
      logger.error('Erreur récupération stockage utilisé:', { error: error.message, userId });
      return 0;
    }
  }

  async incrementUserStorage(userId, sizeBytes) {
    try {
      const key = `storage:used:${userId}`;
      const newSize = await this.increment(key, sizeBytes, 86400); // 24h TTL
      
      logger.debug('Stockage utilisateur incrémenté:', { userId, sizeBytes, newSize });
      return newSize;

    } catch (error) {
      logger.error('Erreur incrémentation stockage:', { error: error.message, userId, sizeBytes });
      throw error;
    }
  }

  async decrementUserStorage(userId, sizeBytes) {
    try {
      const key = `storage:used:${userId}`;
      const newSize = await this.decrement(key, sizeBytes);
      
      // S'assurer que ça ne devient pas négatif
      if (newSize < 0) {
        await this.set(key, 0, 86400);
        return 0;
      }

      logger.debug('Stockage utilisateur décrémenté:', { userId, sizeBytes, newSize });
      return newSize;

    } catch (error) {
      logger.error('Erreur décrémentation stockage:', { error: error.message, userId, sizeBytes });
      throw error;
    }
  }

  async checkUserQuota(userId, additionalSize, maxQuota) {
    try {
      const currentUsage = await this.getUserStorageUsed(userId);
      const wouldExceed = (currentUsage + additionalSize) > maxQuota;
      
      return {
        currentUsage,
        maxQuota,
        additionalSize,
        wouldExceed,
        remainingSpace: Math.max(0, maxQuota - currentUsage)
      };

    } catch (error) {
      logger.error('Erreur vérification quota:', { error: error.message, userId });
      throw error;
    }
  }

  // Rate limiting

  async checkUploadRateLimit(userId, maxUploads, timeWindow) {
    try {
      const key = `uploads:${userId}:${timeWindow}`;
      const currentUploads = await this.get(key) || 0;
      
      if (currentUploads >= maxUploads) {
        const ttl = await this.ttl(key);
        return {
          allowed: false,
          current: currentUploads,
          max: maxUploads,
          resetIn: ttl
        };
      }

      await this.increment(key, 1, timeWindow);
      
      return {
        allowed: true,
        current: currentUploads + 1,
        max: maxUploads,
        resetIn: timeWindow
      };

    } catch (error) {
      logger.error('Erreur rate limiting:', { error: error.message, userId });
      throw error;
    }
  }

  async checkDownloadRateLimit(userId, maxDownloads, timeWindow) {
    try {
      const key = `downloads:${userId}:${timeWindow}`;
      const currentDownloads = await this.get(key) || 0;
      
      if (currentDownloads >= maxDownloads) {
        const ttl = await this.ttl(key);
        return {
          allowed: false,
          current: currentDownloads,
          max: maxDownloads,
          resetIn: ttl
        };
      }

      await this.increment(key, 1, timeWindow);
      
      return {
        allowed: true,
        current: currentDownloads + 1,
        max: maxDownloads,
        resetIn: timeWindow
      };

    } catch (error) {
      logger.error('Erreur rate limiting téléchargement:', { error: error.message, userId });
      throw error;
    }
  }

  // Compteurs de statistiques

  async incrementFileDownloads(fileId) {
    try {
      const key = `stats:downloads:${fileId}`;
      const count = await this.increment(key, 1, 0); // Pas d'expiration
      
      // Aussi compter globalement
      await this.increment('stats:global:downloads', 1, 0);
      
      logger.debug('Téléchargements fichier incrémentés:', { fileId, count });
      return count;

    } catch (error) {
      logger.error('Erreur incrémentation téléchargements:', { error: error.message, fileId });
      throw error;
    }
  }

  async incrementFileViews(fileId) {
    try {
      const key = `stats:views:${fileId}`;
      const count = await this.increment(key, 1, 0);
      
      await this.increment('stats:global:views', 1, 0);
      
      logger.debug('Vues fichier incrémentées:', { fileId, count });
      return count;

    } catch (error) {
      logger.error('Erreur incrémentation vues:', { error: error.message, fileId });
      throw error;
    }
  }

  async getFileStats(fileId) {
    try {
      const [downloads, views] = await Promise.all([
        this.get(`stats:downloads:${fileId}`) || 0,
        this.get(`stats:views:${fileId}`) || 0
      ]);

      return { downloads, views };

    } catch (error) {
      logger.error('Erreur récupération stats fichier:', { error: error.message, fileId });
      return { downloads: 0, views: 0 };
    }
  }

  // Cache des listes de fichiers

  async cacheUserFiles(userId, files, ttl = 600) {
    try {
      const key = `user:${userId}:files`;
      await this.set(key, files, ttl);
      
      logger.debug('Fichiers utilisateur cachés:', { userId, count: files.length });
      return true;

    } catch (error) {
      logger.error('Erreur cache fichiers utilisateur:', { error: error.message, userId });
      return false;
    }
  }

  async getUserFiles(userId) {
    try {
      const key = `user:${userId}:files`;
      return await this.get(key);
    } catch (error) {
      logger.error('Erreur récupération fichiers utilisateur cache:', { error: error.message, userId });
      return null;
    }
  }

  async cacheConversationFiles(conversationId, files, ttl = 600) {
    try {
      const key = `conversation:${conversationId}:files`;
      await this.set(key, files, ttl);
      
      logger.debug('Fichiers conversation cachés:', { conversationId, count: files.length });
      return true;

    } catch (error) {
      logger.error('Erreur cache fichiers conversation:', { error: error.message, conversationId });
      return false;
    }
  }

  async getConversationFiles(conversationId) {
    try {
      const key = `conversation:${conversationId}:files`;
      return await this.get(key);
    } catch (error) {
      logger.error('Erreur récupération fichiers conversation cache:', { error: error.message, conversationId });
      return null;
    }
  }

  // Gestion des sessions d'upload

  async createUploadSession(uploadId, sessionData) {
    try {
      const key = `upload:session:${uploadId}`;
      await this.set(key, sessionData, 3600); // 1 heure
      
      logger.debug('Session upload créée:', { uploadId });
      return true;

    } catch (error) {
      logger.error('Erreur création session upload:', { error: error.message, uploadId });
      return false;
    }
  }

  async getUploadSession(uploadId) {
    try {
      const key = `upload:session:${uploadId}`;
      return await this.get(key);
    } catch (error) {
      logger.error('Erreur récupération session upload:', { error: error.message, uploadId });
      return null;
    }
  }

  async updateUploadProgress(uploadId, progress) {
    try {
      const key = `upload:progress:${uploadId}`;
      await this.set(key, progress, 3600);
      
      logger.debug('Progression upload mise à jour:', { uploadId, progress });
      return true;

    } catch (error) {
      logger.error('Erreur mise à jour progression:', { error: error.message, uploadId });
      return false;
    }
  }

  async getUploadProgress(uploadId) {
    try {
      const key = `upload:progress:${uploadId}`;
      return await this.get(key);
    } catch (error) {
      logger.error('Erreur récupération progression:', { error: error.message, uploadId });
      return null;
    }
  }

  async deleteUploadSession(uploadId) {
    try {
      const sessionKey = `upload:session:${uploadId}`;
      const progressKey = `upload:progress:${uploadId}`;
      
      await Promise.all([
        this.del(sessionKey),
        this.del(progressKey)
      ]);

      logger.debug('Session upload supprimée:', { uploadId });
      return true;

    } catch (error) {
      logger.error('Erreur suppression session upload:', { error: error.message, uploadId });
      return false;
    }
  }

  // Verrous pour éviter les doublons

  async acquireUploadLock(contentHash, ttl = 300) {
    try {
      const lockKey = `upload:${contentHash}`;
      return await this.acquireLock(lockKey, ttl);
    } catch (error) {
      logger.error('Erreur acquisition verrou upload:', { error: error.message, contentHash });
      return { acquired: false, value: null };
    }
  }

  async releaseUploadLock(contentHash, lockValue) {
    try {
      const lockKey = `upload:${contentHash}`;
      return await this.releaseLock(lockKey, lockValue);
    } catch (error) {
      logger.error('Erreur libération verrou upload:', { error: error.message, contentHash });
      return false;
    }
  }

  // Files d'attente de traitement

  async queueFileProcessing(fileId, processingType, priority = 0) {
    try {
      const queueKey = `queue:processing:${processingType}`;
      const job = {
        fileId,
        processingType,
        queuedAt: new Date().toISOString(),
        priority
      };

      // Utiliser un sorted set avec la priorité comme score
      await this.zadd(queueKey, priority, job);
      
      logger.debug('Fichier ajouté à la queue:', { fileId, processingType, priority });
      return true;

    } catch (error) {
      logger.error('Erreur ajout queue processing:', { error: error.message, fileId, processingType });
      return false;
    }
  }

  async dequeueFileProcessing(processingType) {
    try {
      const queueKey = `queue:processing:${processingType}`;
      
      // Récupérer l'élément avec la plus haute priorité
      const jobs = await this.zrange(queueKey, -1, -1, true);
      
      if (jobs.length === 0) {
        return null;
      }

      const job = jobs[0];
      
      // Supprimer de la queue
      await this.zrem(queueKey, job.member);
      
      logger.debug('Fichier récupéré de la queue:', { job: job.member, processingType });
      return job.member;

    } catch (error) {
      logger.error('Erreur récupération queue processing:', { error: error.message, processingType });
      return null;
    }
  }

  async getQueueSize(processingType) {
    try {
      const queueKey = `queue:processing:${processingType}`;
      return await this.redis.zcard(this.buildKey(queueKey));
    } catch (error) {
      logger.error('Erreur taille queue:', { error: error.message, processingType });
      return 0;
    }
  }

  // Invalidation de cache

  async invalidateFileCache(fileId) {
    try {
      const patterns = [
        `metadata:${fileId}`,
        `permissions:${fileId}:*`,
        `stats:*:${fileId}`
      ];

      let totalDeleted = 0;
      for (const pattern of patterns) {
        totalDeleted += await this.deletePattern(pattern);
      }

      logger.info('Cache fichier invalidé:', { fileId, deleted: totalDeleted });
      return totalDeleted;

    } catch (error) {
      logger.error('Erreur invalidation cache fichier:', { error: error.message, fileId });
      return 0;
    }
  }

  async invalidateUserCache(userId) {
    try {
      const patterns = [
        `user:${userId}:*`,
        `permissions:*:${userId}`,
        `storage:used:${userId}`,
        `uploads:${userId}:*`,
        `downloads:${userId}:*`
      ];

      let totalDeleted = 0;
      for (const pattern of patterns) {
        totalDeleted += await this.deletePattern(pattern);
      }

      logger.info('Cache utilisateur invalidé:', { userId, deleted: totalDeleted });
      return totalDeleted;

    } catch (error) {
      logger.error('Erreur invalidation cache utilisateur:', { error: error.message, userId });
      return 0;
    }
  }

  async invalidateConversationCache(conversationId) {
    try {
      const pattern = `conversation:${conversationId}:*`;
      const deleted = await this.deletePattern(pattern);
      
      logger.info('Cache conversation invalidé:', { conversationId, deleted });
      return deleted;

    } catch (error) {
      logger.error('Erreur invalidation cache conversation:', { error: error.message, conversationId });
      return 0;
    }
  }

  // Statistiques globales

  async getGlobalStats() {
    try {
      const [totalDownloads, totalViews, totalUploads] = await Promise.all([
        this.get('stats:global:downloads') || 0,
        this.get('stats:global:views') || 0,
        this.get('stats:global:uploads') || 0
      ]);

      return {
        totalDownloads,
        totalViews,
        totalUploads
      };

    } catch (error) {
      logger.error('Erreur récupération stats globales:', { error: error.message });
      return {
        totalDownloads: 0,
        totalViews: 0,
        totalUploads: 0
      };
    }
  }
}

module.exports = RedisFileRepository;
