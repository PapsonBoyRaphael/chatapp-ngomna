/**
 * Notification Consumer - Chat File Service
 * Consumer pour traiter les notifications
 */

class NotificationConsumer {
  constructor(consumer) {
    this.consumer = consumer;
    this.isEnabled = !!consumer;
    this.isRunning = false;
    this.isConnected = false;
    this.topicName = "chat.notifications";
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;

    if (this.isEnabled) {
      this.setupEventListeners();
      console.log(
        `✅ NotificationConsumer initialisé pour topic: ${this.topicName}`
      );
    } else {
      console.warn("⚠️ NotificationConsumer initialisé sans consumer Kafka");
    }
  }

  // ✅ CONFIGURATION DES LISTENERS D'ÉVÉNEMENTS CORRIGÉE
  setupEventListeners() {
    if (!this.consumer) return;

    this.consumer.on("consumer.connect", () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log("✅ NotificationConsumer connecté à Kafka");
    });

    this.consumer.on("consumer.disconnect", () => {
      this.isConnected = false;
      console.log("🔌 NotificationConsumer déconnecté de Kafka");

      if (this.isRunning) {
        this.scheduleReconnect();
      }
    });

    this.consumer.on("consumer.crash", (payload) => {
      console.error("❌ NotificationConsumer crash:", payload.error.message);
      this.isConnected = false;

      if (this.isRunning) {
        this.scheduleReconnect();
      }
    });

    this.consumer.on("consumer.group_join", (payload) => {
      // ✅ CORRECTION: Récupérer le groupId de plusieurs sources
      const groupId =
        payload.groupId ||
        this.consumer._groupId ||
        this.consumer.groupId ||
        (this.consumer.options && this.consumer.options.groupId) ||
        "unknown";
      console.log("👥 NotificationConsumer rejoint groupe:", groupId);
    });

    this.consumer.on("consumer.heartbeat", () => {
      // ✅ MASQUER LES HEARTBEATS SAUF EN DEBUG
      if (process.env.DEBUG_KAFKA_HEARTBEAT === "true") {
        console.log("💓 NotificationConsumer heartbeat");
      }
    });

    this.consumer.on("consumer.network.request_timeout", (payload) => {
      console.warn("⚠️ Timeout NotificationConsumer:", payload.broker);
    });
  }

  // ✅ PLANIFIER UNE RECONNEXION
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("❌ Nombre maximum de tentatives de reconnexion atteint");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(
      `🔄 Reconnexion consumer dans ${delay}ms (tentative ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(async () => {
      try {
        console.log("🔄 Tentative de reconnexion consumer...");
        await this.start();
      } catch (error) {
        console.error("❌ Échec reconnexion consumer:", error.message);
      }
    }, delay);
  }

  async start() {
    if (!this.isEnabled) {
      console.warn("⚠️ Tentative de démarrage sans consumer Kafka actif");
      return false;
    }

    if (this.isRunning) {
      console.log("⚠️ NotificationConsumer déjà en cours d'exécution");
      return true;
    }

    try {
      console.log("🚀 Démarrage NotificationConsumer...");

      // ✅ CONNEXION AVEC RETRY ET TIMEOUT
      if (!this.isConnected) {
        const connectPromise = this.consumer.connect();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Connection timeout")), 15000)
        );

        await Promise.race([connectPromise, timeoutPromise]);
      }

      // ✅ SUBSCRIPTION AU TOPIC AVEC VÉRIFICATION
      await this.consumer.subscribe({
        topic: this.topicName,
        fromBeginning: false,
      });

      // ✅ DÉMARRER LE CONSUMER AVEC CONFIGURATION OPTIMISÉE
      await this.consumer.run({
        autoCommit: true,
        autoCommitInterval: 5000,
        autoCommitThreshold: 100,
        eachMessage: async ({
          topic,
          partition,
          message,
          heartbeat,
          pause,
        }) => {
          try {
            // ✅ HEARTBEAT IMMÉDIAT
            await heartbeat();

            const messageValue = message.value?.toString();
            if (!messageValue) {
              console.warn("⚠️ Message vide reçu");
              return;
            }

            const parsedMessage = JSON.parse(messageValue);

            // ✅ TRAITEMENT DU MESSAGE
            await this.processMessage(parsedMessage, {
              topic,
              partition,
              offset: message.offset,
              timestamp: message.timestamp,
              headers: message.headers,
            });

            // ✅ HEARTBEAT APRÈS TRAITEMENT
            await heartbeat();
          } catch (error) {
            console.error(
              "❌ Erreur traitement message NotificationConsumer:",
              error
            );

            // ✅ GESTION DES ERREURS RÉSEAU
            if (
              error.message.includes("timeout") ||
              error.message.includes("connection") ||
              error.message.includes("coordinator")
            ) {
              console.log(
                "⏸️ Pause temporaire du consumer due à une erreur réseau"
              );
              pause();

              setTimeout(() => {
                console.log("▶️ Reprise du consumer");
                this.consumer.resume([{ topic, partitions: [partition] }]);
              }, 10000);
            }
          }
        },
      });

      this.isRunning = true;
      this.reconnectAttempts = 0;
      console.log("✅ NotificationConsumer démarré avec succès");
      return true;
    } catch (error) {
      console.error("❌ Erreur démarrage NotificationConsumer:", error);
      this.isRunning = false;
      this.isConnected = false;

      this.scheduleReconnect();
      return false;
    }
  }

  // ✅ TRAITEMENT DES MESSAGES AMÉLIORÉ
  async processMessage(message, metadata) {
    try {
      const { eventType, ...data } = message;

      if (process.env.NODE_ENV === "development") {
        console.log(`📨 Notification reçue: ${eventType}`, {
          topic: metadata.topic,
          partition: metadata.partition,
          offset: metadata.offset,
        });
      }

      // ✅ TRAITEMENT SELON LE TYPE D'ÉVÉNEMENT
      switch (eventType) {
        case "USER_CONNECTED":
          await this.handleUserConnected(data);
          break;
        case "USER_DISCONNECTED":
          await this.handleUserDisconnected(data);
          break;
        case "MESSAGE_SENT":
          await this.handleMessageSent(data);
          break;
        case "CONVERSATION_CREATED":
          await this.handleConversationCreated(data);
          break;
        case "FILE_UPLOADED":
          await this.handleFileUploaded(data);
          break;
        case "HEALTH_CHECK":
          // Ignorer les health checks
          break;
        default:
          console.log(`📨 Événement non géré: ${eventType}`);
      }
    } catch (error) {
      console.error("❌ Erreur processMessage:", error);
      throw error; // Re-throw pour gestion niveau supérieur
    }
  }

  // ✅ HANDLERS POUR CHAQUE TYPE D'ÉVÉNEMENT
  async handleUserConnected(data) {
    try {
      console.log(`👤 Utilisateur connecté: ${data.matricule || data.userId}`);
      // Logique spécifique pour connexion utilisateur
    } catch (error) {
      console.error("❌ Erreur handleUserConnected:", error);
    }
  }

  async handleUserDisconnected(data) {
    try {
      console.log(
        `👋 Utilisateur déconnecté: ${data.matricule || data.userId}`
      );
      // Logique spécifique pour déconnexion utilisateur
    } catch (error) {
      console.error("❌ Erreur handleUserDisconnected:", error);
    }
  }

  async handleMessageSent(data) {
    try {
      console.log(
        `💬 Message envoyé: ${data.senderId} → ${data.conversationId}`
      );
      // Logique spécifique pour message envoyé
    } catch (error) {
      console.error("❌ Erreur handleMessageSent:", error);
    }
  }

  async handleConversationCreated(data) {
    try {
      console.log(`🆕 Conversation créée: ${data.conversationId}`);
      // Logique spécifique pour nouvelle conversation
    } catch (error) {
      console.error("❌ Erreur handleConversationCreated:", error);
    }
  }

  async handleFileUploaded(data) {
    try {
      console.log(`📁 Fichier uploadé: ${data.fileName}`);
      // Logique spécifique pour upload fichier
    } catch (error) {
      console.error("❌ Erreur handleFileUploaded:", error);
    }
  }

  // ✅ ARRÊT PROPRE
  async stop() {
    if (!this.isEnabled || !this.isRunning) {
      return;
    }

    try {
      this.isRunning = false;
      await this.consumer.stop();
      await this.consumer.disconnect();
      this.isConnected = false;
      console.log("✅ NotificationConsumer arrêté proprement");
    } catch (error) {
      console.error("❌ Erreur arrêt NotificationConsumer:", error);
    }
  }

  // ✅ HEALTH CHECK
  getStatus() {
    return {
      isEnabled: this.isEnabled,
      isRunning: this.isRunning,
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      topic: this.topicName,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = NotificationConsumer;
