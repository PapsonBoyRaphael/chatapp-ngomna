const { Kafka, Partitioners } = require('kafkajs');
const config = require('../../../shared/config');
const logger = require('../../../shared/utils/logger');

const kafka = new Kafka({
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  logLevel: 1, // ERROR only
  retry: {
    initialRetryTime: 100,
    retries: 3
  }
});

class KafkaProducer {
  constructor() {
    this.producer = kafka.producer({
      createPartitioner: Partitioners.LegacyPartitioner,
      allowAutoTopicCreation: true,
      transactionTimeout: 30000
    });
  }

  async connect() {
    try {
      await this.producer.connect();
      logger.info('✅ Kafka Producer connected');
    } catch (error) {
      logger.error('❌ Kafka Producer connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    try {
      await this.producer.disconnect();
      logger.info('📴 Kafka Producer disconnected');
    } catch (error) {
      logger.error('❌ Kafka disconnect error:', error);
    }
  }

  async publishEvent(topic, event) {
    try {
      const message = {
        key: event.id || event.aggregateId,
        value: JSON.stringify(event),
        timestamp: Date.now()
      };

      await this.producer.send({
        topic,
        messages: [message]
      });

      logger.info(`📤 Event published to ${topic}`);
    } catch (error) {
      logger.error(`❌ Failed to publish event to ${topic}:`, error);
      throw error;
    }
  }
}

module.exports = new KafkaProducer();
