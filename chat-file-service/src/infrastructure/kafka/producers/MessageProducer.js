class MessageProducer {
  constructor(producer) {
    this.producer = producer;
    this.isEnabled = !!producer;
    this.topicName = "chat.messages";
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;

    if (this.isEnabled) {
      this.setupEventListeners();
      console.log(
        `✅ MessageProducer initialisé pour topic: ${this.topicName}`
      );
    } else {
      console.warn("⚠️ MessageProducer initialisé sans producer Kafka");
    }
  }

  // ✅ AJOUTER GESTION DES ÉVÉNEMENTS
  setupEventListeners() {
    if (!this.producer) return;

    this.producer.on("producer.connect", () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log("✅ MessageProducer connecté à Kafka");
    });

    this.producer.on("producer.disconnect", () => {
      this.isConnected = false;
      console.log("🔌 MessageProducer déconnecté de Kafka");
    });

    this.producer.on("producer.network.request_timeout", (payload) => {
      console.warn("⚠️ Timeout MessageProducer:", payload.broker);
    });
  }

  // ✅ MÉTHODE DE RECONNEXION
  async ensureConnected() {
    if (!this.producer) return false;

    if (
      !this.isConnected &&
      this.reconnectAttempts < this.maxReconnectAttempts
    ) {
      try {
        console.log(
          `🔄 Tentative reconnexion MessageProducer (${
            this.reconnectAttempts + 1
          }/${this.maxReconnectAttempts})`
        );
        await this.producer.connect();
        this.isConnected = true;
        this.reconnectAttempts = 0;
        return true;
      } catch (error) {
        this.reconnectAttempts++;
        console.warn(`⚠️ Échec reconnexion MessageProducer: ${error.message}`);
        return false;
      }
    }

    return this.isConnected;
  }

  async publishMessage(messageData) {
    if (!this.isEnabled) {
      console.warn("⚠️ Tentative de publication sans producer Kafka actif");
      return false;
    }

    if (!messageData) {
      console.error("❌ MessageProducer: Données de message manquantes");
      return false;
    }

    // ✅ VÉRIFIER LA CONNEXION AVANT D'ENVOYER
    const connected = await this.ensureConnected();
    if (!connected) {
      console.warn("⚠️ MessageProducer: Impossible de se connecter à Kafka");
      return false;
    }

    try {
      // ✅ CONVERSION CORRECTE DES DONNÉES
      const sanitizedData = this.sanitizeDataForKafka(messageData);

      // Validation des données minimales
      const requiredFields = ["eventType"];
      const missingFields = requiredFields.filter(
        (field) => !sanitizedData[field]
      );

      if (missingFields.length > 0) {
        console.error(
          `❌ MessageProducer: Champs requis manquants: ${missingFields.join(
            ", "
          )}`
        );
        return false;
      }

      // ✅ PRÉPARER LE PAYLOAD AVEC TIMESTAMP CORRECT
      const payload = {
        ...sanitizedData,
        publishedAt: new Date().toISOString(),
        producerId: process.env.SERVER_ID || "chat-file-1",
        version: "1.0.0",
      };

      // ✅ GÉNÉRER CLÉ ET VALEUR COMPATIBLES KAFKA
      const messageKey = this.generateMessageKey(sanitizedData);
      const messageValue = JSON.stringify(payload);

      // ✅ TIMESTAMP NUMÉRIQUE POUR KAFKA
      const kafkaTimestamp = Date.now();

      // ✅ PUBLIER AVEC CONFIGURATION AMÉLIORÉE
      const result = await this.producer.send({
        topic: this.topicName,
        messages: [
          {
            partition: sanitizedData.conversationId
              ? this.getPartitionForConversation(sanitizedData.conversationId)
              : 0,
            key: messageKey,
            value: messageValue,
            timestamp: kafkaTimestamp,
            headers: {
              "content-type": "application/json",
              "producer-id": process.env.SERVER_ID || "chat-file-1",
              "event-type": sanitizedData.eventType,
              "correlation-id": this.generateCorrelationId(),
            },
          },
        ],
        // ✅ CONFIGURATION SPÉCIFIQUE À L'ENVOI
        acks: 1, // Attendre confirmation du leader
        timeout: 30000,
      });

      // ✅ EXTRACTION AMÉLIORÉE DES OFFSETS
      let offsetInfo = "unknown";
      let partitionInfo = "unknown";

      if (result && Array.isArray(result) && result.length > 0) {
        const recordMetadata = result[0];
        if (recordMetadata) {
          offsetInfo = recordMetadata.offset?.toString() || "pending";
          partitionInfo = recordMetadata.partition?.toString() || "0";

          // ✅ LOGGING DÉTAILLÉ EN MODE DEV
          if (
            process.env.NODE_ENV === "development" &&
            sanitizedData.eventType !== "HEALTH_CHECK"
          ) {
            console.log(
              `📤 Message publié sur Kafka: ${sanitizedData.eventType}`
            );
            console.log(`   📊 Topic: ${this.topicName}`);
            console.log(`   📍 Partition: ${partitionInfo}`);
            console.log(`   🔗 Offset: ${offsetInfo}`);
            console.log(`   🔑 Key: ${messageKey}`);
          } else if (sanitizedData.eventType !== "HEALTH_CHECK") {
            console.log(
              `📤 Kafka: ${sanitizedData.eventType} → partition:${partitionInfo} offset:${offsetInfo}`
            );
          }
        }
      }

      return true;
    } catch (error) {
      console.error("❌ Erreur publication Kafka:", error.message);

      // Log plus détaillé en mode développement
      if (process.env.NODE_ENV === "development") {
        console.error("🔍 Détails erreur Kafka:", error);
        console.error(
          "🔍 Données tentative:",
          JSON.stringify(messageData, null, 2)
        );
      }

      // ✅ MARQUER COMME DÉCONNECTÉ EN CAS D'ERREUR RÉSEAU
      if (
        error.message.includes("Connection") ||
        error.message.includes("timeout")
      ) {
        this.isConnected = false;
      }

      return false;
    }
  }

  // ✅ GÉNÉRER UN ID DE CORRÉLATION UNIQUE
  generateCorrelationId() {
    return `${
      process.env.SERVER_ID || "chat-file"
    }-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ✅ MÉTHODES EXISTANTES INCHANGÉES
  sanitizeDataForKafka(data) {
    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        sanitized[key] = "";
      } else if (typeof value === "number") {
        sanitized[key] = value.toString();
      } else if (typeof value === "boolean") {
        sanitized[key] = value.toString();
      } else if (value instanceof Date) {
        sanitized[key] = value.toISOString();
      } else if (typeof value === "object") {
        sanitized[key] = JSON.stringify(value);
      } else {
        sanitized[key] = String(value);
      }
    }

    return sanitized;
  }

  generateMessageKey(data) {
    if (data.conversationId) {
      return `conv_${data.conversationId}`;
    } else if (data.userId) {
      return `user_${data.userId}`;
    } else {
      return `event_${data.eventType}_${Date.now()}`;
    }
  }

  getPartitionForConversation(conversationId) {
    if (!conversationId) return 0;

    const convId = String(conversationId);
    let hash = 0;
    for (let i = 0; i < convId.length; i++) {
      const char = convId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    return Math.abs(hash) % 3;
  }

  // ✅ HEALTH CHECK AMÉLIORÉ
  async healthCheck(silent = false) {
    if (!this.isEnabled) {
      return { status: "disabled", message: "Producer Kafka non initialisé" };
    }

    try {
      const connected = await this.ensureConnected();
      if (!connected) {
        return { status: "disconnected", message: "Producer non connecté" };
      }

      const testResult = await this.publishMessage({
        eventType: "HEALTH_CHECK",
        source: "MessageProducer",
        test: "true",
        silent: true,
      });

      return {
        status: testResult ? "healthy" : "degraded",
        message: testResult ? "Producer opérationnel" : "Erreur lors du test",
        topic: this.topicName,
        connected: this.isConnected,
        reconnectAttempts: this.reconnectAttempts,
        lastTest: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "error",
        message: error.message,
        topic: this.topicName,
        connected: this.isConnected,
        lastTest: new Date().toISOString(),
      };
    }
  }

  // ✅ FERMER PROPREMENT
  async close() {
    if (this.producer) {
      try {
        await this.producer.disconnect();
        this.isConnected = false;
        console.log("✅ MessageProducer fermé proprement");
      } catch (error) {
        console.error("❌ Erreur fermeture MessageProducer:", error.message);
      }
    }
  }
}

module.exports = MessageProducer;
