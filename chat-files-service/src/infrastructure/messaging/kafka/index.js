/**
 * Index Kafka Infrastructure
 * CENADI Chat-Files-Service
 */

const KafkaPublisher = require('./KafkaPublisher');
const KafkaConsumer = require('./KafkaConsumer');

module.exports = {
  KafkaPublisher,
  KafkaConsumer
};
