/**
 * File Producer - Chat File Service
 * Producer Kafka pour les fichiers
 */

const { v4: uuidv4 } = require("uuid");

class FileProducer {
  constructor(producer) {
    this.producer = producer;
    this.isEnabled = !!producer;
    this.topicName = "chat.files";
    this.isConnected = false;

    if (this.isEnabled) {
      console.log("✅ FileProducer initialisé avec topic:", this.topicName);
    } else {
      console.warn("⚠️ FileProducer initialisé sans producer Kafka");
    }
  }

  // ✅ AJOUTER LA MÉTHODE publishMessage MANQUANTE
  async publishMessage(messageData) {
    if (!this.isEnabled) {
      console.warn("⚠️ FileProducer: Producer Kafka non activé");
      return false;
    }

    if (!this.producer) {
      console.warn("⚠️ FileProducer: Producer Kafka non disponible");
      return false;
    }

    try {
      // ✅ SANITISER LES DONNÉES
      const sanitizedData = this.sanitizeDataForKafka(messageData);

      // ✅ CONSTRUIRE LE MESSAGE KAFKA
      const kafkaMessage = {
        topic: this.topicName,
        messages: [
          {
            key: sanitizedData.fileId || `file_${Date.now()}`,
            value: JSON.stringify(sanitizedData),
            timestamp: Date.now(),
            headers: {
              "content-type": "application/json",
              "event-type": sanitizedData.eventType || "FILE_EVENT",
              "correlation-id": uuidv4(),
              producer: "FileProducer",
            },
          },
        ],
        acks: 1,
        timeout: 30000,
      };

      const result = await this.producer.send(kafkaMessage);

      if (result && result.length > 0) {
        console.log(`📤 FileProducer: ${sanitizedData.eventType} publié`);
        return true;
      } else {
        console.warn("⚠️ FileProducer: Aucun résultat reçu");
        return false;
      }
    } catch (error) {
      console.error("❌ Erreur FileProducer.publishMessage:", error.message);
      return false;
    }
  }

  // ✅ MÉTHODE UTILITAIRE POUR SANITISER LES DONNÉES
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

  async publishFileUpload(file, message) {
    try {
      if (!this.producer) {
        if (this.isDevMode) {
          console.log("📤 [DEV] Fichier publié (mode local):", {
            fileName: file.originalName,
            size: file.size,
          });
          return true;
        }
        throw new Error("Producer Kafka non disponible");
      }

      const kafkaMessage = {
        topic: "chat.files",
        messages: [
          {
            key: file.conversationId,
            value: JSON.stringify({
              fileId: file._id,
              messageId: message._id,
              conversationId: file.conversationId,
              uploadedBy: file.uploadedBy,
              originalName: file.originalName,
              fileName: file.fileName,
              mimeType: file.mimeType,
              size: file.size,
              url: file.url,
              metadata: file.metadata,
              // ✅ TIMESTAMP ISO DANS LE PAYLOAD SEULEMENT
              uploadedAt: file.createdAt
                ? file.createdAt.toISOString()
                : new Date().toISOString(),
            }),
            headers: {
              service: "chat-file-service",
              "event-type": "file.uploaded",
              "correlation-id": uuidv4(),
            },
            // ✅ TIMESTAMP NUMÉRIQUE POUR KAFKA
            timestamp: Date.now(),
          },
        ],
      };

      await this.producer.send(kafkaMessage);
      console.log(`📤 Upload fichier publié: ${file.originalName}`);
    } catch (error) {
      if (this.isDevMode) {
        console.warn(
          "⚠️ Kafka indisponible, mode développement:",
          error.message
        );
      } else {
        console.error("❌ Erreur publication fichier:", error);
        throw error;
      }
    }
  }

  async publishFileDownload(fileId, userId) {
    try {
      if (!this.producer) {
        if (this.isDevMode) {
          console.log(`📤 [DEV] Téléchargement publié (mode local): ${fileId}`);
          return true;
        }
        throw new Error("Producer Kafka non disponible");
      }

      const kafkaMessage = {
        topic: "chat.events",
        messages: [
          {
            key: fileId,
            value: JSON.stringify({
              fileId,
              userId,
              action: "download",
              // ✅ TIMESTAMP ISO DANS LE PAYLOAD
              downloadedAt: new Date().toISOString(),
            }),
            headers: {
              service: "chat-file-service",
              "event-type": "file.downloaded",
              "correlation-id": uuidv4(),
            },
            // ✅ TIMESTAMP NUMÉRIQUE POUR KAFKA
            timestamp: Date.now(),
          },
        ],
      };

      await this.producer.send(kafkaMessage);
      console.log(`📤 Téléchargement fichier publié: ${fileId}`);
    } catch (error) {
      if (this.isDevMode) {
        console.warn(
          "⚠️ Kafka indisponible, mode développement:",
          error.message
        );
      } else {
        console.error("❌ Erreur publication téléchargement:", error);
      }
    }
  }
}

module.exports = FileProducer;
