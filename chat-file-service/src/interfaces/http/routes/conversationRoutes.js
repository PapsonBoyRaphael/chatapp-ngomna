const express = require("express");
const router = express.Router();

// Middleware
const {
  authMiddleware,
  rateLimitMiddleware,
  validationMiddleware,
} = require("../middleware");

function createConversationRoutes(conversationController) {
  // ✅ VÉRIFIER QUE LE CONTROLLER EXISTE
  if (!conversationController) {
    console.error("❌ ConversationController manquant");
    router.all("*", (req, res) => {
      res.status(503).json({
        success: false,
        message: "Service de conversations non disponible",
        error: "ConversationController non initialisé",
      });
    });
    return router;
  }

  // ✅ VÉRIFIER LES MÉTHODES REQUISES
  const requiredMethods = [
    "getConversations",
    "getConversation",
    "createConversation",
    "markAsRead",
  ];
  const missingMethods = requiredMethods.filter(
    (method) => typeof conversationController[method] !== "function"
  );

  if (missingMethods.length > 0) {
    console.error(
      `❌ Méthodes manquantes dans ConversationController: ${missingMethods.join(
        ", "
      )}`
    );
    router.all("*", (req, res) => {
      res.status(503).json({
        success: false,
        message: "Service de conversations incomplet",
        error: `Méthodes manquantes: ${missingMethods.join(", ")}`,
      });
    });
    return router;
  }

  // Routes des conversations avec gestion d'erreurs
  try {
    /**
     * @api {get} /conversations?limit=20&cursor=2024-01-15T10:30:00.000Z Get User Conversations
     * @apiName GetConversations
     * @apiGroup Conversations
     */
    router.get(
      "/",
      authMiddleware.authenticate,
      rateLimitMiddleware.apiLimit,
      async (req, res) => {
        try {
          // Récupérer les paramètres de pagination
          const { limit, cursor, page } = req.query;

          // Valider les paramètres
          const paginationParams = {
            limit: Math.min(parseInt(limit) || 20, 50), // Max 50 par requête
            cursor: cursor || null,
            page: parseInt(page) || 1,
          };

          // Ajouter les paramètres à la requête
          req.pagination = paginationParams;

          await conversationController.getConversations(req, res);
        } catch (error) {
          console.error("❌ Erreur route GET /conversations:", error);
          res.status(500).json({
            success: false,
            message: "Erreur lors de la récupération des conversations",
            error:
              process.env.NODE_ENV === "development"
                ? error.message
                : "Erreur interne",
          });
        }
      }
    );

    /**
     * @api {get} /conversations/:conversationId Get Conversation
     * @apiName GetConversation
     * @apiGroup Conversations
     */
    router.get(
      "/:conversationId",
      authMiddleware.authenticate,
      rateLimitMiddleware.apiLimit,
      validationMiddleware.validateMongoId("conversationId"),
      async (req, res) => {
        try {
          await conversationController.getConversation(req, res);
        } catch (error) {
          console.error("❌ Erreur route GET /conversations/:id:", error);
          res.status(500).json({
            success: false,
            message: "Erreur lors de la récupération de la conversation",
            error:
              process.env.NODE_ENV === "development"
                ? error.message
                : "Erreur interne",
          });
        }
      }
    );

    /**
     * @api {post} /conversations Create Conversation
     * @apiName CreateConversation
     * @apiGroup Conversations
     */
    router.post(
      "/",
      authMiddleware.authenticate,
      rateLimitMiddleware.createLimit,
      validationMiddleware.sanitizeInput,
      validationMiddleware.validateConversationCreation,
      async (req, res) => {
        try {
          await conversationController.createConversation(req, res);
        } catch (error) {
          console.error("❌ Erreur route POST /conversations:", error);
          res.status(500).json({
            success: false,
            message: "Erreur lors de la création de la conversation",
            error:
              process.env.NODE_ENV === "development"
                ? error.message
                : "Erreur interne",
          });
        }
      }
    );

    /**
     * @api {put} /conversations/:conversationId/read Mark as Read
     * @apiName MarkConversationAsRead
     * @apiGroup Conversations
     */
    router.put(
      "/:conversationId/read",
      authMiddleware.authenticate,
      rateLimitMiddleware.apiLimit,
      validationMiddleware.validateMongoId("conversationId"),
      async (req, res) => {
        try {
          await conversationController.markAsRead(req, res);
        } catch (error) {
          console.error("❌ Erreur route PUT /conversations/:id/read:", error);
          res.status(500).json({
            success: false,
            message: "Erreur lors du marquage comme lu",
            error:
              process.env.NODE_ENV === "development"
                ? error.message
                : "Erreur interne",
          });
        }
      }
    );

    /**
     * @api {get} /conversations/search Recherche globale messages/fichiers/conversations/groups/broadcast
     * @apiName SearchOccurrences
     * @apiGroup Conversations
     */
    router.get(
      "/search",
      authMiddleware.authenticate,
      rateLimitMiddleware.apiLimit,
      validationMiddleware.sanitizeInput,
      async (req, res) => {
        try {
          await conversationController.searchOccurrences(req, res);
        } catch (error) {
          console.error("❌ Erreur route GET /conversations/search:", error);
          res.status(500).json({
            success: false,
            message: "Erreur lors de la recherche globale",
            error: error.message,
          });
        }
      }
    );

    console.log("✅ Routes conversations configurées");
  } catch (error) {
    console.error("❌ Erreur configuration routes conversations:", error);
    router.all("*", (req, res) => {
      res.status(500).json({
        success: false,
        message: "Erreur de configuration des routes conversations",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
      });
    });
  }

  return router;
}

module.exports = createConversationRoutes;
