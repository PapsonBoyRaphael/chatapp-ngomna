const express = require("express");

// Middleware
const authMiddleware = require("../middleware/authMiddleware");
const rateLimitMiddleware = require("../middleware/rateLimitMiddleware");
const validationMiddleware = require("../middleware/validationMiddleware");
const cacheMiddleware = require("../middleware/cacheMiddleware");

function createConversationRoutes(conversationController) {
  const router = express.Router();

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
        const {
          page = 1,
          limit = 20,
          archived = false,
          muted = false,
          unreadOnly = false,
        } = req.query;

        req.query = {
          ...req.query,
          userId: req.user.id,
          page: parseInt(page),
          limit: Math.min(50, parseInt(limit)),
          archived: archived === "true",
          muted: muted === "true",
          unreadOnly: unreadOnly === "true",
        };

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
    cacheMiddleware.checkConversationCache,
    async (req, res) => {
      await conversationController.getConversation(req, res);
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
    validationMiddleware.validateConversationCreation,
    async (req, res) => {
      try {
        const { participantId, type = "PRIVATE", name, description } = req.body;
        const userId = req.user.id;

        if (!participantId) {
          return res.status(400).json({
            success: false,
            message: "ID du participant requis",
            code: "MISSING_PARTICIPANT_ID",
          });
        }

        const result = await conversationController.createConversation({
          userId,
          participantId,
          type,
          name,
          description,
        });

        res.status(201).json(result);
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

  /**
   * @api {patch} /api/conversations/:conversationId/archive Archiver/désarchiver
   * @apiName ToggleArchive
   * @apiGroup Conversations
   */
  router.patch(
    "/:conversationId/archive",
    authMiddleware.authenticate,
    rateLimitMiddleware.apiLimit,
    async (req, res) => {
      try {
        const { conversationId } = req.params;
        const { archive = true } = req.body;
        const userId = req.user.id;

        const result = await conversationController.toggleArchive({
          conversationId,
          userId,
          archive,
        });

        res.json(result);
      } catch (error) {
        console.error("❌ Erreur route toggle archive:", error);
        res.status(500).json({
          success: false,
          message: "Erreur lors de l'archivage",
          code: "TOGGLE_ARCHIVE_ROUTE_ERROR",
        });
      }
    }
  );

  /**
   * @api {delete} /api/conversations/:conversationId/cache Invalider le cache
   * @apiName InvalidateCache
   * @apiGroup Conversations
   */
  router.delete(
    "/:conversationId/cache",
    authMiddleware.authenticate,
    rateLimitMiddleware.adminLimit,
    async (req, res) => {
      await conversationController.invalidateConversationCache(req, res);
    }
  );

  return router;
}

module.exports = createConversationRoutes;
