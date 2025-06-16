/**
 * Kafka Publisher - Infrastructure
 * CENADI Chat-Files-Service
 */

const { Kafka } = require('kafkajs');
const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('KafkaPublisher');

class KafkaPublisher {
  constructor(options = {}) {
    this.options = {
      clientId: 'chat-files-service',
      brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'],
      ssl: process.env.KAFKA_SSL === 'true',
      sasl: process.env.KAFKA_SASL_ENABLED === 'true' ? {
        mechanism: process.env.KAFKA_SASL_MECHANISM || 'plain',
        username: process.env.KAFKA_SASL_USERNAME,
        password: process.env.KAFKA_SASL_PASSWORD
      } : null,
      retries: 3,
      retryDelayOnFailover: 100,
      maxInFlightRequests: 1,
      enableIdempotence: true,
      transactionTimeout: 30000,
      ...options
    };

    this.kafka = null;
    this.producer = null;
    this.admin = null;
    this.isConnected = false;
    this.metrics = this.initializeMetrics();
    
    // Topics configuration
    this.topics = {
      'file.uploaded': 'chat-files-uploaded',
      'file.downloaded': 'chat-files-downloaded',
      'file.deleted': 'chat-files-deleted',
      'file.shared': 'chat-files-shared',
      'file.processing.completed': 'chat-files-processing-completed',
      'file.processing.failed': 'chat-files-processing-failed',
      'conversation.file.added': 'chat-conversations-file-added',
      'conversation.file.removed': 'chat-conversations-file-removed',
      'share.accessed': 'chat-shares-accessed',
      'share.expired': 'chat-shares-expired',
      'system.cleanup': 'chat-system-cleanup',
      'system.quota.exceeded': 'chat-system-quota-exceeded'
    };

    logger.info('🎯 KafkaPublisher créé', {
      clientId: this.options.clientId,
      brokers: this.options.brokers
    });
  }

  // Initialisation
  async initialize() {
    try {
      logger.info('🔗 Connexion à Kafka...');

      // Créer l'instance Kafka
      this.kafka = new Kafka({
        clientId: this.options.clientId,
        brokers: this.options.brokers,
        ssl: this.options.ssl,
        sasl: this.options.sasl,
        retry: {
          retries: this.options.retries,
          retryDelayOnFailover: this.options.retryDelayOnFailover
        },
        connectionTimeout: 10000,
        requestTimeout: 30000
      });

      // Créer le producer
      this.producer = this.kafka.producer({
        maxInFlightRequests: this.options.maxInFlightRequests,
        idempotent: this.options.enableIdempotence,
        transactionTimeout: this.options.transactionTimeout,
        retry: {
          retries: this.options.retries
        }
      });

      // Créer l'admin client
      this.admin = this.kafka.admin();

      // Connecter le producer
      await this.producer.connect();
      await this.admin.connect();

      // Créer les topics si ils n'existent pas
      await this.ensureTopics();

      this.isConnected = true;
      logger.info('✅ Kafka connecté avec succès');

      // Configurer les event listeners
      this.setupEventListeners();

    } catch (error) {
      logger.error('❌ Erreur connexion Kafka:', { error: error.message });
      throw error;
    }
  }

  async ensureTopics() {
    try {
      const existingTopics = await this.admin.listTopics();
      const topicsToCreate = [];

      Object.values(this.topics).forEach(topicName => {
        if (!existingTopics.includes(topicName)) {
          topicsToCreate.push({
            topic: topicName,
            numPartitions: 3,
            replicationFactor: Math.min(3, this.options.brokers.length),
            configEntries: [
              {
                name: 'cleanup.policy',
                value: 'delete'
              },
              {
                name: 'retention.ms',
                value: '604800000' // 7 jours
              },
              {
                name: 'segment.ms',
                value: '86400000' // 1 jour
              }
            ]
          });
        }
      });

      if (topicsToCreate.length > 0) {
        logger.info('📝 Création des topics Kafka:', { 
          topics: topicsToCreate.map(t => t.topic) 
        });
        
        await this.admin.createTopics({
          topics: topicsToCreate,
          waitForLeaders: true
        });
      }

    } catch (error) {
      logger.error('❌ Erreur création topics:', { error: error.message });
      throw error;
    }
  }

  setupEventListeners() {
    // Event listeners pour monitoring
    this.producer.on('producer.connect', () => {
      logger.info('🔗 Producer Kafka connecté');
    });

    this.producer.on('producer.disconnect', () => {
      logger.warn('🔌 Producer Kafka déconnecté');
      this.isConnected = false;
    });

    this.producer.on('producer.network.request_timeout', (payload) => {
      logger.warn('⏰ Timeout requête Kafka:', payload);
      this.metrics.timeouts++;
    });
  }

  // Publication d'événements
  async publish(eventType, eventData, options = {}) {
    if (!this.isConnected) {
      throw new Error('Kafka non connecté');
    }

    const startTime = Date.now();

    try {
      const topic = this.getTopicForEvent(eventType);
      const message = this.createKafkaMessage(eventType, eventData, options);

      logger.debug('📤 Publication Kafka:', {
        topic,
        eventType,
        partition: message.partition,
        key: message.key
      });

      const result = await this.producer.send({
        topic,
        messages: [message],
        timeout: options.timeout || 30000
      });

      const duration = Date.now() - startTime;
      this.updateMetrics(eventType, 'published', duration);

      logger.debug('✅ Message Kafka publié:', {
        topic,
        partition: result[0].partition,
        offset: result[0].offset,
        duration
      });

      return {
        topic,
        partition: result[0].partition,
        offset: result[0].offset,
        timestamp: result[0].timestamp
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics(eventType, 'failed', duration);

      logger.error('❌ Erreur publication Kafka:', {
        eventType,
        error: error.message,
        duration
      });

      throw error;
    }
  }

  getTopicForEvent(eventType) {
    const topic = this.topics[eventType];
    if (!topic) {
      logger.warn('⚠️ Topic non configuré pour événement:', { eventType });
      return 'chat-files-default';
    }
    return topic;
  }

  createKafkaMessage(eventType, eventData, options = {}) {
    const message = {
      key: this.generateMessageKey(eventType, eventData, options),
      value: JSON.stringify({
        eventType,
        eventData,
        metadata: {
          timestamp: new Date().toISOString(),
          source: 'chat-files-service',
          version: '1.0',
          correlationId: options.correlationId || this.generateCorrelationId(),
          userId: options.userId,
          sessionId: options.sessionId,
          traceId: options.traceId,
          ...options.metadata
        }
      }),
      timestamp: Date.now().toString(),
      headers: this.createMessageHeaders(eventType, options)
    };

    // Partition spécifique si spécifiée
    if (options.partition !== undefined) {
      message.partition = options.partition;
    }

    return message;
  }

  generateMessageKey(eventType, eventData, options) {
    // Générer une clé pour le partitioning
    if (options.partitionKey) {
      return options.partitionKey;
    }

    // Clé basée sur les données de l'événement
    if (eventData.fileId) {
      return `file_${eventData.fileId}`;
    }

    if (eventData.conversationId) {
      return `conversation_${eventData.conversationId}`;
    }

    if (eventData.userId) {
      return `user_${eventData.userId}`;
    }

    // Clé par défaut
    return `event_${eventType}_${Date.now()}`;
  }

  createMessageHeaders(eventType, options) {
    const headers = {
      'content-type': 'application/json',
      'event-type': eventType,
      'source': 'chat-files-service'
    };

    if (options.priority) {
      headers['priority'] = options.priority;
    }

    if (options.userId) {
      headers['user-id'] = options.userId;
    }

    if (options.correlationId) {
      headers['correlation-id'] = options.correlationId;
    }

    return headers;
  }

  // Publication en batch
  async publishBatch(events, options = {}) {
    if (!this.isConnected) {
      throw new Error('Kafka non connecté');
    }

    const startTime = Date.now();

    try {
      // Grouper les événements par topic
      const messagesByTopic = this.groupMessagesByTopic(events, options);

      const promises = Object.entries(messagesByTopic).map(([topic, messages]) => {
        return this.producer.send({
          topic,
          messages,
          timeout: options.timeout || 30000
        });
      });

      const results = await Promise.all(promises);

      const duration = Date.now() - startTime;
      this.updateMetrics('batch', 'published', duration, events.length);

      logger.info('✅ Batch Kafka publié:', {
        eventCount: events.length,
        topicCount: Object.keys(messagesByTopic).length,
        duration
      });

      return results.flat();

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics('batch', 'failed', duration);

      logger.error('❌ Erreur publication batch Kafka:', {
        eventCount: events.length,
        error: error.message,
        duration
      });

      throw error;
    }
  }

  groupMessagesByTopic(events, options) {
    const messagesByTopic = {};

    events.forEach(event => {
      const topic = this.getTopicForEvent(event.type);
      
      if (!messagesByTopic[topic]) {
        messagesByTopic[topic] = [];
      }

      const message = this.createKafkaMessage(event.type, event.data, {
        ...options,
        ...event.options
      });

      messagesByTopic[topic].push(message);
    });

    return messagesByTopic;
  }

  // Transaction support
  async publishTransaction(events, options = {}) {
    if (!this.isConnected) {
      throw new Error('Kafka non connecté');
    }

    const transaction = await this.producer.transaction();

    try {
      logger.debug('🔄 Début transaction Kafka');

      for (const event of events) {
        const topic = this.getTopicForEvent(event.type);
        const message = this.createKafkaMessage(event.type, event.data, {
          ...options,
          ...event.options
        });

        await transaction.send({
          topic,
          messages: [message]
        });
      }

      await transaction.commit();
      
      logger.info('✅ Transaction Kafka commitée:', { eventCount: events.length });

    } catch (error) {
      logger.error('❌ Erreur transaction Kafka:', { error: error.message });
      await transaction.abort();
      throw error;
    }
  }

  // Métriques
  initializeMetrics() {
    return {
      published: new Map(),
      failed: new Map(),
      totalMessages: 0,
      totalBatches: 0,
      totalDuration: 0,
      timeouts: 0,
      lastPublish: null
    };
  }

  updateMetrics(eventType, action, duration = 0, count = 1) {
    const metricMap = this.metrics[action];
    if (metricMap) {
      const current = metricMap.get(eventType) || { count: 0, totalDuration: 0 };
      current.count += count;
      current.totalDuration += duration;
      metricMap.set(eventType, current);
    }

    if (action === 'published') {
      this.metrics.totalMessages += count;
      this.metrics.totalDuration += duration;
      this.metrics.lastPublish = new Date().toISOString();
    }
  }

  getMetrics() {
    const summary = {
      overview: {
        totalMessages: this.metrics.totalMessages,
        totalBatches: this.metrics.totalBatches,
        averageDuration: this.metrics.totalMessages > 0 
          ? Math.round(this.metrics.totalDuration / this.metrics.totalMessages) 
          : 0,
        timeouts: this.metrics.timeouts,
        lastPublish: this.metrics.lastPublish
      },
      byEventType: {}
    };

    // Métriques par type d'événement
    const allEventTypes = new Set();
    this.metrics.published.forEach((_, eventType) => allEventTypes.add(eventType));
    this.metrics.failed.forEach((_, eventType) => allEventTypes.add(eventType));

    allEventTypes.forEach(eventType => {
      const published = this.metrics.published.get(eventType) || { count: 0, totalDuration: 0 };
      const failed = this.metrics.failed.get(eventType) || { count: 0, totalDuration: 0 };

      summary.byEventType[eventType] = {
        published: published.count,
        failed: failed.count,
        successRate: (published.count + failed.count) > 0 
          ? Math.round((published.count / (published.count + failed.count)) * 100) 
          : 0,
        averageDuration: published.count > 0 
          ? Math.round(published.totalDuration / published.count) 
          : 0
      };
    });

    return summary;
  }

  // Monitoring et santé
  async healthCheck() {
    try {
      // Tester la connexion admin
      await this.admin.listTopics();

      return {
        status: 'healthy',
        connected: this.isConnected,
        brokers: this.options.brokers,
        topics: Object.keys(this.topics).length,
        metrics: this.getMetrics().overview
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message
      };
    }
  }

  // Utilitaires
  generateCorrelationId() {
    return `kafka_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Nettoyage
  async shutdown() {
    logger.info('🛑 Arrêt KafkaPublisher...');

    try {
      if (this.producer) {
        await this.producer.disconnect();
        logger.info('✅ Producer Kafka déconnecté');
      }

      if (this.admin) {
        await this.admin.disconnect();
        logger.info('✅ Admin Kafka déconnecté');
      }

      this.isConnected = false;
      logger.info('✅ KafkaPublisher arrêté');

    } catch (error) {
      logger.error('❌ Erreur arrêt Kafka:', { error: error.message });
      throw error;
    }
  }
}

module.exports = KafkaPublisher;
