class MessageProducer {
  constructor(producer) {
    this.producer = producer;
    this.isEnabled = !!producer;
    this.topicName = "chat.messages";
    this.silentHealthChecks = process.env.KAFKA_SILENT_HEALTH === "true"; // ✅ NOUVEAU

    if (this.isEnabled) {
      console.log(
        `✅ MessageProducer initialisé pour topic: ${this.topicName}`
      );
    } else {
      console.warn("⚠️ MessageProducer initialisé sans producer Kafka");
    }
  }

  // ✅ HEALTH CHECK SILENCIEUX
  async healthCheck(silent = false) {
    if (!this.isEnabled) {
      return { status: "disabled", message: "Producer Kafka non initialisé" };
    }

    try {
      // ✅ MODE SILENCIEUX POUR LES CHECKS AUTOMATIQUES
      const testResult = await this.publishMessage({
        eventType: "HEALTH_CHECK",
        source: "MessageProducer",
        test: "true",
        silent: silent || this.silentHealthChecks, // ✅ PARAMÈTRE SILENT
      });

      return {
        status: testResult ? "healthy" : "degraded",
        message: testResult ? "Producer opérationnel" : "Erreur lors du test",
        topic: this.topicName,
        lastTest: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "error",
        message: error.message,
        topic: this.topicName,
        lastTest: new Date().toISOString(),
      };
    }
  }

  // ✅ ALTERNATIVE : HEALTH CHECK SANS MESSAGE
  async healthCheckAdmin() {
    if (!this.isEnabled) {
      return { status: "disabled", message: "Producer Kafka non initialisé" };
    }

    try {
      // ✅ UTILISER ADMIN CLIENT POUR VÉRIFIER LA CONNECTIVITÉ
      const admin = this.producer.admin ? this.producer.admin() : null;

      if (admin) {
        const metadata = await admin.fetchTopicMetadata([this.topicName]);
        await admin.disconnect();

        return {
          status: "healthy",
          message: "Connectivité Kafka vérifiée via admin",
          topic: this.topicName,
          lastTest: new Date().toISOString(),
          metadata: {
            partitions: metadata.topics[0]?.partitions?.length || 0,
          },
        };
      } else {
        // Fallback au test par message
        return this.healthCheck(true); // Mode silencieux
      }
    } catch (error) {
      return {
        status: "error",
        message: error.message,
        topic: this.topicName,
        lastTest: new Date().toISOString(),
      };
    }
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
        publishedAt: new Date().toISOString(), // ISO string dans le payload
        producerId: process.env.SERVER_ID || "chat-file-1",
        version: "1.0.0",
      };

      // ✅ GÉNÉRER CLÉ ET VALEUR COMPATIBLES KAFKA
      const messageKey = this.generateMessageKey(sanitizedData);
      const messageValue = JSON.stringify(payload);

      // ✅ TIMESTAMP NUMÉRIQUE POUR KAFKA (CRUCIAL!)
      const kafkaTimestamp = Date.now(); // Timestamp numérique en millisecondes

      // Publier le message avec timestamp correct
      const result = await this.producer.send({
        topic: this.topicName,
        messages: [
          {
            partition: sanitizedData.conversationId
              ? this.getPartitionForConversation(sanitizedData.conversationId)
              : 0,
            key: messageKey, // String
            value: messageValue, // String JSON
            timestamp: kafkaTimestamp, // ✅ NUMÉRIQUE PAS STRING!
          },
        ],
      });

      // ✅ RESPECTER LE MODE SILENCIEUX
      if (!sanitizedData.silent && sanitizedData.eventType !== "HEALTH_CHECK") {
        const offsetInfo = result?.[0]?.offset || "unknown";
        console.log(
          `📤 Message publié sur Kafka: ${sanitizedData.eventType} (offset: ${offsetInfo})`
        );
      } else if (
        process.env.NODE_ENV === "development" &&
        sanitizedData.eventType === "HEALTH_CHECK"
      ) {
        console.log(`💚 Health check Kafka silencieux: OK`);
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

      return false;
    }
  }

  /**
   * ✅ FONCTION AMÉLIORÉE: CONVERTIR TOUS LES TYPES INCOMPATIBLES AVEC KAFKA
   */
  sanitizeDataForKafka(data) {
    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        sanitized[key] = "";
      } else if (typeof value === "number") {
        // Convertir les nombres en strings
        sanitized[key] = value.toString();
      } else if (typeof value === "boolean") {
        sanitized[key] = value.toString();
      } else if (value instanceof Date) {
        // ✅ DATES EN ISO STRING
        sanitized[key] = value.toISOString();
      } else if (typeof value === "object") {
        // Objets et arrays en JSON string
        sanitized[key] = JSON.stringify(value);
      } else {
        // Strings et autres types compatibles
        sanitized[key] = String(value);
      }
    }

    return sanitized;
  }

  /**
   * Générer une clé de message appropriée (toujours string)
   */
  generateMessageKey(data) {
    // Priorité : conversationId > userId > eventType
    if (data.conversationId) {
      return `conv_${data.conversationId}`;
    } else if (data.userId) {
      return `user_${data.userId}`;
    } else {
      return `event_${data.eventType}_${Date.now()}`;
    }
  }

  // Méthode pour déterminer la partition basée sur l'ID de conversation
  getPartitionForConversation(conversationId) {
    if (!conversationId) return 0;

    // Convertir en string si nécessaire
    const convId = String(conversationId);

    // Simple hash pour distribuer les conversations sur les partitions
    let hash = 0;
    for (let i = 0; i < convId.length; i++) {
      const char = convId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Retourner une partition entre 0 et 2 (assumant 3 partitions max)
    return Math.abs(hash) % 3;
  }

  // ✅ PUBLIER UN ÉVÉNEMENT SIMPLE AVEC TIMESTAMP CORRECT
  async publishSimpleMessage(eventType, data = {}) {
    return this.publishMessage({
      eventType,
      ...data,
      // ✅ NE PAS AJOUTER timestamp ICI - il sera géré automatiquement
    });
  }

  // ✅ PUBLIER STATUT MESSAGE AVEC TIMESTAMP CORRECT
  async publishMessageStatus(messageId, status, additionalData = {}) {
    return this.publishMessage({
      eventType: "MESSAGE_STATUS_UPDATED",
      messageId: String(messageId), // Force string
      status: String(status),
      ...additionalData,
      // ✅ PAS DE timestamp manuel
    });
  }

  // ✅ PUBLIER ÉVÉNEMENT CONVERSATION AVEC TIMESTAMP CORRECT
  async publishConversationEvent(
    eventType,
    conversationId,
    userId,
    additionalData = {}
  ) {
    return this.publishMessage({
      eventType,
      conversationId: String(conversationId), // Force string
      userId: String(userId), // Force string
      ...additionalData,
      // ✅ PAS DE timestamp manuel
    });
  }

  // ✅ PUBLIER ÉVÉNEMENT UTILISATEUR AVEC TIMESTAMP CORRECT
  async publishUserEvent(eventType, userId, additionalData = {}) {
    return this.publishMessage({
      eventType,
      userId: String(userId), // Force string
      ...additionalData,
      // ✅ PAS DE timestamp manuel
    });
  }

  // Fermer le producer
  async close() {
    if (this.producer) {
      try {
        await this.producer.disconnect();
        console.log("✅ MessageProducer fermé proprement");
      } catch (error) {
        console.error("❌ Erreur fermeture MessageProducer:", error.message);
      }
    }
  }
}

module.exports = MessageProducer;
