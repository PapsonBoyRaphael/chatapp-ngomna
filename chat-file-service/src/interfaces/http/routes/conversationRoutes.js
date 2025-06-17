const express = require("express");
const {
  authMiddleware,
  rateLimitMiddleware,
  validationMiddleware,
  cacheMiddleware,
} = require("../middleware");

function createConversationRoutes(conversationController) {
  const router = express.Router();

  // **VALIDATION CRITIQUE : S'ASSURER QUE LE CONTRÔLEUR EXISTE**
  if (!conversationController) {
    console.error(
      "❌ ConversationController manquant dans createConversationRoutes"
    );
    router.all("*", (req, res) => {
      res.status(503).json({
        success: false,
        message: "Service de conversations temporairement indisponible",
        error: "ConversationController non initialisé",
      });
    });
    return router;
  }

  // **VALIDATION DES MÉTHODES DU CONTRÔLEUR**
  const requiredMethods = [
    "getConversations",
    "getConversation",
    "createConversation",
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

  try {
    /**
     * @api {get} /api/conversations Liste des conversations
     * @apiName GetConversations
     * @apiGroup Conversations
     */
    router.get(
      "/",
      authMiddleware.authenticate,
      rateLimitMiddleware.apiLimit,
      cacheMiddleware.checkConversationsCache,
      async (req, res) => {
        try {
          await conversationController.getConversations(req, res);
        } catch (error) {
          console.error("❌ Erreur route conversations:", error);
          res.status(500).json({
            success: false,
            message: "Erreur lors de la récupération des conversations",
            code: "GET_CONVERSATIONS_ROUTE_ERROR",
          });
        }
      }
    );

    /**
     * @api {get} /api/conversations/:conversationId Détails d'une conversation
     * @apiName GetConversation
     * @apiGroup Conversations
     */
    router.get(
      "/:conversationId",
      authMiddleware.authenticate,
      rateLimitMiddleware.apiLimit,
      validationMiddleware.validateMongoId("conversationId"),
      cacheMiddleware.checkConversationCache,
      async (req, res) => {
        try {
          await conversationController.getConversation(req, res);
        } catch (error) {
          console.error("❌ Erreur route get conversation:", error);
          res.status(500).json({
            success: false,
            message: "Erreur lors de la récupération de la conversation",
            code: "GET_CONVERSATION_ROUTE_ERROR",
          });
        }
      }
    );

    /**
     * @api {post} /api/conversations Créer une conversation
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
          console.error("❌ Erreur route create conversation:", error);
          res.status(500).json({
            success: false,
            message: "Erreur lors de la création de la conversation",
            code: "CREATE_CONVERSATION_ROUTE_ERROR",
          });
        }
      }
    );

    console.log("✅ Routes de conversations configurées");
  } catch (error) {
    console.error("❌ Erreur configuration routes conversations:", error);

    // Route de fallback en cas d'erreur
    router.all("*", (req, res) => {
      res.status(500).json({
        success: false,
        message: "Erreur de configuration du service de conversations",
        error: error.message,
      });
    });
  }

  return router;
}

module.exports = createConversationRoutes;
