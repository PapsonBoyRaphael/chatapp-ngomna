class ConversationController {
  constructor(
    getConversationsUseCase,
    getConversationUseCase,
    redisClient = null,
    cacheService = null,
    searchOccurrencesUseCase = null
  ) {
    this.getConversationsUseCase = getConversationsUseCase;
    this.getConversationUseCase = getConversationUseCase;
    this.redisClient = redisClient;
    this.searchOccurrencesUseCase = searchOccurrencesUseCase;
  }

  // ✅ MÉTHODE PRINCIPALE POUR RÉCUPÉRER LES CONVERSATIONS (SANS CACHE CONTROLLER)
  async getConversations(req, res) {
    const startTime = Date.now();

    try {
      const userId = req.user?.id || req.user?.userId || req.headers["user-id"];
      const {
        page = 1,
        limit = 20,
        includeArchived = false,
        cursor = null,
        direction = "newer",
      } = req.query;

      console.log(
        `🔍 getConversations: userId=${userId}, page=${page}, limit=${limit}, cursor=${cursor}`
      );

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "ID utilisateur requis",
          code: "MISSING_USER_ID",
        });
      }

      // Validation des paramètres
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(Math.max(1, parseInt(limit)), 50);

      if (isNaN(pageNum) || isNaN(limitNum)) {
        return res.status(400).json({
          success: false,
          message:
            "Les paramètres 'page' et 'limit' doivent être des nombres valides",
          code: "INVALID_PAGINATION_PARAMS",
        });
      }

      // ✅ DIRECTEMENT APPELER LE USE CASE (il gère le cache via les repositories)
      const result = await this.getConversationsUseCase.execute(userId, {
        page: pageNum,
        limit: limitNum,
        includeArchived: includeArchived === "true",
        cursor,
        direction,
        useCache: !cursor, // Cache seulement première page
      });

      const processingTime = Date.now() - startTime;

      // ✅ HEADERS BASÉS SUR LA RÉPONSE DU REPOSITORY
      res.set({
        "X-Cache": result.fromCache ? "HIT" : "MISS",
        "Cache-Control": cursor ? "no-cache" : "public, max-age=300",
        "X-Load-Source": result.fromCache ? "cache" : "database",
        "X-Cursor": cursor || "none",
      });

      const response = {
        success: true,
        message: `Page ${pageNum} des conversations récupérée avec succès`,
        data: {
          conversations: result.conversations || [],
          totalCount: result.totalCount || 0,
          totalUnreadMessages: result.totalUnreadMessages || 0,
          unreadConversations: result.unreadConversations || 0,
          fromCache: result.fromCache || false,
          nextCursor: result.nextCursor || null,
          hasMore: result.hasMore || false,
        },
        metadata: {
          userId: userId,
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
          pagination: result.pagination || {
            currentPage: pageNum,
            totalPages: 0,
            totalCount: 0,
            hasNext: false,
            hasPrevious: false,
            limit: limitNum,
            offset: (pageNum - 1) * limitNum,
          },
        },
      };

      console.log(
        `✅ Page ${pageNum}: ${
          result.conversations?.length || 0
        } conversation(s) récupérée(s) (${result.fromCache ? "cache" : "db"})`
      );

      res.json(response);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur getConversations:", error);

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

  // ✅ RÉCUPÉRER UNE CONVERSATION SPÉCIFIQUE (SANS CACHE CONTROLLER)
  async getConversation(req, res) {
    const startTime = Date.now();

    try {
      const { conversationId } = req.params;
      const userId = req.user?.id || req.user?.userId || req.headers["user-id"];

      console.log(
        `🔍 getConversation: conversationId=${conversationId}, userId=${userId}`
      );

      if (!conversationId) {
        return res.status(400).json({
          success: false,
          message: "ID de conversation requis",
          code: "MISSING_CONVERSATION_ID",
        });
      }

      // ✅ DIRECTEMENT APPELER LE USE CASE (il gère le cache via les repositories)
      const result = await this.getConversationUseCase.execute(conversationId, {
        userId: userId,
        useCache: true, // Le repository décide du cache
      });

      const processingTime = Date.now() - startTime;

      // ✅ HEADERS BASÉS SUR LA RÉPONSE DU REPOSITORY
      res.set({
        "X-Cache": result.fromCache ? "HIT" : "MISS",
        "Cache-Control": "public, max-age=300",
        "X-Load-Source": result.fromCache ? "cache" : "database",
      });

      res.json({
        success: true,
        data: result.conversation || result,
        metadata: {
          processingTime: `${processingTime}ms`,
          fromCache: result.fromCache || false,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur getConversation:", error);

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

  // ✅ CRÉER UNE NOUVELLE CONVERSATION (SANS CACHE CONTROLLER)
  async createConversation(req, res) {
    const startTime = Date.now();

    try {
      const { participantId, name } = req.body;
      const userId = req.user?.id || req.user?.userId || req.headers["user-id"];

      if (!participantId) {
        return res.status(400).json({
          success: false,
          message: "ID du participant requis",
          code: "MISSING_PARTICIPANT_ID",
        });
      }

      // ✅ ICI VOUS POUVEZ AJOUTER UN USE CASE CreateConversation
      // const result = await this.createConversationUseCase.execute({
      //   userId,
      //   participantId,
      //   name
      // });

      // Pour l'instant, simulation
      const conversation = {
        id: `conv_${Date.now()}`,
        name: name || `Conversation avec ${participantId}`,
        type: "PRIVATE",
        participants: [userId, participantId],
        createdAt: new Date().toISOString(),
        lastMessage: null,
        unreadCount: 0,
      };

      const processingTime = Date.now() - startTime;

      res.status(201).json({
        success: true,
        data: conversation,
        message: "Conversation créée avec succès",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur createConversation:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors de la création de la conversation",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "CREATE_CONVERSATION_FAILED",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // ✅ MARQUER UNE CONVERSATION COMME LUE (SANS CACHE CONTROLLER)
  async markAsRead(req, res) {
    const startTime = Date.now();

    try {
      const { conversationId } = req.params;
      const userId = req.user?.id || req.user?.userId || req.headers["user-id"];

      if (!conversationId || !userId) {
        return res.status(400).json({
          success: false,
          message: "ID conversation et utilisateur requis",
          code: "MISSING_PARAMS",
        });
      }

      // ✅ ICI VOUS POUVEZ AJOUTER UN USE CASE MarkConversationAsRead
      // const result = await this.markAsReadUseCase.execute(conversationId, userId);

      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        message: "Conversation marquée comme lue",
        data: {
          conversationId: conversationId,
          userId: userId,
          markedAt: new Date().toISOString(),
        },
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur markAsRead:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors du marquage comme lu",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "MARK_READ_FAILED",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // ✅ VERSION INTERNE POUR WEBSOCKET (sans cache controller)
  async getConversationsInternal(userId, options = {}) {
    const { page = 1, limit = 20, includeArchived = false } = options;

    try {
      // ✅ APPEL DIRECT AU USE CASE (qui gère le cache)
      return await this.getConversationsUseCase.execute(userId, {
        page: Math.max(1, parseInt(page)),
        limit: Math.min(parseInt(limit), 50),
        includeArchived,
        useCache: page === 1, // Cache seulement première page
      });
    } catch (error) {
      console.error("❌ Erreur getConversationsInternal:", error);
      throw error;
    }
  }

  async getConversationInternal(conversationId, userId, options = {}) {
    try {
      // ✅ APPEL DIRECT AU USE CASE (qui gère le cache)
      return await this.getConversationUseCase.execute(conversationId, {
        userId,
        useCache: true, // Le repository décide du cache
      });
    } catch (error) {
      console.error("❌ Erreur getConversationInternal:", error);
      throw error;
    }
  }

  // ✅ RECHERCHER DES OCCURRENCES (inchangé)
  async searchOccurrences(req, res) {
    const startTime = Date.now();
    try {
      const {
        query,
        page = 1,
        limit = 20,
        useLike = true,
        scope = "conversations",
      } = req.query;
      const userId = req.user?.id || req.headers["user-id"];

      if (!query || query.length < 2) {
        return res.status(400).json({
          success: false,
          message:
            "Le mot-clé de recherche doit contenir au moins 2 caractères",
          code: "INVALID_QUERY",
        });
      }

      const result = await this.searchOccurrencesUseCase.execute(query, {
        userId,
        page: parseInt(page),
        limit: parseInt(limit),
        useLike,
        scope,
      });

      res.json({
        success: true,
        data: result,
        metadata: {
          processingTime: `${Date.now() - startTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur lors de la recherche globale",
        error: error.message,
      });
    }
  }
}

module.exports = ConversationController;
