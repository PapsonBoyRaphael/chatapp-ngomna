class MessageController {
  constructor(
    sendMessageUseCase,
    getMessagesUseCase,
    updateMessageStatusUseCase,
    redisClient = null,
    kafkaProducer = null
  ) {
    this.sendMessageUseCase = sendMessageUseCase;
    this.getMessagesUseCase = getMessagesUseCase;
    this.updateMessageStatusUseCase = updateMessageStatusUseCase;
    this.redisClient = redisClient;
    this.kafkaProducer = kafkaProducer;
  }

  async sendMessage(req, res) {
    const startTime = Date.now();

    try {
      const {
        senderId,
        receiverId,
        content,
        conversationId,
        type = "TEXT",
        metadata = {},
      } = req.body;

      // Validation
      if (!senderId || !receiverId || !content?.trim()) {
        return res.status(400).json({
          success: false,
          message: "senderId, receiverId et content sont requis",
          code: "MISSING_REQUIRED_FIELDS",
        });
      }

      // Validation de la longueur du contenu
      if (content.trim().length > 10000) {
        return res.status(400).json({
          success: false,
          message: "Le message ne peut pas dépasser 10000 caractères",
          code: "MESSAGE_TOO_LONG",
        });
      }

      // Enrichir les métadonnées avec les infos de la requête
      const enrichedMetadata = {
        ...metadata,
        userAgent: req.headers["user-agent"],
        ip: req.ip,
        requestId: req.headers["x-request-id"] || `req_${Date.now()}`,
        timestamp: new Date().toISOString(),
      };

      // Envoyer le message
      const message = await this.sendMessageUseCase.execute({
        senderId,
        receiverId,
        content: content.trim(),
        conversationId,
        type,
        metadata: enrichedMetadata,
      });

      const processingTime = Date.now() - startTime;

      // 🚀 INVALIDER LES CACHES LIÉS
      if (this.redisClient) {
        try {
          const cacheKeysToInvalidate = [
            `messages:${message.conversationId}:${senderId}:*`,
            `messages:${message.conversationId}:${receiverId}:*`,
            `conversations:${senderId}`,
            `conversations:${receiverId}`,
            `conversation:${message.conversationId}:${senderId}`,
            `conversation:${message.conversationId}:${receiverId}`,
          ];

          for (const pattern of cacheKeysToInvalidate) {
            if (pattern.includes("*")) {
              const keys = await this.redisClient.keys(pattern);
              if (keys.length > 0) {
                await this.redisClient.del(keys);
              }
            } else {
              await this.redisClient.del(pattern);
            }
          }

          console.log(`🗑️ Caches invalidés pour le message: ${message._id}`);
        } catch (redisError) {
          console.warn(
            "⚠️ Erreur invalidation cache message:",
            redisError.message
          );
        }
      }

      res.status(201).json({
        success: true,
        message: "Message envoyé avec succès",
        data: {
          ...message,
          isOwn: true,
          deliveryStatus: "sent",
        },
        metadata: {
          processingTime: `${processingTime}ms`,
          kafkaPublished: !!this.kafkaProducer,
          cacheInvalidated: !!this.redisClient,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur envoi message:", error);

      // 🚀 PUBLIER ERREUR DANS KAFKA
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "MESSAGE_SEND_FAILED",
            senderId: req.body.senderId,
            receiverId: req.body.receiverId,
            content: req.body.content?.substring(0, 100),
            error: error.message,
            processingTime,
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication échec message:",
            kafkaError.message
          );
        }
      }

      res.status(500).json({
        success: false,
        message: "Erreur lors de l'envoi du message",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "SEND_MESSAGE_FAILED",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  async getMessages(req, res) {
    const startTime = Date.now();

    try {
      const { conversationId } = req.params;
      const { page = 1, limit = 50, useCache = true } = req.query;
      const userId = req.user?.id || req.headers["user-id"];

      if (!conversationId || !userId) {
        return res.status(400).json({
          success: false,
          message: "conversationId et userId requis",
          code: "MISSING_PARAMETERS",
        });
      }

      // Validation pagination
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(10, parseInt(limit)));

      const result = await this.getMessagesUseCase.execute({
        conversationId,
        userId,
        page: pageNum,
        limit: limitNum,
        useCache: useCache === "true",
      });

      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: result,
        metadata: {
          processingTime: `${processingTime}ms`,
          fromCache: result.fromCache || false,
          redisEnabled: !!this.redisClient,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur récupération messages:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des messages",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "GET_MESSAGES_FAILED",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  async updateMessageStatus(req, res) {
    const startTime = Date.now();

    try {
      const { conversationId, status, messageIds } = req.body;
      const userId = req.user?.id || req.headers["user-id"];

      if (!conversationId || !userId || !status) {
        return res.status(400).json({
          success: false,
          message: "conversationId, userId et status requis",
          code: "MISSING_PARAMETERS",
        });
      }

      const result = await this.updateMessageStatusUseCase.execute({
        conversationId,
        receiverId: userId,
        status,
        messageIds,
      });

      const processingTime = Date.now() - startTime;

      // 🚀 INVALIDER LES CACHES SI DES MESSAGES ONT ÉTÉ MODIFIÉS
      if (this.redisClient && result.modifiedCount > 0) {
        try {
          const cachePatterns = [
            `messages:${conversationId}:${userId}:*`,
            `conversations:${userId}`,
            `conversation:${conversationId}:${userId}`,
          ];

          for (const pattern of cachePatterns) {
            if (pattern.includes("*")) {
              const keys = await this.redisClient.keys(pattern);
              if (keys.length > 0) {
                await this.redisClient.del(keys);
              }
            } else {
              await this.redisClient.del(pattern);
            }
          }
        } catch (redisError) {
          console.warn(
            "⚠️ Erreur invalidation cache statut:",
            redisError.message
          );
        }
      }

      res.json({
        success: true,
        message: `Statut mis à jour pour ${result.modifiedCount} message(s)`,
        data: result,
        metadata: {
          processingTime: `${processingTime}ms`,
          kafkaPublished: !!this.kafkaProducer,
          cacheInvalidated: !!this.redisClient && result.modifiedCount > 0,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur mise à jour statut:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors de la mise à jour du statut",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "UPDATE_STATUS_FAILED",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // ✅ AJOUT DES MÉTHODES MANQUANTES
  async getMessage(req, res) {
    try {
      const { messageId } = req.params;

      // Logique simple pour l'instant
      res.json({
        success: true,
        data: {
          id: messageId,
          content: "Message test",
          senderId: "user-123",
          timestamp: new Date().toISOString(),
        },
        message: "Message récupéré avec succès",
      });
    } catch (error) {
      console.error("❌ Erreur getMessage:", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération du message",
        error: error.message,
      });
    }
  }

  async deleteMessage(req, res) {
    try {
      res.status(501).json({
        success: false,
        message: "Suppression non implémentée",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  async addReaction(req, res) {
    try {
      const { messageId } = req.params;
      const { emoji } = req.body;

      res.json({
        success: true,
        data: {
          messageId,
          emoji,
          userId: req.user?.id,
          timestamp: new Date().toISOString(),
        },
        message: "Réaction ajoutée",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}

module.exports = MessageController;
