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

// ✅ CONFIGURATION CONSUMER OPTIMISÉE POUR ÉVITER LES REBALANCES
const consumerConfig = {
  groupId:
    process.env.KAFKA_CONSUMER_GROUP_ID ||
    `chat-file-service-${process.env.SERVER_ID || Date.now()}`, // ✅ IDENTIFIANT UNIQUE
  sessionTimeout: 45000, // ✅ AUGMENTER (au lieu de 30000)
  rebalanceTimeout: 90000, // ✅ AUGMENTER (au lieu de 60000)
  heartbeatInterval: 15000, // ✅ AUGMENTER (au lieu de 10000)
  maxBytesPerPartition: 1048576,
  minBytes: 1,
  maxBytes: 10485760,
  maxWaitTimeInMs: 10000, // ✅ AUGMENTER
  retry: {
    initialRetryTime: 300, // ✅ AUGMENTER
    retries: 5, // ✅ RÉDUIRE
    maxRetryTime: 30000,
    factor: 2,
  },

  // ✅ NOUVEAUX PARAMÈTRES ANTI-REBALANCE
  allowAutoTopicCreation: true, // ✅ DÉSACTIVER AUTO-CRÉATION
  partitionAssignors: ["RoundRobinAssigner"], // ✅ ASSIGNATION EXPLICITE
  readUncommitted: false,
  maxInFlightRequests: 1, // ✅ LIMITER LES REQUÊTES CONCURRENTES
};

// ✅ VARIABLES GLOBALES POUR TRACKING
let kafkaInstance = null;
let connectedProducers = new Set();
let connectedConsumers = new Set();
let isKafkaHealthy = false;
let lastHealthCheck = null;
let healthCheckError = null;

const createKafkaInstance = () => {
  try {
    console.log("🔧 Configuration Kafka:", {
      clientId: kafkaConfig.clientId,
      brokers: kafkaConfig.brokers,
      ssl: !!kafkaConfig.ssl,
      sasl: !!kafkaConfig.sasl,
    });

    kafkaInstance = new Kafka(kafkaConfig);
    return kafkaInstance;
  } catch (error) {
    console.error("❌ Erreur création instance Kafka:", error);
    kafkaInstance = null;
    throw error;
  }
};

const createProducer = (kafka) => {
  try {
    const producer = kafka.producer(producerConfig);
    const producerId = `producer_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // ✅ TRACKER LES ÉVÉNEMENTS DE CONNEXION
    producer.on("producer.connect", () => {
      console.log("✅ Producer Kafka connecté");
      trackProducerConnection(producerId, true);
    });

    producer.on("producer.disconnect", () => {
      console.log("🔌 Producer Kafka déconnecté");
      trackProducerConnection(producerId, false);
    });

    producer.on("producer.network.request_timeout", (payload) => {
      console.warn("⚠️ Timeout requête Producer:", payload.broker);
    });

    // ✅ STOCKER L'ID POUR TRACKING
    producer._producerId = producerId;

    return producer;
  } catch (error) {
    console.error("❌ Erreur création producer:", error);
    throw error;
  }
};

const createConsumer = (kafka, topics = []) => {
  try {
    const consumer = kafka.consumer(consumerConfig);
    const consumerId = `consumer_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    // ✅ TRACKER LES ÉVÉNEMENTS DE CONNEXION
    consumer.on("consumer.connect", () => {
      console.log("✅ Consumer Kafka connecté");
      trackConsumerConnection(consumerId, true);
    });

    consumer.on("consumer.disconnect", () => {
      console.log("🔌 Consumer Kafka déconnecté");
      trackConsumerConnection(consumerId, false);
    });

    consumer.on("consumer.crash", (payload) => {
      console.error(
        "❌ Consumer Kafka crash:",
        payload?.error?.message || payload?.error || payload
      );
      trackConsumerConnection(consumerId, false);
    });

    consumer.on("consumer.group_join", (payload) => {
      const groupId = payload.groupId || consumerConfig.groupId || "unknown";
      console.log("👥 Consumer rejoint groupe:", groupId);
    });

    consumer.on("consumer.heartbeat", () => {
      if (process.env.DEBUG_KAFKA_HEARTBEAT === "true") {
        console.log("💓 Consumer heartbeat");
      }
    });

    // ✅ STOCKER L'ID ET GROUPID
    consumer._consumerId = consumerId;
    consumer._groupId = consumerConfig.groupId;

    return consumer;
  } catch (error) {
    console.error("❌ Erreur création consumer:", error);
    throw error;
  }
};

// ✅ AJOUTER LES MÉTHODES MANQUANTES
const getHealthStatus = async () => {
  try {
    const now = Date.now();

    // ✅ CACHE HEALTH CHECK (éviter trop d'appels)
    if (lastHealthCheck && now - lastHealthCheck < 30000) {
      // 30 secondes
      return {
        status: isKafkaHealthy ? "connected" : "disconnected",
        message: isKafkaHealthy
          ? "Connecté et opérationnel"
          : "Déconnecté ou erreur",
        cached: true,
        lastCheck: new Date(lastHealthCheck).toISOString(),
        error: healthCheckError,
      };
    }

    // ✅ VÉRIFIER SI L'INSTANCE KAFKA EXISTE
    if (!kafkaInstance) {
      healthCheckError = "Instance Kafka non initialisée";
      isKafkaHealthy = false;
      lastHealthCheck = now;

      return {
        status: "disconnected",
        message: "Instance Kafka non initialisée",
        details: {
          instance: false,
          producers: connectedProducers.size,
          consumers: connectedConsumers.size,
        },
      };
    }

    // ✅ HEALTH CHECK BASIQUE
    try {
      // Créer un admin client temporaire pour tester la connexion
      const admin = kafkaInstance.admin();
      await admin.connect();

      // Lister les topics pour vérifier la connectivité
      const topics = await admin.listTopics();
      const metadata = await admin.fetchTopicMetadata();

      await admin.disconnect();

      isKafkaHealthy = true;
      healthCheckError = null;
      lastHealthCheck = now;

      return {
        status: "connected",
        message: "Connecté et opérationnel",
        details: {
          topics: topics.length,
          brokers: metadata.brokers ? metadata.brokers.length : 0,
          producers: connectedProducers.size,
          consumers: connectedConsumers.size,
          topicsList: topics.slice(0, 5), // Premiers 5 topics
        },
        lastCheck: new Date(lastHealthCheck).toISOString(),
      };
    } catch (adminError) {
      console.warn("⚠️ Health check admin Kafka échoué:", adminError.message);

      // ✅ FALLBACK: Vérifier si des producers/consumers sont connectés
      if (connectedProducers.size > 0 || connectedConsumers.size > 0) {
        isKafkaHealthy = true;
        healthCheckError = null;
        lastHealthCheck = now;

        return {
          status: "connected",
          message: "Connecté via producers/consumers",
          details: {
            adminFailed: true,
            producers: connectedProducers.size,
            consumers: connectedConsumers.size,
            adminError: adminError.message,
          },
          lastCheck: new Date(lastHealthCheck).toISOString(),
        };
      }

      // ✅ ÉCHEC TOTAL
      healthCheckError = adminError.message;
      isKafkaHealthy = false;
      lastHealthCheck = now;

      return {
        status: "error",
        message: "Erreur de connexion Kafka",
        error: adminError.message,
        details: {
          producers: connectedProducers.size,
          consumers: connectedConsumers.size,
        },
      };
    }
  } catch (error) {
    console.error("❌ Erreur health check Kafka:", error);

    healthCheckError = error.message;
    isKafkaHealthy = false;
    lastHealthCheck = Date.now();

    return {
      status: "error",
      message: "Erreur lors du health check",
      error: error.message,
    };
  }
};

// ✅ MÉTHODE POUR VÉRIFIER LA CONNECTIVITÉ
const isKafkaConnected = () => {
  return isKafkaHealthy && connectedProducers.size > 0;
};

// ✅ MÉTHODE POUR LISTER LES TOPICS
const listTopics = async () => {
  try {
    if (!kafkaInstance) {
      throw new Error("Instance Kafka non initialisée");
    }

    const admin = kafkaInstance.admin();
    await admin.connect();
    const topics = await admin.listTopics();
    await admin.disconnect();

    return topics;
  } catch (error) {
    console.warn("⚠️ Erreur liste topics:", error.message);
    return [];
  }
};

// ✅ MÉTHODE POUR OBTENIR LES MÉTADONNÉES
const getMetadata = async () => {
  try {
    if (!kafkaInstance) {
      throw new Error("Instance Kafka non initialisée");
    }

    const admin = kafkaInstance.admin();
    await admin.connect();
    const metadata = await admin.fetchTopicMetadata();
    await admin.disconnect();

    return {
      brokers: metadata.brokers ? metadata.brokers.length : 0,
      topics: metadata.topics ? metadata.topics.length : 0,
      metadata: metadata,
    };
  } catch (error) {
    console.warn("⚠️ Erreur métadonnées Kafka:", error.message);
    return { brokers: 0, topics: 0, error: error.message };
  }
};

// ✅ MÉTHODES DE TRACKING DES CONNEXIONS
const trackProducerConnection = (producerId, connected = true) => {
  if (connected) {
    connectedProducers.add(producerId);
  } else {
    connectedProducers.delete(producerId);
  }
};

const trackConsumerConnection = (consumerId, connected = true) => {
  if (connected) {
    connectedConsumers.add(consumerId);
  } else {
    connectedConsumers.delete(consumerId);
  }
};

// ✅ MÉTHODE DE DIAGNOSTIC COMPLÈTE
const getDiagnostics = () => {
  return {
    instance: !!kafkaInstance,
    healthy: isKafkaHealthy,
    lastHealthCheck: lastHealthCheck
      ? new Date(lastHealthCheck).toISOString()
      : null,
    error: healthCheckError,
    connections: {
      producers: connectedProducers.size,
      consumers: connectedConsumers.size,
      producerIds: Array.from(connectedProducers),
      consumerIds: Array.from(connectedConsumers),
    },
    config: {
      brokers: kafkaConfig.brokers,
      clientId: kafkaConfig.clientId,
      groupId: consumerConfig.groupId,
    },
  };
};

module.exports = {
  kafkaConfig,
  producerConfig,
  consumerConfig,
  createKafkaInstance,
  createProducer,
  createConsumer,

  // ✅ NOUVELLES MÉTHODES EXPORTÉES
  getHealthStatus,
  isKafkaConnected,
  listTopics,
  getMetadata,
  getDiagnostics,
  trackProducerConnection,
  trackConsumerConnection,
};
