/**
 * Kafka Consumer - Infrastructure
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('KafkaConsumer');

class KafkaConsumer {
  constructor(kafka, options = {}) {
    this.kafka = kafka;
    this.options = {
      groupId: 'chat-files-service-group',
      sessionTimeout: 30000,
      rebalanceTimeout: 60000,
      heartbeatInterval: 3000,
      maxBytesPerPartition: 1048576, // 1MB
      maxBytes: 10485760, // 10MB
      maxWaitTimeInMs: 5000,
      allowAutoTopicCreation: false,
      ...options
    };

    this.consumer = null;
    this.isRunning = false;
    this.handlers = new Map();
    this.metrics = this.initializeMetrics();
    this.subscriptions = new Set();

    logger.info('🎯 KafkaConsumer créé', {
      groupId: this.options.groupId
    });
  }

  // Initialisation
  async initialize() {
    try {
      logger.info('🔗 Initialisation KafkaConsumer...');

      this.consumer = this.kafka.consumer({
        groupId: this.options.groupId,
        sessionTimeout: this.options.sessionTimeout,
        rebalanceTimeout: this.options.rebalanceTimeout,
        heartbeatInterval: this.options.heartbeatInterval,
        maxBytesPerPartition: this.options.maxBytesPerPartition,
        maxBytes: this.options.maxBytes,
        maxWaitTimeInMs: this.options.maxWaitTimeInMs,
        allowAutoTopicCreation: this.options.allowAutoTopicCreation
      });

      await this.consumer.connect();
      this.setupEventListeners();

      logger.info('✅ KafkaConsumer initialisé');

    } catch (error) {
      logger.error('❌ Erreur initialisation KafkaConsumer:', { error: error.message });
      throw error;
    }
  }

  setupEventListeners() {
    this.consumer.on('consumer.connect', () => {
      logger.info('🔗 Consumer Kafka connecté');
    });

    this.consumer.on('consumer.disconnect', () => {
      logger.warn('🔌 Consumer Kafka déconnecté');
      this.isRunning = false;
    });

    this.consumer.on('consumer.group_join', (event) => {
      logger.info('👥 Rejoint le groupe Kafka:', { 
        groupId: event.payload.groupId,
        memberId: event.payload.memberId 
      });
    });

    this.consumer.on('consumer.rebalancing', () => {
      logger.info('⚖️ Rééquilibrage Kafka en cours...');
    });

    this.consumer.on('consumer.crash', (event) => {
      logger.error('💥 Crash Consumer Kafka:', { 
        error: event.payload.error.message 
      });
      this.metrics.crashes++;
    });
  }

  // Souscription aux topics
  async subscribe(topics, handler, options = {}) {
    try {
      const topicList = Array.isArray(topics) ? topics : [topics];
      
      logger.info('📝 Souscription aux topics:', { topics: topicList });

      // Enregistrer le handler
      topicList.forEach(topic => {
        this.handlers.set(topic, {
          handler,
          options: {
            autoCommit: true,
            enableDeadLetter: true,
            maxRetries: 3,
            retryDelay: 1000,
            ...options
          }
        });
        this.subscriptions.add(topic);
      });

      // S'abonner aux topics
      await this.consumer.subscribe({
        topics: topicList,
        fromBeginning: options.fromBeginning || false
      });

      logger.info('✅ Souscription réussie');

    } catch (error) {
      logger.error('❌ Erreur souscription topics:', { error: error.message });
      throw error;
    }
  }

  // Démarrer la consommation
  async start() {
    if (this.isRunning) {
      logger.warn('⚠️ Consumer déjà en cours d\'exécution');
      return;
    }

    try {
      logger.info('🚀 Démarrage consommation Kafka...');

      this.isRunning = true;

      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          await this.processMessage(topic, partition, message);
        },
        eachBatch: async ({ batch }) => {
          await this.processBatch(batch);
        },
        autoCommit: false, // Commit manuel pour plus de contrôle
        autoCommitInterval: 5000,
        autoCommitThreshold: 100
      });

      logger.info('✅ Consommation Kafka démarrée');

    } catch (error) {
      logger.error('❌ Erreur démarrage consommation:', { error: error.message });
      this.isRunning = false;
      throw error;
    }
  }

  // Traitement d'un message
  async processMessage(topic, partition, message) {
    const startTime = Date.now();
    let eventData = null;

    try {
      // Décoder le message
      eventData = this.decodeMessage(message);
      
      logger.debug('📨 Message reçu:', {
        topic,
        partition,
        offset: message.offset,
        eventType: eventData.eventType,
        correlationId: eventData.metadata?.correlationId
      });

      // Trouver le handler
      const handlerConfig = this.handlers.get(topic);
      if (!handlerConfig) {
        logger.warn('⚠️ Aucun handler pour topic:', { topic });
        await this.consumer.commitOffsets([{
          topic,
          partition,
          offset: (parseInt(message.offset) + 1).toString()
        }]);
        return;
      }

      // Exécuter le handler
      await this.executeHandler(handlerConfig, eventData, {
        topic,
        partition,
        offset: message.offset,
        timestamp: message.timestamp,
        headers: message.headers
      });

      // Commit du message
      if (handlerConfig.options.autoCommit) {
        await this.consumer.commitOffsets([{
          topic,
          partition,
          offset: (parseInt(message.offset) + 1).toString()
        }]);
      }

      const duration = Date.now() - startTime;
      this.updateMetrics(topic, 'processed', duration);

      logger.debug('✅ Message traité:', {
        topic,
        offset: message.offset,
        duration
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics(topic, 'failed', duration);

      logger.error('❌ Erreur traitement message:', {
        topic,
        partition,
        offset: message.offset,
        error: error.message,
        eventType: eventData?.eventType
      });

      // Gestion de l'erreur
      await this.handleProcessingError(topic, partition, message, eventData, error);
    }
  }

  // Traitement en batch
  async processBatch(batch) {
    const startTime = Date.now();

    try {
      logger.debug('📦 Traitement batch:', {
        topic: batch.topic,
        partition: batch.partition,
        messageCount: batch.messages.length
      });

      // Traiter tous les messages du batch
      for (const message of batch.messages) {
        await this.processMessage(batch.topic, batch.partition, message);
      }

      const duration = Date.now() - startTime;
      this.updateMetrics('batch', 'processed', duration, batch.messages.length);

      logger.debug('✅ Batch traité:', {
        topic: batch.topic,
        messageCount: batch.messages.length,
        duration
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics('batch', 'failed', duration);

      logger.error('❌ Erreur traitement batch:', {
        topic: batch.topic,
        error: error.message
      });

      throw error;
    }
  }

  // Décoder un message Kafka
  decodeMessage(message) {
    try {
      const value = message.value.toString();
      const eventData = JSON.parse(value);

      // Validation de base
      if (!eventData.eventType || !eventData.eventData) {
        throw new Error('Format de message invalide');
      }

      return eventData;

    } catch (error) {
      logger.error('❌ Erreur décodage message:', { error: error.message });
      throw new Error(`Impossible de décoder le message: ${error.message}`);
    }
  }

  // Exécuter un handler
  async executeHandler(handlerConfig, eventData, messageContext) {
    const { handler, options } = handlerConfig;
    let attempt = 0;

    while (attempt < (options.maxRetries || 3)) {
      try {
        await handler(eventData, messageContext);
        return; // Succès, sortir de la boucle

      } catch (error) {
        attempt++;
        
        if (attempt >= (options.maxRetries || 3)) {
          // Dernière tentative échouée
          if (options.enableDeadLetter) {
            await this.sendToDeadLetter(eventData, messageContext, error);
          }
          throw error;
        }

        // Retry avec délai
        const delay = (options.retryDelay || 1000) * Math.pow(2, attempt - 1);
        logger.warn(`🔄 Retry ${attempt}/${options.maxRetries}:`, {
          eventType: eventData.eventType,
          delay,
          error: error.message
        });

        await this.sleep(delay);
      }
    }
  }

  // Gestion des erreurs de traitement
  async handleProcessingError(topic, partition, message, eventData, error) {
    // Log de l'erreur
    logger.error('💀 Erreur fatale traitement message:', {
      topic,
      partition,
      offset: message.offset,
      eventType: eventData?.eventType,
      error: error.message
    });

    // Envoyer en dead letter si configuré
    const handlerConfig = this.handlers.get(topic);
    if (handlerConfig?.options.enableDeadLetter) {
      await this.sendToDeadLetter(eventData, {
        topic,
        partition,
        offset: message.offset
      }, error);
    }

    // Commit du message pour éviter le retraitement infini
    await this.consumer.commitOffsets([{
      topic,
      partition,
      offset: (parseInt(message.offset) + 1).toString()
    }]);
  }

  // Dead Letter Queue
  async sendToDeadLetter(eventData, messageContext, error) {
    try {
      logger.warn('💀 Envoi en Dead Letter Queue:', {
        eventType: eventData?.eventType,
        topic: messageContext.topic,
        offset: messageContext.offset
      });

      // Ici on pourrait publier vers un topic dead letter
      // ou sauvegarder dans une base de données
      this.metrics.deadLettered++;

    } catch (dlqError) {
      logger.error('❌ Erreur Dead Letter Queue:', { error: dlqError.message });
    }
  }

  // Métriques
  initializeMetrics() {
    return {
      processed: new Map(),
      failed: new Map(),
      totalMessages: 0,
      totalBatches: 0,
      deadLettered: 0,
      crashes: 0,
      totalDuration: 0,
      lastProcessed: null
    };
  }

  updateMetrics(topic, action, duration = 0, count = 1) {
    const metricMap = this.metrics[action];
    if (metricMap) {
      const current = metricMap.get(topic) || { count: 0, totalDuration: 0 };
      current.count += count;
      current.totalDuration += duration;
      metricMap.set(topic, current);
    }

    if (action === 'processed') {
      this.metrics.totalMessages += count;
      this.metrics.totalDuration += duration;
      this.metrics.lastProcessed = new Date().toISOString();
    }
  }

  getMetrics() {
    const summary = {
      overview: {
        totalMessages: this.metrics.totalMessages,
        totalBatches: this.metrics.totalBatches,
        deadLettered: this.metrics.deadLettered,
        crashes: this.metrics.crashes,
        averageDuration: this.metrics.totalMessages > 0 
          ? Math.round(this.metrics.totalDuration / this.metrics.totalMessages) 
          : 0,
        lastProcessed: this.metrics.lastProcessed
      },
      byTopic: {}
    };

    // Métriques par topic
    this.subscriptions.forEach(topic => {
      const processed = this.metrics.processed.get(topic) || { count: 0, totalDuration: 0 };
      const failed = this.metrics.failed.get(topic) || { count: 0, totalDuration: 0 };

      summary.byTopic[topic] = {
        processed: processed.count,
        failed: failed.count,
        successRate: (processed.count + failed.count) > 0 
          ? Math.round((processed.count / (processed.count + failed.count)) * 100) 
          : 0,
        averageDuration: processed.count > 0 
          ? Math.round(processed.totalDuration / processed.count) 
          : 0
      };
    });

    return summary;
  }

  // Commit manuel
  async commitOffsets(offsets) {
    try {
      await this.consumer.commitOffsets(offsets);
      logger.debug('✅ Offsets committés:', { count: offsets.length });
    } catch (error) {
      logger.error('❌ Erreur commit offsets:', { error: error.message });
      throw error;
    }
  }

  // Pause/Resume
  async pause(topics) {
    const topicPartitions = topics.map(topic => ({ topic }));
    this.consumer.pause(topicPartitions);
    logger.info('⏸️ Topics mis en pause:', { topics });
  }

  async resume(topics) {
    const topicPartitions = topics.map(topic => ({ topic }));
    this.consumer.resume(topicPartitions);
    logger.info('▶️ Topics repris:', { topics });
  }

  // Santé
  async healthCheck() {
    try {
      return {
        status: 'healthy',
        running: this.isRunning,
        subscriptions: Array.from(this.subscriptions),
        groupId: this.options.groupId,
        metrics: this.getMetrics().overview
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        running: false,
        error: error.message
      };
    }
  }

  // Utilitaires
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Arrêt
  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('🛑 Arrêt KafkaConsumer...');

    try {
      this.isRunning = false;
      
      if (this.consumer) {
        await this.consumer.disconnect();
      }

      logger.info('✅ KafkaConsumer arrêté');

    } catch (error) {
      logger.error('❌ Erreur arrêt KafkaConsumer:', { error: error.message });
      throw error;
    }
  }
}

module.exports = KafkaConsumer;
