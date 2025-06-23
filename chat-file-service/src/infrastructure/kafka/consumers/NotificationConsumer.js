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
    this.maxReconnectAttempts = 3; // ✅ RÉDUIRE
    this.reconnectDelay = 10000; // ✅ AUGMENTER

    // ✅ NOUVEAUX PARAMÈTRES ANTI-REBALANCE
    this.heartbeatInterval = null;
    this.isRebalancing = false;
    this.lastHeartbeat = Date.now();
    this.maxProcessingTime = 25000; // ✅ LIMITE TRAITEMENT MESSAGE

    if (this.isEnabled) {
      this.setupEventListeners();
      console.log(
        `✅ NotificationConsumer initialisé pour topic: ${this.topicName}`
      );
    } else {
      console.warn("⚠️ NotificationConsumer initialisé sans consumer Kafka");
    }
  }

  setupEventListeners() {
    if (!this.consumer) return;

    this.consumer.on("consumer.connect", () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.isRebalancing = false;
      console.log("✅ NotificationConsumer connecté à Kafka");
    });

    this.consumer.on("consumer.disconnect", () => {
      this.isConnected = false;
      this.isRebalancing = false;
      console.log("🔌 NotificationConsumer déconnecté de Kafka");

      if (this.isRunning) {
        this.scheduleReconnect();
      }
    });

    // ✅ GESTION SPÉCIFIQUE DU REBALANCING
    this.consumer.on("consumer.group_join", (payload) => {
      this.isRebalancing = false;
      const groupId = payload.groupId || this.consumer._groupId || "unknown";
      console.log("👥 NotificationConsumer rejoint groupe:", groupId);
    });

    // ✅ DÉTECTER LE DÉBUT DU REBALANCING
    this.consumer.on("consumer.rebalancing", () => {
      this.isRebalancing = true;
      console.log("⚖️ Rebalancing en cours...");
    });

    this.consumer.on("consumer.crash", (payload) => {
      console.error("❌ NotificationConsumer crash:", payload.error.message);
      this.isConnected = false;
      this.isRebalancing = false;

      // ✅ ATTENDRE AVANT DE RECONNECTER EN CAS DE CRASH
      setTimeout(() => {
        if (this.isRunning) {
          this.scheduleReconnect();
        }
      }, 5000);
    });

    // ✅ HEARTBEAT INTELLIGENT
    this.consumer.on("consumer.heartbeat", () => {
      this.lastHeartbeat = Date.now();
      if (process.env.DEBUG_KAFKA_HEARTBEAT === "true") {
        console.log("💓 NotificationConsumer heartbeat");
      }
    });

    this.consumer.on("consumer.network.request_timeout", (payload) => {
      console.warn("⚠️ Timeout NotificationConsumer:", payload.broker);
    });
  }

  // ✅ RECONNEXION AVEC BACKOFF EXPONENTIEL
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("❌ Nombre maximum de tentatives de reconnexion atteint");
      this.isRunning = false;
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      60000
    ); // ✅ BACKOFF EXPONENTIEL PLAFONNÉ

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

      // ✅ CONNEXION AVEC TIMEOUT PLUS LONG
      if (!this.isConnected) {
        const connectPromise = this.consumer.connect();
        const timeoutPromise = new Promise(
          (_, reject) =>
            setTimeout(() => reject(new Error("Connection timeout")), 30000) // ✅ 30s au lieu de 15s
        );

        await Promise.race([connectPromise, timeoutPromise]);
      }

      // ✅ ATTENDRE LA FIN D'UN ÉVENTUEL REBALANCING
      let rebalanceWait = 0;
      while (this.isRebalancing && rebalanceWait < 30000) {
        console.log("⚖️ Attente fin rebalancing...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        rebalanceWait += 1000;
      }

      // ✅ SUBSCRIPTION AU TOPIC
      await this.consumer.subscribe({
        topic: this.topicName,
        fromBeginning: false,
      });

      console.log(`📨 Abonné au topic: ${this.topicName}`);

      // ✅ DÉMARRER AVEC CONFIGURATION ANTI-REBALANCE
      await this.consumer.run({
        autoCommit: true,
        autoCommitInterval: 10000, // ✅ AUGMENTER
        autoCommitThreshold: 50, // ✅ RÉDUIRE
        partitionsConsumedConcurrently: 1, // ✅ LIMITER CONCURRENCE
        eachMessage: async ({
          topic,
          partition,
          message,
          heartbeat,
          pause,
        }) => {
          const processingStart = Date.now();

          try {
            // ✅ HEARTBEAT IMMÉDIAT SI PROCHE DE LA LIMITE
            const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
            if (timeSinceLastHeartbeat > 10000) {
              // 10s
              await heartbeat();
            }

            const messageValue = message.value?.toString();
            if (!messageValue) {
              console.warn("⚠️ Message vide reçu");
              return;
            }

            const parsedMessage = JSON.parse(messageValue);

            // ✅ TRAITEMENT AVEC TIMEOUT
            const processingPromise = this.processMessage(parsedMessage, {
              topic,
              partition,
              offset: message.offset,
              timestamp: message.timestamp,
              headers: message.headers,
            });

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Message processing timeout")),
                this.maxProcessingTime
              )
            );

            await Promise.race([processingPromise, timeoutPromise]);

            // ✅ HEARTBEAT APRÈS TRAITEMENT
            const processingTime = Date.now() - processingStart;
            if (processingTime > 5000) {
              // Si traitement > 5s
              await heartbeat();
            }
          } catch (error) {
            console.error(
              "❌ Erreur traitement message NotificationConsumer:",
              error.message
            );

            // ✅ GESTION SPÉCIFIQUE DES ERREURS DE REBALANCING
            if (
              error.message.includes("rebalancing") ||
              error.message.includes("rejoin")
            ) {
              console.log("⚖️ Rebalancing détecté, pause temporaire");
              this.isRebalancing = true;

              // ✅ NE PAS PAUSER PENDANT UN REBALANCING
              return;
            }

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
              }, 15000); // ✅ AUGMENTER LE DÉLAI
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

      // ✅ DÉLAI AVANT RETRY EN CAS D'ERREUR DE DÉMARRAGE
      setTimeout(() => {
        this.scheduleReconnect();
      }, 5000);

      return false;
    }
  }

  // ✅ TRAITEMENT OPTIMISÉ DES MESSAGES
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

      // ✅ TRAITEMENT RAPIDE SELON LE TYPE
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
          // ✅ IGNORER SILENCIEUSEMENT LES HEALTH CHECKS
          break;
        default:
          if (process.env.NODE_ENV === "development") {
            console.log(`📨 Événement non géré: ${eventType}`);
          }
      }
    } catch (error) {
      console.error("❌ Erreur processMessage:", error);
      throw error;
    }
  }

  // ✅ HANDLERS OPTIMISÉS (traitement rapide)
  async handleUserConnected(data) {
    try {
      console.log(`👤 Utilisateur connecté: ${data.matricule || data.userId}`);
      // ✅ Traitement minimal et rapide
    } catch (error) {
      console.error("❌ Erreur handleUserConnected:", error);
    }
  }

  async handleUserDisconnected(data) {
    try {
      console.log(
        `👋 Utilisateur déconnecté: ${data.matricule || data.userId}`
      );
      // ✅ Traitement minimal et rapide
    } catch (error) {
      console.error("❌ Erreur handleUserDisconnected:", error);
    }
  }

  async handleMessageSent(data) {
    try {
      console.log(
        `💬 Message envoyé: ${data.senderId} → ${data.conversationId}`
      );
      // ✅ Traitement minimal et rapide
    } catch (error) {
      console.error("❌ Erreur handleMessageSent:", error);
    }
  }

  async handleConversationCreated(data) {
    try {
      console.log(`🆕 Conversation créée: ${data.conversationId}`);
      // ✅ Traitement minimal et rapide
    } catch (error) {
      console.error("❌ Erreur handleConversationCreated:", error);
    }
  }

  async handleFileUploaded(data) {
    try {
      console.log(`📁 Fichier uploadé: ${data.fileName}`);
      // ✅ Traitement minimal et rapide
    } catch (error) {
      console.error("❌ Erreur handleFileUploaded:", error);
    }
  }

  // ✅ ARRÊT PROPRE AMÉLIORÉ
  async stop() {
    if (!this.isEnabled || !this.isRunning) {
      return;
    }

    try {
      console.log("🛑 Arrêt NotificationConsumer...");
      this.isRunning = false;

      // ✅ ARRÊTER LE CONSUMER PROPREMENT
      if (this.consumer) {
        await this.consumer.stop();
        await this.consumer.disconnect();
      }

      this.isConnected = false;
      this.isRebalancing = false;
      console.log("✅ NotificationConsumer arrêté proprement");
    } catch (error) {
      console.error("❌ Erreur arrêt NotificationConsumer:", error);
    }
  }

  getStatus() {
    return {
      isEnabled: this.isEnabled,
      isRunning: this.isRunning,
      isConnected: this.isConnected,
      isRebalancing: this.isRebalancing,
      reconnectAttempts: this.reconnectAttempts,
      topic: this.topicName,
      lastHeartbeat: new Date(this.lastHeartbeat).toISOString(),
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = NotificationConsumer;
