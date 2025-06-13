const { Kafka } = require('kafkajs');
const config = require('../../../shared/config');
const logger = require('../../../shared/utils/logger');

const kafka = new Kafka({
  clientId: config.kafka.clientId,
  brokers: config.kafka.brokers,
  logLevel: 2, // WARN
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

module.exports = kafka;
