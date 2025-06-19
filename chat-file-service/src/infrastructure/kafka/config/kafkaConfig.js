const { Kafka, logLevel } = require("kafkajs");

// ✅ CONFIGURATION KAFKA AMÉLIORÉE
const kafkaConfig = {
  clientId: process.env.KAFKA_CLIENT_ID || "chat-file-service",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
  connectionTimeout: 20000, // ✅ AUGMENTER LE TIMEOUT
  requestTimeout: 40000,
  retry: {
    initialRetryTime: 300,
    retries: 8,
    maxRetryTime: 30000,
    factor: 2,
  },
  // ✅ CONFIGURATION SSL/SASL CONDITIONNELLE
  ssl:
    process.env.KAFKA_SSL === "true"
      ? {
          rejectUnauthorized: false,
        }
      : false,
  sasl: process.env.KAFKA_USERNAME
    ? {
        mechanism: "plain",
        username: process.env.KAFKA_USERNAME,
        password: process.env.KAFKA_PASSWORD,
      }
    : undefined,
};

// ✅ ALTERNATIVE : CONFIGURATION PRODUCER SANS IDEMPOTENCE (PLUS ROBUSTE)
const producerConfig = {
  // ✅ DÉSACTIVER L'IDEMPOTENCE POUR ÉVITER COMPLÈTEMENT LE WARNING
  idempotent: false, // ✅ Plus de contraintes EoS
  maxInFlightRequests: 5, // ✅ Peut être plus élevé sans idempotence
  acks: 1, // ✅ Seulement le leader (plus rapide que -1)

  // ✅ RETRY CONFIGURATION NORMALE
  retry: {
    initialRetryTime: 100,
    retries: 8, // ✅ Peut être élevé sans idempotence
    maxRetryTime: 30000,
    factor: 2,
  },

  // ✅ TIMEOUTS NORMAUX
  transactionTimeout: 30000,
  requestTimeout: 30000,
  connectionTimeout: 3000,

  // ✅ AUTRES PARAMÈTRES
  allowAutoTopicCreation: true,
  compression: "gzip",

  // ✅ CONFIGURATION BATCH OPTIMISÉE
  batchSize: 32768,
  lingerMs: 10,
  bufferMemory: 33554432,
};

// ✅ CONFIGURATION CONSUMER AVEC GROUPID UNIQUE
const consumerConfig = {
  groupId:
    process.env.KAFKA_CONSUMER_GROUP_ID ||
    `chat-file-service-${process.env.SERVER_ID || "chat-file-1"}`,
  sessionTimeout: 30000,
  rebalanceTimeout: 60000,
  heartbeatInterval: 10000, // ✅ RÉDUIRE L'INTERVALLE DE HEARTBEAT
  maxBytesPerPartition: 1048576,
  minBytes: 1,
  maxBytes: 10485760,
  maxWaitTimeInMs: 5000,
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
  allowAutoTopicCreation: false,
  autoCommit: true,
  autoCommitInterval: 5000,
};

const createKafkaInstance = () => {
  try {
    console.log("🔧 Configuration Kafka:", {
      clientId: kafkaConfig.clientId,
      brokers: kafkaConfig.brokers,
      ssl: !!kafkaConfig.ssl,
      sasl: !!kafkaConfig.sasl,
    });

    const kafka = new Kafka(kafkaConfig);
    return kafka;
  } catch (error) {
    console.error("❌ Erreur création instance Kafka:", error);
    throw error;
  }
};

const createProducer = (kafka) => {
  try {
    const producer = kafka.producer(producerConfig);

    // ✅ AJOUTER DES LISTENERS D'ÉVÉNEMENTS
    producer.on("producer.connect", () => {
      console.log("✅ Producer Kafka connecté");
    });

    producer.on("producer.disconnect", () => {
      console.log("🔌 Producer Kafka déconnecté");
    });

    producer.on("producer.network.request_timeout", (payload) => {
      console.warn("⚠️ Timeout requête Producer:", payload.broker);
    });

    return producer;
  } catch (error) {
    console.error("❌ Erreur création producer:", error);
    throw error;
  }
};

const createConsumer = (kafka, topics = []) => {
  try {
    const consumer = kafka.consumer(consumerConfig);

    // ✅ AJOUTER DES LISTENERS D'ÉVÉNEMENTS AVEC GROUPID CORRECT
    consumer.on("consumer.connect", () => {
      console.log("✅ Consumer Kafka connecté");
    });

    consumer.on("consumer.disconnect", () => {
      console.log("🔌 Consumer Kafka déconnecté");
    });

    consumer.on("consumer.crash", (payload) => {
      console.error("❌ Consumer Kafka crash:", payload.error.message);
    });

    consumer.on("consumer.group_join", (payload) => {
      // ✅ CORRECTION: Utiliser le bon groupId du payload ou de la config
      const groupId = payload.groupId || consumerConfig.groupId || "unknown";
      console.log("👥 Consumer rejoint groupe:", groupId);
    });

    consumer.on("consumer.heartbeat", () => {
      // ✅ MASQUER LES HEARTBEATS EN PRODUCTION
      if (
        process.env.NODE_ENV === "development" &&
        process.env.DEBUG_KAFKA === "true"
      ) {
        // console.log("💓 Consumer heartbeat");
      }
    });

    // ✅ STOCKER LE GROUPID DANS LE CONSUMER POUR ACCÈS FACILE
    consumer._groupId = consumerConfig.groupId;

    return consumer;
  } catch (error) {
    console.error("❌ Erreur création consumer:", error);
    throw error;
  }
};

module.exports = {
  kafkaConfig,
  producerConfig,
  consumerConfig,
  createKafkaInstance,
  createProducer,
  createConsumer,
};
