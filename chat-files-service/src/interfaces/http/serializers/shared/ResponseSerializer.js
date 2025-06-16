/**
 * Response Serializer - Chat Files Service
 * CENADI Chat-Files-Service
 * Formatage des réponses API génériques
 */

const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('ResponseSerializer');

class ResponseSerializer {
  // Réponse de succès standard
  static success(data, message = 'Opération réussie', meta = {}) {
    return {
      success: true,
      message,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    };
  }

  // Réponse d'erreur standard
  static error(message, code = 'ERROR', details = null, statusCode = 400) {
    const response = {
      success: false,
      error: {
        message,
        code,
        timestamp: new Date().toISOString()
      }
    };

    if (details) {
      response.error.details = details;
    }

    return response;
  }

  // Réponse avec pagination
  static paginated(data, pagination, message = 'Données récupérées') {
    return this.success(data, message, {
      pagination: {
        total: pagination.total || 0,
        limit: pagination.limit || 20,
        offset: pagination.offset || 0,
        hasMore: pagination.hasMore || false,
        pages: Math.ceil((pagination.total || 0) / (pagination.limit || 20))
      }
    });
  }

  // Réponse pour upload
  static upload(files, uploadStats = {}) {
    return this.success(files, 'Upload terminé avec succès', {
      upload: {
        totalFiles: files.length,
        totalSize: files.reduce((sum, file) => sum + (file.size || 0), 0),
        ...uploadStats
      }
    });
  }

  // Réponse pour partage
  static share(shareData) {
    return this.success(shareData, 'Fichier partagé avec succès', {
      share: {
        createdAt: shareData.createdAt || new Date().toISOString()
      }
    });
  }

  // Réponse pour suppression
  static deleted(message = 'Suppression effectuée') {
    return this.success(null, message, {
      deleted: true,
      deletedAt: new Date().toISOString()
    });
  }

  // Réponse pour tâche asynchrone
  static async(taskId, estimatedCompletion, message = 'Tâche démarrée') {
    return this.success({
      taskId,
      status: 'pending',
      estimatedCompletion,
      checkUrl: `/api/v1/tasks/${taskId}`
    }, message, {
      async: true
    });
  }

  // Health check response
  static health(status, checks = {}) {
    const isHealthy = status === 'healthy';
    
    return {
      status,
      service: 'chat-files-service',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks,
      healthy: isHealthy
    };
  }
}

module.exports = ResponseSerializer;
