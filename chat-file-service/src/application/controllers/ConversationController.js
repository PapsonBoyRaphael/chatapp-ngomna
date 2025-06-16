class ConversationController {
  constructor(
    getConversationsUseCase,
    getConversationUseCase,
    redisClient = null,
    kafkaProducer = null
  ) {
    this.getConversationsUseCase = getConversationsUseCase;
    this.getConversationUseCase = getConversationUseCase;
    this.redisClient = redisClient;
    this.kafkaProducer = kafkaProducer;
  }

  async getConversations(req, res) {
    const startTime = Date.now();

    try {
      const userId = req.user?.id || req.headers["user-id"];
      const { useCache = true } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié",
          code: "MISSING_USER_ID",
        });
      }

      const result = await this.getConversationsUseCase.execute(
        userId,
        useCache === "true"
      );

      const processingTime = Date.now() - startTime;

      // 🚀 PUBLIER CONSULTATION DANS KAFKA
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "CONVERSATIONS_VIEWED",
            userId,
            conversationCount: result.totalCount,
            unreadCount: result.totalUnreadMessages,
            fromCache: result.fromCache,
            processingTime,
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication consultation conversations:",
            kafkaError.message
          );
        }
      }

      res.json({
        success: true,
        data: result,
        metadata: {
          processingTime: `${processingTime}ms`,
          fromCache: result.fromCache || false,
          redisEnabled: !!this.redisClient,
          kafkaPublished: !!this.kafkaProducer,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur récupération conversations:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des conversations",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "GET_CONVERSATIONS_FAILED",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  async getConversation(req, res) {
    const startTime = Date.now();

    try {
      const { conversationId } = req.params;
      const userId = req.user?.id || req.headers["user-id"];
      const { useCache = true } = req.query;

      if (!conversationId || !userId) {
        return res.status(400).json({
          success: false,
          message: "conversationId et userId requis",
          code: "MISSING_PARAMETERS",
        });
      }

      const result = await this.getConversationUseCase.execute(
        conversationId,
        userId,
        useCache === "true"
      );

      const processingTime = Date.now() - startTime;

      // 🚀 PUBLIER CONSULTATION CONVERSATION DANS KAFKA
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "CONVERSATION_VIEWED",
            conversationId,
            userId,
            unreadCount: result.unreadCount,
            messageCount: result.messageCount,
            fromCache: result.fromCache,
            processingTime,
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication consultation conversation:",
            kafkaError.message
          );
        }
      }

      res.json({
        success: true,
        data: result,
        metadata: {
          processingTime: `${processingTime}ms`,
          fromCache: result.fromCache || false,
          redisEnabled: !!this.redisClient,
          kafkaPublished: !!this.kafkaProducer,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur récupération conversation:", error);

      if (error.message.includes("non trouvée")) {
        res.status(404).json({
          success: false,
          message: "Conversation non trouvée",
          code: "CONVERSATION_NOT_FOUND",
        });
      } else if (error.message.includes("non autorisé")) {
        res.status(403).json({
          success: false,
          message: "Accès non autorisé à cette conversation",
          code: "ACCESS_DENIED",
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Erreur lors de la récupération de la conversation",
          error:
            process.env.NODE_ENV === "development"
              ? error.message
              : "Erreur interne",
          code: "GET_CONVERSATION_FAILED",
          metadata: {
            processingTime: `${processingTime}ms`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }
  }

  async invalidateConversationCache(req, res) {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.id || req.headers["user-id"];

      if (!this.redisClient) {
        return res.status(501).json({
          success: false,
          message: "Redis non configuré",
          code: "REDIS_NOT_AVAILABLE",
        });
      }

      if (!conversationId) {
        return res.status(400).json({
          success: false,
          message: "conversationId requis",
          code: "MISSING_CONVERSATION_ID",
        });
      }

      // Invalider les caches liés à cette conversation
      const cachePatterns = [
        `conversation:${conversationId}:*`,
        `messages:${conversationId}:*`,
      ];

      if (userId) {
        cachePatterns.push(`conversations:${userId}`);
      }

      let totalKeysDeleted = 0;

      for (const pattern of cachePatterns) {
        try {
          if (pattern.includes("*")) {
            const keys = await this.redisClient.keys(pattern);
            if (keys.length > 0) {
              await this.redisClient.del(keys);
              totalKeysDeleted += keys.length;
            }
          } else {
            const deleted = await this.redisClient.del(pattern);
            totalKeysDeleted += deleted;
          }
        } catch (error) {
          console.warn(
            `⚠️ Erreur invalidation pattern ${pattern}:`,
            error.message
          );
        }
      }

      res.json({
        success: true,
        message: "Cache invalidé avec succès",
        data: {
          conversationId,
          keysDeleted: totalKeysDeleted,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("❌ Erreur invalidation cache conversation:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors de l'invalidation du cache",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "CACHE_INVALIDATION_FAILED",
      });
    }
  }
}

module.exports = ConversationController;
