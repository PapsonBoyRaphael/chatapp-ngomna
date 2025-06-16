/**
 * Event Dispatcher - Infrastructure
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const EventPublisher = require('./EventPublisher');
const EventHandler = require('./EventHandler');

const logger = createLogger('EventDispatcher');

class EventDispatcher {
  constructor(options = {}) {
    this.options = {
      enableLocalEvents: true,
      enableExternalEvents: true,
      enableWebSocket: true,
      enableKafka: false,
      ...options
    };

    this.localPublisher = null;
    this.eventHandler = null;
    this.externalPublishers = new Map();
    this.isInitialized = false;

    logger.info('🚀 EventDispatcher créé');
  }

  // Initialisation
  async initialize() {
    try {
      // Publisher local
      if (this.options.enableLocalEvents) {
        this.localPublisher = new EventPublisher({
          enableMetrics: true,
          enableBatching: false
        });
      }

      // Handler d'événements
      if (this.localPublisher) {
        this.eventHandler = new EventHandler(this.localPublisher, {
          enableMetrics: true
        });
      }

      // Publishers externes
      await this.initializeExternalPublishers();

      this.isInitialized = true;
      logger.info('✅ EventDispatcher initialisé');

    } catch (error) {
      logger.error('❌ Erreur initialisation EventDispatcher:', { error: error.message });
      throw error;
    }
  }

  async initializeExternalPublishers() {
    // WebSocket Publisher (si activé)
    if (this.options.enableWebSocket) {
      try {
        const WebSocketPublisher = require('../websocket/WebSocketPublisher');
        const wsPublisher = new WebSocketPublisher();
        await wsPublisher.initialize();
        this.externalPublishers.set('websocket', wsPublisher);
        logger.info('📡 WebSocket Publisher initialisé');
      } catch (error) {
        logger.warn('⚠️ WebSocket Publisher non disponible:', { error: error.message });
      }
    }

    // Kafka Publisher (si activé)
    if (this.options.enableKafka) {
      try {
        const KafkaPublisher = require('../kafka/KafkaPublisher');
        const kafkaPublisher = new KafkaPublisher();
        await kafkaPublisher.initialize();
        this.externalPublishers.set('kafka', kafkaPublisher);
        logger.info('📡 Kafka Publisher initialisé');
      } catch (error) {
        logger.warn('⚠️ Kafka Publisher non disponible:', { error: error.message });
      }
    }
  }

  // Publication d'événements
  async dispatch(eventType, eventData, options = {}) {
    if (!this.isInitialized) {
      throw new Error('EventDispatcher non initialisé');
    }

    const dispatchOptions = {
      local: true,
      external: true,
      targets: ['all'], // 'all', 'websocket', 'kafka', etc.
      ...options
    };

    const results = {
      local: null,
      external: new Map()
    };

    try {
      // Publication locale
      if (dispatchOptions.local && this.localPublisher) {
        results.local = await this.localPublisher.publish(eventType, eventData, options);
        logger.debug('📍 Événement publié localement:', { eventType, id: results.local });
      }

      // Publication externe
      if (dispatchOptions.external) {
        await this.dispatchToExternalPublishers(eventType, eventData, dispatchOptions, results);
      }

      logger.debug('📡 Événement dispatché:', {
        eventType,
        local: !!results.local,
        external: results.external.size
      });

      return results;

    } catch (error) {
      logger.error('❌ Erreur dispatch événement:', {
        eventType,
        error: error.message
      });
      throw error;
    }
  }

  async dispatchToExternalPublishers(eventType, eventData, options, results) {
    const promises = [];

    this.externalPublishers.forEach((publisher, name) => {
      // Vérifier si ce publisher est dans les targets
      if (options.targets.includes('all') || options.targets.includes(name)) {
        const promise = this.publishToExternal(publisher, name, eventType, eventData, options)
          .then(result => {
            results.external.set(name, result);
            return result;
          })
          .catch(error => {
            logger.warn(`⚠️ Erreur publication ${name}:`, { error: error.message });
            results.external.set(name, { error: error.message });
            return null;
          });

        promises.push(promise);
      }
    });

    await Promise.allSettled(promises);
  }

  async publishToExternal(publisher, name, eventType, eventData, options) {
    try {
      const result = await publisher.publish(eventType, eventData, options);
      logger.debug(`📤 Publié vers ${name}:`, { eventType, result });
      return result;
    } catch (error) {
      logger.error(`❌ Erreur publication ${name}:`, { error: error.message });
      throw error;
    }
  }

  // Souscription aux événements
  subscribe(eventType, handler, options = {}) {
    if (!this.localPublisher) {
      throw new Error('Publisher local non disponible');
    }

    return this.localPublisher.subscribe(eventType, handler, options);
  }

  // Événements prédéfinis pour l'application

  // Événements de fichiers
  async fileUploaded(fileData, options = {}) {
    return this.dispatch('file.uploaded', fileData, {
      ...options,
      routing: { routingKey: 'files.uploaded' }
    });
  }

  async fileDownloaded(downloadData, options = {}) {
    return this.dispatch('file.downloaded', downloadData, {
      ...options,
      routing: { routingKey: 'files.downloaded' }
    });
  }

  async fileDeleted(deletionData, options = {}) {
    return this.dispatch('file.deleted', deletionData, {
      ...options,
      routing: { routingKey: 'files.deleted' }
    });
  }

  async fileShared(shareData, options = {}) {
    return this.dispatch('file.shared', shareData, {
      ...options,
      routing: { routingKey: 'files.shared' }
    });
  }

  async fileProcessingCompleted(processingData, options = {}) {
    return this.dispatch('file.processing.completed', processingData, {
      ...options,
      routing: { routingKey: 'files.processing.completed' }
    });
  }

  async fileProcessingFailed(failureData, options = {}) {
    return this.dispatch('file.processing.failed', failureData, {
      ...options,
      routing: { routingKey: 'files.processing.failed' }
    });
  }

  // Événements de conversation
  async conversationFileAdded(data, options = {}) {
    return this.dispatch('conversation.file.added', data, {
      ...options,
      routing: { routingKey: 'conversations.file.added' }
    });
  }

  async conversationFileRemoved(data, options = {}) {
    return this.dispatch('conversation.file.removed', data, {
      ...options,
      routing: { routingKey: 'conversations.file.removed' }
    });
  }

  // Événements de partage
  async shareAccessed(accessData, options = {}) {
    return this.dispatch('share.accessed', accessData, {
      ...options,
      routing: { routingKey: 'shares.accessed' }
    });
  }

  async shareExpired(shareData, options = {}) {
    return this.dispatch('share.expired', shareData, {
      ...options,
      routing: { routingKey: 'shares.expired' }
    });
  }

  // Événements système
  async systemCleanup(cleanupData, options = {}) {
    return this.dispatch('system.cleanup', cleanupData, {
      ...options,
      routing: { routingKey: 'system.cleanup' }
    });
  }

  async quotaExceeded(quotaData, options = {}) {
    return this.dispatch('system.quota.exceeded', quotaData, {
      ...options,
      routing: { routingKey: 'system.quota.exceeded' }
    });
  }

  // Événements en temps réel pour WebSocket
  async notifyRealTime(eventType, data, targets = [], options = {}) {
    return this.dispatch(eventType, data, {
      ...options,
      local: false,
      external: true,
      targets: ['websocket'],
      realTime: true,
      socketTargets: targets
    });
  }

  // Métriques et monitoring
  getMetrics() {
    const metrics = {
      local: null,
      external: {}
    };

    // Métriques locales
    if (this.localPublisher) {
      metrics.local = this.localPublisher.getMetrics();
    }

    // Métriques des handlers
    if (this.eventHandler) {
      metrics.handlers = this.eventHandler.getMetrics();
    }

    // Métriques externes
    this.externalPublishers.forEach((publisher, name) => {
      if (typeof publisher.getMetrics === 'function') {
        metrics.external[name] = publisher.getMetrics();
      }
    });

    return metrics;
  }

  async healthCheck() {
    const health = {
      status: 'healthy',
      components: {}
    };

    // Santé du publisher local
    if (this.localPublisher) {
      health.components.localPublisher = await this.localPublisher.healthCheck();
    }

    // Santé des publishers externes
    for (const [name, publisher] of this.externalPublishers) {
      if (typeof publisher.healthCheck === 'function') {
        try {
          health.components[name] = await publisher.healthCheck();
        } catch (error) {
          health.components[name] = { status: 'unhealthy', error: error.message };
          health.status = 'degraded';
        }
      }
    }

    return health;
  }

  // Nettoyage
  async shutdown() {
    logger.info('🛑 Arrêt EventDispatcher...');

    // Arrêter le handler
    if (this.eventHandler) {
      await this.eventHandler.shutdown();
    }

    // Arrêter le publisher local
    if (this.localPublisher) {
      await this.localPublisher.shutdown();
    }

    // Arrêter les publishers externes
    for (const [name, publisher] of this.externalPublishers) {
      try {
        if (typeof publisher.shutdown === 'function') {
          await publisher.shutdown();
          logger.info(`✅ ${name} publisher arrêté`);
        }
      } catch (error) {
        logger.error(`❌ Erreur arrêt ${name} publisher:`, { error: error.message });
      }
    }

    this.isInitialized = false;
    logger.info('✅ EventDispatcher arrêté');
  }
}

module.exports = EventDispatcher;
