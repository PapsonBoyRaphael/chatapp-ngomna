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
      const userId = req.user?.id || req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié",
        });
      }

      console.log(`🔍 Conversations utilisateur: ${userId} (début)`);

      // **CONVERSION EXPLICITE POUR ÉVITER LES ERREURS KAFKA**
      const userIdString = String(userId);

      const result = await this.getConversationsUseCase.execute(
        userIdString,
        true
      );
      const processingTime = Date.now() - startTime;

      console.log(
        `🔍 Conversations utilisateur: ${userId} (${result.conversations.length} conv, ${processingTime}ms)`
      );

      // **PUBLIER ÉVÉNEMENT KAFKA AVEC DONNÉES CONVERTIES**
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "CONVERSATIONS_RETRIEVED",
            userId: userIdString,
            conversationsCount: result.conversations.length,
            processingTime,
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
      const userId = req.user?.id || req.user?.userId;

      if (!userId || !conversationId) {
        return res.status(400).json({
          success: false,
          message: "Paramètres manquants",
        });
      }

      // **CONVERSIONS EXPLICITES**
      const userIdString = String(userId);
      const conversationIdString = String(conversationId);

      const result = await this.getConversationUseCase.execute(
        conversationIdString,
        userIdString,
        true
      );

      const processingTime = Date.now() - startTime;

      // **PUBLIER ÉVÉNEMENT KAFKA AVEC DONNÉES CONVERTIES**
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "CONVERSATION_VIEWED",
            userId: userIdString, // **STRING**
            conversationId: conversationIdString, // **STRING**
            unreadCount: String(result.unreadCount || 0), // **CONVERSION**
            messageCount: String(result.messageCount || 0), // **CONVERSION**
            processingTime: String(processingTime), // **CONVERSION**
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

      if (error.message === "Conversation non trouvée") {
        return res.status(404).json({
          success: false,
          message: "Conversation non trouvée",
        });
      }

      if (error.message === "Accès non autorisé à cette conversation") {
        return res.status(403).json({
          success: false,
          message: "Accès non autorisé",
        });
      }

      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération de la conversation",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  async createConversation(req, res) {
    const startTime = Date.now();

    try {
      const userId = req.user?.id || req.user?.userId;
      const { participants, type = "private", name } = req.body;

      if (!userId || !participants || !Array.isArray(participants)) {
        return res.status(400).json({
          success: false,
          message: "Données de conversation invalides",
        });
      }

      // **CONVERSIONS EXPLICITES**
      const userIdString = String(userId);
      const participantsStrings = participants.map((p) => String(p));

      // Ajouter l'utilisateur actuel aux participants s'il n'y est pas
      if (!participantsStrings.includes(userIdString)) {
        participantsStrings.push(userIdString);
      }

      // TODO: Implémenter CreateConversation use case
      res.status(501).json({
        success: false,
        message: "Fonctionnalité en cours de développement",
        metadata: {
          processingTime: `${Date.now() - startTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur création conversation:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors de la création de la conversation",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
}

module.exports = ConversationController;
