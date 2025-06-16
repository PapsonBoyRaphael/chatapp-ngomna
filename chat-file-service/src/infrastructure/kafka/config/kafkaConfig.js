/**
 * Kafka Configuration - Chat File Service
 * Configuration robuste avec fallback développement
 */

const { Kafka } = require("kafkajs");

class KafkaConfig {
  constructor() {
    this.isDev = process.env.NODE_ENV === "development";
    this.enableKafka = process.env.ENABLE_KAFKA !== "false";

    // Configuration adaptée à l'environnement
    const kafkaConfig = {
      clientId: process.env.KAFKA_CLIENT_ID || "chat-file-service",
      brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),

      // Timeouts optimisés pour développement
      connectionTimeout: this.isDev ? 5000 : 10000,
      authenticationTimeout: this.isDev ? 2000 : 5000,
      requestTimeout: this.isDev ? 15000 : 30000,

      retry: {
        initialRetryTime: this.isDev ? 100 : 300,
        retries: this.isDev ? 2 : 5,
        maxRetryTime: this.isDev ? 1000 : 30000,
      },

      // Logs adaptés
      logLevel: this.isDev ? 1 : 4, // WARN en dev, INFO en prod
    };

    this.kafka = new Kafka(kafkaConfig);
    this.producer = null;
    this.consumer = null;
    this.admin = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
  }

  async connect() {
    if (!this.enableKafka) {
      console.log("🔄 Kafka désactivé par configuration");
      return false;
    }

    // Limiter les tentatives de connexion
    if (this.connectionAttempts >= this.maxConnectionAttempts) {
      console.log("⚠️ Limite de tentatives Kafka atteinte, mode dégradé");
      return false;
    }

    this.connectionAttempts++;

    try {
      console.log(
        `🔄 Connexion Kafka (${this.isDev ? "DEV" : "PROD"}) - Tentative ${
          this.connectionAttempts
        }/${this.maxConnectionAttempts}...`
      );

      // Configuration producer optimisée
      this.producer = this.kafka.producer({
        maxInFlightRequests: this.isDev ? 1 : 5,
        idempotent: false, // Simplifier pour dev
        transactionTimeout: this.isDev ? 10000 : 30000,
        allowAutoTopicCreation: this.isDev,

        batch: {
          size: this.isDev ? 1000 : 16384,
          lingerMs: this.isDev ? 0 : 5,
        },
      });

      // Configuration consumer optimisée
      this.consumer = this.kafka.consumer({
        groupId: process.env.KAFKA_GROUP_ID || "chat-file-service-group",
        sessionTimeout: this.isDev ? 15000 : 30000,
        rebalanceTimeout: this.isDev ? 20000 : 60000,
        heartbeatInterval: this.isDev ? 3000 : 3000,
        allowAutoTopicCreation: this.isDev,

        maxBytesPerPartition: this.isDev ? 1024000 : 1048576,
        minBytes: this.isDev ? 1 : 1024,
        maxWaitTimeInMs: this.isDev ? 500 : 1000,
      });

      this.admin = this.kafka.admin();

      // Connexion avec timeout et gestion d'erreur robuste
      const connectTimeout = this.isDev ? 8000 : 15000;

      await Promise.race([
        this.connectAll(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Kafka connection timeout")),
            connectTimeout
          )
        ),
      ]);

      this.isConnected = true;
      this.connectionAttempts = 0; // Reset counter on success
      console.log("✅ Kafka connecté avec succès");

      // Créer les topics en arrière-plan
      setImmediate(() => {
        this.createTopics().catch((err) =>
          console.warn("⚠️ Erreur création topics (non bloquant):", err.message)
        );
      });

      return true;
    } catch (error) {
      console.warn(
        `⚠️ Kafka indisponible (tentative ${this.connectionAttempts}):`,
        error.message
      );

      if (this.isDev) {
        console.log("💡 Solutions pour démarrer Kafka:");
        console.log("   1. Script auto: ./start-kafka-dev.sh");
        console.log("   2. Manuel: voir instructions dans check-kafka.sh");
        console.log("   3. Désactiver: ENABLE_KAFKA=false dans .env");
      }

      return false;
    }
  }

  async connectAll() {
    // Connexion séquentielle pour éviter les conflits
    await this.admin.connect();
    await this.producer.connect();
    await this.consumer.connect();
  }

  async createTopics() {
    if (!this.admin || !this.isConnected) return;

    try {
      const baseConfig = {
        replicationFactor: 1,
        configEntries: this.isDev
          ? [
              { name: "cleanup.policy", value: "delete" },
              { name: "retention.ms", value: "3600000" }, // 1h en dev
              { name: "segment.ms", value: "300000" }, // 5min en dev
              { name: "min.insync.replicas", value: "1" },
            ]
          : [
              { name: "cleanup.policy", value: "compact" },
              { name: "retention.ms", value: "86400000" }, // 24h en prod
              { name: "segment.ms", value: "604800000" }, // 7j en prod
              { name: "min.insync.replicas", value: "1" },
            ],
      };

      const topics = [
        {
          topic: "chat.messages",
          numPartitions: this.isDev ? 1 : 3,
          ...baseConfig,
        },
        {
          topic: "chat.files",
          numPartitions: this.isDev ? 1 : 2,
          ...baseConfig,
        },
        {
          topic: "chat.notifications",
          numPartitions: this.isDev ? 1 : 2,
          configEntries: [
            { name: "cleanup.policy", value: "delete" },
            { name: "retention.ms", value: this.isDev ? "1800000" : "3600000" },
            { name: "min.insync.replicas", value: "1" },
          ],
        },
        {
          topic: "chat.events",
          numPartitions: 1,
          ...baseConfig,
        },
      ];

      await this.admin.createTopics({
        topics,
        waitForLeaders: true,
        timeout: 15000,
      });

      console.log(
        `✅ Topics Kafka créés/vérifiés (${this.isDev ? "DEV" : "PROD"})`
      );
    } catch (error) {
      if (error.type === "TOPIC_ALREADY_EXISTS") {
        console.log("ℹ️ Topics Kafka déjà existants");
      } else {
        console.warn("⚠️ Erreur création topics:", error.message);
      }
    }
  }

  getProducer() {
    return this.producer;
  }

  getConsumer() {
    return this.consumer;
  }

  getAdmin() {
    return this.admin;
  }

  isKafkaConnected() {
    return this.isConnected;
  }

  async disconnect() {
    try {
      if (this.producer) await this.producer.disconnect();
      if (this.consumer) await this.consumer.disconnect();
      if (this.admin) await this.admin.disconnect();
      this.isConnected = false;
      console.log("✅ Kafka déconnecté");
    } catch (error) {
      console.error("❌ Erreur déconnexion Kafka:", error);
    }
  }

  // Méthodes de monitoring pour développement
  async getHealthStatus() {
    if (!this.isConnected) return { status: "disconnected" };

    try {
      const metadata = await this.admin.fetchTopicMetadata();
      return {
        status: "connected",
        topics: metadata.topics.length,
        brokers: metadata.brokers.length,
      };
    } catch (error) {
      return { status: "error", error: error.message };
    }
  }

  async listTopics() {
    if (this.isDev && this.admin && this.isConnected) {
      try {
        const metadata = await this.admin.fetchTopicMetadata();
        const topicNames = metadata.topics.map((t) => t.name);
        console.log("📋 Topics Kafka disponibles:", topicNames);
        return topicNames;
      } catch (error) {
        console.warn("⚠️ Impossible de lister les topics:", error.message);
        return [];
      }
    }
    return [];
  }
}

module.exports = new KafkaConfig();
