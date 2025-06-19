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

      // ✅ NE PAS PUBLIER D'ÉVÉNEMENT KAFKA ICI - DÉJÀ FAIT DANS LE USE CASE
      // Le use case gère déjà la publication via le repository

      return res.json({
        success: true,
        message: "Conversations récupérées avec succès",
        data: result,
        metadata: {
          userId: userIdString,
          processingTime,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ Erreur récupération conversations: ${error.message}`);

      return res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des conversations",
        error: error.message,
        metadata: {
          processingTime,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  async getConversation(req, res) {
    try {
      const conversationId = req.params.id;
      const userId = req.user?.id || req.user?.userId;

      if (!conversationId) {
        return res.status(400).json({
          success: false,
          message: "ID de conversation requis",
        });
      }

      const result = await this.getConversationUseCase.execute(
        conversationId,
        userId
      );

      return res.json({
        success: true,
        message: "Conversation récupérée avec succès",
        data: result,
      });
    } catch (error) {
      console.error("❌ Erreur récupération conversation:", error);
      return res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération de la conversation",
        error: error.message,
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
