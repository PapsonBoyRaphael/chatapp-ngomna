const config = require('../../../shared/config');
const logger = require('../../../shared/utils/logger');

class KafkaProducer {
  constructor() {
    this.producer = null;
    this.kafka = null;
    this.isConnected = false;
  }

  async connect() {
    if (!config.kafka.enabled) {
      logger.info('🔇 Kafka explicitly disabled');
      return;
    }

    try {
      const { Kafka, Partitioners } = require('kafkajs');

      this.kafka = new Kafka({
        clientId: config.kafka.clientId,
        brokers: config.kafka.brokers,
        logLevel: 1
      });

      this.producer = this.kafka.producer({
        createPartitioner: Partitioners.LegacyPartitioner
      });

      await this.producer.connect();
      this.isConnected = true;
      logger.info('✅ Kafka Producer connected');

    } catch (error) {
      this.isConnected = false;
      if (error.code === 'MODULE_NOT_FOUND') {
        logger.info('📦 KafkaJS not installed');
        throw new Error('KafkaJS module not found');
      }
      logger.error('❌ Kafka Producer connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.producer && this.isConnected) {
        await this.producer.disconnect();
        this.isConnected = false;
        logger.info('📴 Kafka Producer disconnected');
      }
    } catch (error) {
      logger.warn('⚠️ Kafka disconnect error:', error.message);
    }
  }

  async healthCheck() {
    if (!this.isConnected) {
      return { status: 'disconnected' };
    }
    return { status: 'healthy' };
  }

  isReady() {
    return this.isConnected;
  }
}

module.exports = new KafkaProducer();
