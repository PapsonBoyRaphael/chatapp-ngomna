const { Kafka } = require("kafkajs");

class KafkaConfig {
  constructor() {
    this.kafka = null;
    this.producer = null;
    this.consumer = null;
    this.admin = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 3;
    this.isDev = process.env.NODE_ENV !== "production";
    this.enableKafka = process.env.ENABLE_KAFKA !== "false";

    // Configuration Kafka
    this.kafkaConfig = {
      clientId: "chat-file-service",
      brokers: [process.env.KAFKA_BROKERS || "localhost:9092"],
      retry: {
        initialRetryTime: this.isDev ? 100 : 300,
        retries: this.isDev ? 3 : 8,
      },
      // Ajout de configuration pour éviter les erreurs de connexion
      connectionTimeout: this.isDev ? 3000 : 10000,
      requestTimeout: this.isDev ? 5000 : 30000,
    };

    this.kafka = new Kafka(this.kafkaConfig);
  }

  async connect() {
    if (!this.enableKafka) {
      console.log("�� Kafka désactivé par configuration");
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
        // **AJOUT: Retry configuration pour éviter les erreurs**
        retry: {
          initialRetryTime: 100,
          retries: 3,
        },
      });

      // Configuration consumer optimisée
      this.consumer = this.kafka.consumer({
        groupId: `chat-file-service-${process.env.SERVER_ID || "default"}`,
        sessionTimeout: this.isDev ? 10000 : 30000,
        heartbeatInterval: this.isDev ? 3000 : 10000,
        retry: {
          initialRetryTime: 100,
          retries: 3,
        },
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
        `⚠️ Échec connexion Kafka (${this.connectionAttempts}/${this.maxConnectionAttempts}):`,
        error.message
      );

      if (this.connectionAttempts >= this.maxConnectionAttempts) {
        console.log("🔄 Mode développement sans Kafka activé");
      }

      return false;
    }
  }

  async connectAll() {
    await Promise.all([
      this.producer.connect(),
      this.consumer.connect(),
      this.admin.connect(),
    ]);
  }

  async createTopics() {
    if (!this.admin || !this.isConnected) return;

    try {
      const topics = [
        {
          topic: "chat.messages",
          numPartitions: 3,
          replicationFactor: 1,
          configEntries: [
            {
              name: "cleanup.policy",
              value: "delete"
            },
            {
              name: "retention.ms",
              value: "604800000" // 7 jours
            },
            {
              name: "segment.ms",
              value: "86400000" // 1 jour
            }
          ]
        },
        {
          topic: "chat.files",
          numPartitions: 2,
          replicationFactor: 1,
          configEntries: [
            {
              name: "cleanup.policy",
              value: "delete"
            },
            {
              name: "retention.ms",
              value: "2592000000" // 30 jours
            }
          ]
        },
        {
          topic: "chat.notifications",
          numPartitions: 1,
          replicationFactor: 1,
          configEntries: [
            {
              name: "cleanup.policy",
              value: "delete"
            },
            {
              name: "retention.ms",
              value: "86400000" // 1 jour
            }
          ]
        },
      ];

      // **CORRECTION: Gestion d'erreur plus robuste pour la création de topics**
      const existingTopics = await this.admin.listTopics();
      const topicsToCreate = topics.filter(t => !existingTopics.includes(t.topic));

      if (topicsToCreate.length > 0) {
        try {
          await this.admin.createTopics({
            topics: topicsToCreate,
            waitForLeaders: true,
            timeout: 5000,
          });
          console.log(`✅ Topics Kafka créés: ${topicsToCreate.map(t => t.topic).join(', ')}`);
        } catch (createError) {
          // Ignorer l'erreur si les topics existent déjà
          if (createError.message.includes('already exists') || 
              createError.message.includes('TopicExistsException')) {
            console.log("✅ Topics Kafka déjà existants (OK)");
          } else {
            console.warn("⚠️ Erreur création topics (non critique):", createError.message);
          }
        }
      } else {
        console.log("✅ Tous les topics Kafka existent déjà");
      }

      console.log("✅ Topics Kafka créés/vérifiés (DEV)");
    } catch (error) {
      console.warn("⚠️ Impossible de créer les topics:", error.message);
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
    if (!this.isConnected) return;

    try {
      await Promise.all([
        this.producer?.disconnect(),
        this.consumer?.disconnect(),
        this.admin?.disconnect(),
      ]);
      this.isConnected = false;
      console.log("✅ Kafka déconnecté proprement");
    } catch (error) {
      console.warn("⚠️ Erreur déconnexion Kafka:", error.message);
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
        console.log("�� Topics Kafka disponibles:", topicNames);
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
