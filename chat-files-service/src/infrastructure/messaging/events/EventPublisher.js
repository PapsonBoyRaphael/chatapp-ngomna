/**
 * Event Publisher - Infrastructure
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { EventEmitter } = require('events');

const logger = createLogger('EventPublisher');

class EventPublisher extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      maxListeners: 100,
      enableMetrics: true,
      enableRetry: true,
      retryAttempts: 3,
      retryDelay: 1000,
      enableBatching: false,
      batchSize: 10,
      batchTimeout: 5000,
      ...options
    };

    this.setMaxListeners(this.options.maxListeners);
    this.metrics = this.initializeMetrics();
    this.eventQueue = [];
    this.batchTimer = null;
    
    if (this.options.enableBatching) {
      this.startBatchProcessor();
    }

    logger.info('🚀 EventPublisher initialisé', {
      maxListeners: this.options.maxListeners,
      enableMetrics: this.options.enableMetrics,
      enableBatching: this.options.enableBatching
    });
  }

  // Publier un événement
  async publish(eventType, eventData, options = {}) {
    const startTime = Date.now();
    
    try {
      const event = this.createEvent(eventType, eventData, options);
      
      logger.debug('📡 Publication événement:', {
        type: eventType,
        id: event.id,
        timestamp: event.timestamp
      });

      // Validation de l'événement
      this.validateEvent(event);

      // Traitement selon le mode
      if (this.options.enableBatching && !options.immediate) {
        await this.addToBatch(event);
      } else {
        await this.publishImmediate(event);
      }

      // Métriques
      this.updateMetrics(eventType, 'published', Date.now() - startTime);

      return event.id;

    } catch (error) {
      logger.error('❌ Erreur publication événement:', {
        eventType,
        error: error.message,
        duration: Date.now() - startTime
      });

      this.updateMetrics(eventType, 'failed');
      throw error;
    }
  }

  // Créer un événement structuré
  createEvent(eventType, eventData, options = {}) {
    const event = {
      id: this.generateEventId(),
      type: eventType,
      data: eventData,
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0',
        source: 'chat-files-service',
        correlationId: options.correlationId || this.generateCorrelationId(),
        userId: options.userId || null,
        sessionId: options.sessionId || null,
        traceId: options.traceId || null,
        priority: options.priority || 'normal',
        ...options.metadata
      },
      routing: {
        exchange: options.exchange || 'default',
        routingKey: options.routingKey || eventType,
        persistent: options.persistent !== false,
        ttl: options.ttl || 3600000 // 1 heure par défaut
      }
    };

    return event;
  }

  // Validation des événements
  validateEvent(event) {
    if (!event.type || typeof event.type !== 'string') {
      throw new Error('Type d\'événement requis');
    }

    if (!event.data) {
      throw new Error('Données d\'événement requises');
    }

    if (event.type.length > 100) {
      throw new Error('Type d\'événement trop long');
    }

    // Validation de la taille des données
    const dataSize = JSON.stringify(event.data).length;
    if (dataSize > 1024 * 1024) { // 1MB
      throw new Error('Données d\'événement trop volumineuses');
    }
  }

  // Publication immédiate
  async publishImmediate(event) {
    const handlers = this.listeners(event.type);
    
    if (handlers.length === 0) {
      logger.warn('⚠️ Aucun handler pour l\'événement:', { type: event.type });
      return;
    }

    // Émettre l'événement vers tous les handlers
    this.emit(event.type, event);

    // Émettre aussi vers le handler générique
    this.emit('*', event);

    logger.debug('✅ Événement publié:', {
      type: event.type,
      id: event.id,
      handlersCount: handlers.length
    });
  }

  // Gestion du batch
  async addToBatch(event) {
    this.eventQueue.push(event);

    if (this.eventQueue.length >= this.options.batchSize) {
      await this.processBatch();
    }
  }

  async processBatch() {
    if (this.eventQueue.length === 0) return;

    const batch = this.eventQueue.splice(0, this.options.batchSize);
    
    logger.debug('📦 Traitement batch événements:', { count: batch.length });

    try {
      // Grouper par type d'événement
      const groupedEvents = this.groupEventsByType(batch);

      // Publier chaque groupe
      for (const [eventType, events] of Object.entries(groupedEvents)) {
        this.emit(eventType, events);
        this.emit('*', events);
      }

      // Métriques batch
      this.updateMetrics('batch', 'processed', 0, batch.length);

    } catch (error) {
      logger.error('❌ Erreur traitement batch:', { error: error.message });
      
      // Remettre les événements en queue pour retry
      this.eventQueue.unshift(...batch);
    }
  }

  groupEventsByType(events) {
    return events.reduce((groups, event) => {
      if (!groups[event.type]) {
        groups[event.type] = [];
      }
      groups[event.type].push(event);
      return groups;
    }, {});
  }

  startBatchProcessor() {
    this.batchTimer = setInterval(async () => {
      if (this.eventQueue.length > 0) {
        await this.processBatch();
      }
    }, this.options.batchTimeout);
  }

  // Souscription avec retry
  subscribe(eventType, handler, options = {}) {
    const wrappedHandler = async (event) => {
      const startTime = Date.now();
      
      try {
        await handler(event);
        this.updateMetrics(eventType, 'handled', Date.now() - startTime);
        
      } catch (error) {
        logger.error('❌ Erreur handler événement:', {
          eventType,
          eventId: Array.isArray(event) ? 'batch' : event.id,
          error: error.message
        });

        this.updateMetrics(eventType, 'error');

        // Retry si activé
        if (this.options.enableRetry && options.enableRetry !== false) {
          await this.retryHandler(event, handler, eventType);
        }
      }
    };

    this.on(eventType, wrappedHandler);
    
    logger.debug('📝 Handler souscrit:', { eventType });
    
    return wrappedHandler;
  }

  async retryHandler(event, handler, eventType, attempt = 1) {
    if (attempt > this.options.retryAttempts) {
      logger.error('❌ Échec définitif handler après retries:', {
        eventType,
        eventId: Array.isArray(event) ? 'batch' : event.id,
        attempts: attempt - 1
      });
      return;
    }

    // Délai exponentiel
    const delay = this.options.retryDelay * Math.pow(2, attempt - 1);
    
    logger.warn(`🔄 Retry handler ${attempt}/${this.options.retryAttempts}:`, {
      eventType,
      delay
    });

    setTimeout(async () => {
      try {
        await handler(event);
        this.updateMetrics(eventType, 'retried_success');
        
      } catch (error) {
        this.updateMetrics(eventType, 'retried_failed');
        await this.retryHandler(event, handler, eventType, attempt + 1);
      }
    }, delay);
  }

  // Métriques
  initializeMetrics() {
    return {
      published: new Map(),
      handled: new Map(),
      failed: new Map(),
      errors: new Map(),
      retried_success: new Map(),
      retried_failed: new Map(),
      batch_processed: 0,
      total_events: 0,
      total_duration: 0
    };
  }

  updateMetrics(eventType, action, duration = 0, count = 1) {
    if (!this.options.enableMetrics) return;

    if (!this.metrics[action]) {
      this.metrics[action] = new Map();
    }

    const current = this.metrics[action].get(eventType) || { count: 0, totalDuration: 0 };
    current.count += count;
    current.totalDuration += duration;
    
    this.metrics[action].set(eventType, current);

    if (action === 'published') {
      this.metrics.total_events += count;
      this.metrics.total_duration += duration;
    }
  }

  getMetrics() {
    if (!this.options.enableMetrics) {
      return { message: 'Métriques désactivées' };
    }

    const summary = {
      overview: {
        totalEvents: this.metrics.total_events,
        averageDuration: this.metrics.total_events > 0 
          ? Math.round(this.metrics.total_duration / this.metrics.total_events) 
          : 0,
        batchesProcessed: this.metrics.batch_processed
      },
      byEventType: {},
      byAction: {}
    };

    // Métriques par type d'événement
    const allEventTypes = new Set();
    Object.values(this.metrics).forEach(metric => {
      if (metric instanceof Map) {
        metric.forEach((_, eventType) => allEventTypes.add(eventType));
      }
    });

    allEventTypes.forEach(eventType => {
      summary.byEventType[eventType] = {
        published: this.getMetricForEventType('published', eventType),
        handled: this.getMetricForEventType('handled', eventType),
        failed: this.getMetricForEventType('failed', eventType),
        errors: this.getMetricForEventType('errors', eventType)
      };
    });

    return summary;
  }

  getMetricForEventType(action, eventType) {
    const metric = this.metrics[action]?.get(eventType);
    if (!metric) return { count: 0, averageDuration: 0 };

    return {
      count: metric.count,
      averageDuration: metric.count > 0 
        ? Math.round(metric.totalDuration / metric.count) 
        : 0
    };
  }

  // Utilitaires
  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateCorrelationId() {
    return `cor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Nettoyage
  async shutdown() {
    logger.info('🛑 Arrêt EventPublisher...');

    // Traiter les événements en attente
    if (this.eventQueue.length > 0) {
      logger.info(`📦 Traitement final de ${this.eventQueue.length} événements...`);
      await this.processBatch();
    }

    // Arrêter le timer batch
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }

    // Supprimer tous les listeners
    this.removeAllListeners();

    logger.info('✅ EventPublisher arrêté');
  }

  // Debug et monitoring
  listActiveSubscriptions() {
    const subscriptions = {};
    
    this.eventNames().forEach(eventType => {
      subscriptions[eventType] = this.listenerCount(eventType);
    });

    return subscriptions;
  }

  async healthCheck() {
    return {
      status: 'healthy',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      activeSubscriptions: Object.keys(this.listActiveSubscriptions()).length,
      queueSize: this.eventQueue.length,
      metrics: this.options.enableMetrics ? this.getMetrics().overview : null
    };
  }
}

module.exports = EventPublisher;
