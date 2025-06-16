/**
 * Event Handler - Infrastructure
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('EventHandler');

class EventHandler {
  constructor(eventPublisher, options = {}) {
    this.eventPublisher = eventPublisher;
    this.options = {
      autoSubscribe: true,
      enableMetrics: true,
      enableDeadLetter: true,
      deadLetterThreshold: 5,
      ...options
    };

    this.handlers = new Map();
    this.deadLetterQueue = [];
    this.handlerMetrics = new Map();

    if (this.options.autoSubscribe) {
      this.subscribeToEvents();
    }

    logger.info('🎯 EventHandler initialisé');
  }

  // Enregistrer les handlers d'événements
  subscribeToEvents() {
    // Événements de fichiers
    this.registerHandler('file.uploaded', this.handleFileUploaded.bind(this));
    this.registerHandler('file.downloaded', this.handleFileDownloaded.bind(this));
    this.registerHandler('file.deleted', this.handleFileDeleted.bind(this));
    this.registerHandler('file.shared', this.handleFileShared.bind(this));
    this.registerHandler('file.processing.completed', this.handleFileProcessingCompleted.bind(this));
    this.registerHandler('file.processing.failed', this.handleFileProcessingFailed.bind(this));

    // Événements de conversation
    this.registerHandler('conversation.file.added', this.handleConversationFileAdded.bind(this));
    this.registerHandler('conversation.file.removed', this.handleConversationFileRemoved.bind(this));

    // Événements de partage
    this.registerHandler('share.accessed', this.handleShareAccessed.bind(this));
    this.registerHandler('share.expired', this.handleShareExpired.bind(this));

    // Événements système
    this.registerHandler('system.cleanup', this.handleSystemCleanup.bind(this));
    this.registerHandler('system.quota.exceeded', this.handleQuotaExceeded.bind(this));

    logger.info('📝 Handlers d\'événements enregistrés:', {
      count: this.handlers.size
    });
  }

  // Enregistrer un handler
  registerHandler(eventType, handlerFunction, options = {}) {
    const handlerConfig = {
      function: handlerFunction,
      options: {
        enableRetry: true,
        maxRetries: 3,
        enableDeadLetter: this.options.enableDeadLetter,
        ...options
      }
    };

    this.handlers.set(eventType, handlerConfig);
    
    // S'abonner à l'événement
    this.eventPublisher.subscribe(eventType, async (event) => {
      await this.executeHandler(eventType, event, handlerConfig);
    });

    // Initialiser les métriques
    if (this.options.enableMetrics) {
      this.handlerMetrics.set(eventType, {
        processed: 0,
        succeeded: 0,
        failed: 0,
        deadLettered: 0,
        totalDuration: 0
      });
    }

    logger.debug('✅ Handler enregistré:', { eventType });
  }

  // Exécuter un handler avec gestion d'erreurs
  async executeHandler(eventType, event, handlerConfig) {
    const startTime = Date.now();
    const eventId = Array.isArray(event) ? 'batch' : event.id;

    try {
      logger.debug('🔄 Exécution handler:', { eventType, eventId });

      await handlerConfig.function(event);

      const duration = Date.now() - startTime;
      this.updateHandlerMetrics(eventType, 'succeeded', duration);

      logger.debug('✅ Handler exécuté avec succès:', { 
        eventType, 
        eventId, 
        duration 
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateHandlerMetrics(eventType, 'failed', duration);

      logger.error('❌ Erreur exécution handler:', {
        eventType,
        eventId,
        error: error.message,
        duration
      });

      // Gestion de la dead letter queue
      if (handlerConfig.options.enableDeadLetter) {
        await this.handleDeadLetter(eventType, event, error);
      }

      throw error; // Re-throw pour le retry du EventPublisher
    }
  }

  // Handlers spécifiques

  async handleFileUploaded(event) {
    logger.info('📁 Fichier uploadé:', {
      fileId: event.data.fileId,
      fileName: event.data.fileName,
      size: event.data.size,
      uploadedBy: event.data.uploadedBy
    });

    try {
      // Programmer le traitement du fichier
      await this.scheduleFileProcessing(event.data);

      // Mettre à jour les quotas utilisateur
      await this.updateUserQuota(event.data.uploadedBy, event.data.size);

      // Notifier les participants de la conversation si applicable
      if (event.data.conversationId) {
        await this.notifyConversationParticipants(event.data);
      }

      // Déclencher le scan de sécurité
      await this.scheduleSecurityScan(event.data.fileId);

    } catch (error) {
      logger.error('Erreur traitement fichier uploadé:', { error: error.message });
      throw error;
    }
  }

  async handleFileDownloaded(event) {
    logger.debug('⬇️ Fichier téléchargé:', {
      fileId: event.data.fileId,
      downloadedBy: event.data.downloadedBy
    });

    try {
      // Mettre à jour les statistiques de téléchargement
      await this.updateDownloadStats(event.data.fileId, event.data.downloadedBy);

      // Audit de sécurité pour les téléchargements sensibles
      await this.auditFileAccess(event.data);

    } catch (error) {
      logger.error('Erreur traitement téléchargement:', { error: error.message });
      // Ne pas faire échouer pour les statistiques
    }
  }

  async handleFileDeleted(event) {
    logger.info('🗑️ Fichier supprimé:', {
      fileId: event.data.fileId,
      deletedBy: event.data.deletedBy,
      deletionType: event.data.deletionType
    });

    try {
      // Nettoyer les références dans les conversations
      if (event.data.conversationId) {
        await this.cleanupConversationReferences(event.data);
      }

      // Nettoyer les partages associés
      await this.cleanupFileShares(event.data.fileId);

      // Programmer la suppression physique si suppression logique
      if (event.data.deletionType === 'soft') {
        await this.schedulePhysicalDeletion(event.data.fileId);
      }

      // Mettre à jour les quotas
      await this.updateUserQuota(event.data.deletedBy, -event.data.size);

    } catch (error) {
      logger.error('Erreur traitement suppression fichier:', { error: error.message });
      throw error;
    }
  }

  async handleFileShared(event) {
    logger.info('📤 Fichier partagé:', {
      fileId: event.data.fileId,
      shareId: event.data.shareId,
      shareType: event.data.shareType,
      sharedBy: event.data.sharedBy
    });

    try {
      // Envoyer notifications selon le type de partage
      await this.sendShareNotifications(event.data);

      // Audit du partage
      await this.auditFileShare(event.data);

      // Mettre à jour les statistiques de partage
      await this.updateShareStats(event.data.fileId);

    } catch (error) {
      logger.error('Erreur traitement partage fichier:', { error: error.message });
      throw error;
    }
  }

  async handleFileProcessingCompleted(event) {
    logger.info('✅ Traitement fichier terminé:', {
      fileId: event.data.fileId,
      processingTime: event.data.processingResult.processingTime
    });

    try {
      // Mettre à jour le statut du fichier
      await this.updateFileProcessingStatus(event.data.fileId, 'completed', event.data.processingResult);

      // Notifier l'utilisateur
      await this.notifyProcessingComplete(event.data);

      // Indexer pour la recherche si applicable
      await this.indexFileForSearch(event.data);

    } catch (error) {
      logger.error('Erreur post-traitement fichier:', { error: error.message });
      throw error;
    }
  }

  async handleFileProcessingFailed(event) {
    logger.error('❌ Échec traitement fichier:', {
      fileId: event.data.fileId,
      error: event.data.error
    });

    try {
      // Mettre à jour le statut du fichier
      await this.updateFileProcessingStatus(event.data.fileId, 'failed', { error: event.data.error });

      // Notifier l'utilisateur de l'échec
      await this.notifyProcessingFailed(event.data);

      // Programmer un nouveau tentative si applicable
      await this.scheduleProcessingRetry(event.data);

    } catch (error) {
      logger.error('Erreur gestion échec traitement:', { error: error.message });
      throw error;
    }
  }

  async handleConversationFileAdded(event) {
    logger.debug('💬 Fichier ajouté à conversation:', {
      conversationId: event.data.conversationId,
      fileId: event.data.fileId
    });

    try {
      // Mettre à jour les statistiques de conversation
      await this.updateConversationStats(event.data.conversationId);

      // Notifier les participants
      await this.notifyConversationFileAdded(event.data);

    } catch (error) {
      logger.error('Erreur ajout fichier conversation:', { error: error.message });
      throw error;
    }
  }

  async handleShareAccessed(event) {
    logger.debug('👁️ Partage accédé:', {
      shareId: event.data.shareId,
      accessedBy: event.data.accessedBy
    });

    try {
      // Mettre à jour les statistiques du partage
      await this.updateShareAccessStats(event.data);

      // Vérifier les limites d'accès
      await this.checkShareLimits(event.data.shareId);

    } catch (error) {
      logger.error('Erreur traitement accès partage:', { error: error.message });
      throw error;
    }
  }

  async handleSystemCleanup(event) {
    logger.info('🧹 Nettoyage système:', { type: event.data.cleanupType });

    try {
      switch (event.data.cleanupType) {
        case 'expired_files':
          await this.cleanupExpiredFiles();
          break;
        case 'orphaned_files':
          await this.cleanupOrphanedFiles();
          break;
        case 'expired_shares':
          await this.cleanupExpiredShares();
          break;
        case 'temp_files':
          await this.cleanupTempFiles();
          break;
        default:
          logger.warn('Type de nettoyage inconnu:', { type: event.data.cleanupType });
      }

    } catch (error) {
      logger.error('Erreur nettoyage système:', { error: error.message });
      throw error;
    }
  }

  // Méthodes utilitaires (à implémenter avec les services appropriés)

  async scheduleFileProcessing(fileData) {
    // TODO: Implémenter avec le service de queue
    logger.debug('📅 Programmation traitement fichier:', { fileId: fileData.fileId });
  }

  async updateUserQuota(userId, sizeChange) {
    // TODO: Implémenter avec le service de quota
    logger.debug('📊 Mise à jour quota utilisateur:', { userId, sizeChange });
  }

  async notifyConversationParticipants(fileData) {
    // TODO: Implémenter avec le service de notification
    logger.debug('🔔 Notification participants:', { conversationId: fileData.conversationId });
  }

  async updateDownloadStats(fileId, userId) {
    // TODO: Implémenter avec le repository
    logger.debug('📈 Mise à jour stats téléchargement:', { fileId, userId });
  }

  // Gestion Dead Letter Queue
  async handleDeadLetter(eventType, event, error) {
    const deadLetterItem = {
      eventType,
      event,
      error: error.message,
      timestamp: new Date().toISOString(),
      attempts: (event.attempts || 0) + 1
    };

    this.deadLetterQueue.push(deadLetterItem);
    this.updateHandlerMetrics(eventType, 'deadLettered');

    logger.warn('💀 Événement envoyé en dead letter:', {
      eventType,
      eventId: Array.isArray(event) ? 'batch' : event.id,
      attempts: deadLetterItem.attempts
    });

    // Nettoyer la dead letter queue si elle devient trop grande
    if (this.deadLetterQueue.length > 1000) {
      this.deadLetterQueue.splice(0, 500); // Garder les 500 plus récents
    }
  }

  // Métriques
  updateHandlerMetrics(eventType, action, duration = 0) {
    if (!this.options.enableMetrics) return;

    const metrics = this.handlerMetrics.get(eventType);
    if (!metrics) return;

    metrics.processed++;
    if (action === 'succeeded') metrics.succeeded++;
    if (action === 'failed') metrics.failed++;
    if (action === 'deadLettered') metrics.deadLettered++;
    if (duration > 0) metrics.totalDuration += duration;

    this.handlerMetrics.set(eventType, metrics);
  }

  getMetrics() {
    if (!this.options.enableMetrics) {
      return { message: 'Métriques désactivées' };
    }

    const summary = {
      handlers: {},
      deadLetterQueue: {
        size: this.deadLetterQueue.length,
        recentFailures: this.deadLetterQueue.slice(-10)
      }
    };

    this.handlerMetrics.forEach((metrics, eventType) => {
      summary.handlers[eventType] = {
        ...metrics,
        successRate: metrics.processed > 0 
          ? Math.round((metrics.succeeded / metrics.processed) * 100) 
          : 0,
        averageDuration: metrics.succeeded > 0 
          ? Math.round(metrics.totalDuration / metrics.succeeded) 
          : 0
      };
    });

    return summary;
  }

  // Nettoyage
  async shutdown() {
    logger.info('🛑 Arrêt EventHandler...');

    // Traiter les événements en dead letter queue si possible
    if (this.deadLetterQueue.length > 0) {
      logger.info(`💀 ${this.deadLetterQueue.length} événements en dead letter queue`);
    }

    this.handlers.clear();
    this.handlerMetrics.clear();

    logger.info('✅ EventHandler arrêté');
  }
}

module.exports = EventHandler;
