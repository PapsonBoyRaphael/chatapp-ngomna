const express = require("express");

// Middleware
const authMiddleware = require("../middleware/authMiddleware");
const rateLimitMiddleware = require("../middleware/rateLimitMiddleware");
const validationMiddleware = require("../middleware/validationMiddleware");
const cacheMiddleware = require("../middleware/cacheMiddleware");

function createMessageRoutes(messageController) {
  const router = express.Router();

  /**
   * @api {get} /api/messages/:conversationId Messages d'une conversation
   * @apiName GetMessages
   * @apiGroup Messages
   */
  router.get(
    "/:conversationId",
    authMiddleware.authenticate,
    rateLimitMiddleware.apiLimit,
    validationMiddleware.validateMongoId("conversationId"),
    cacheMiddleware.checkMessagesCache,
    async (req, res) => {
      try {
        const { conversationId } = req.params;
        const { page = 1, limit = 50, before, after } = req.query;
        
        req.query = {
          ...req.query,
          conversationId,
          userId: req.user.id,
          page: parseInt(page),
          limit: Math.min(100, parseInt(limit))
        };

        await messageController.getMessages(req, res);
      } catch (error) {
        console.error("❌ Erreur route messages:", error);
        res.status(500).json({
          success: false,
          message: "Erreur lors de la récupération des messages",
          code: "GET_MESSAGES_ROUTE_ERROR"
        });
      }
    }
  );

  /**
   * @api {post} /api/messages Envoyer un message
   * @apiName SendMessage
   * @apiGroup Messages
   */
  router.post(
    "/",
    authMiddleware.authenticate,
    rateLimitMiddleware.createLimit,
    validationMiddleware.sanitizeInput,
    async (req, res) => {
      try {
        const { conversationId, content, type = "TEXT", replyTo, mentions = [] } = req.body;
        const userId = req.user.id;

        if (!conversationId || !content) {
          return res.status(400).json({
            success: false,
            message: "ConversationId et contenu requis",
            code: "MISSING_REQUIRED_FIELDS"
          });
        }

        const result = await messageController.sendMessage({
          conversationId,
          senderId: userId,
          content,
          type,
          replyTo,
          mentions
        });

        res.status(201).json(result);
      } catch (error) {
        console.error("❌ Erreur route send message:", error);
        res.status(500).json({
          success: false,
          message: "Erreur lors de l'envoi du message",
          code: "SEND_MESSAGE_ROUTE_ERROR"
        });
      }
    }
  );

  /**
   * @api {patch} /api/messages/:messageId/status Mettre à jour le statut
   * @apiName UpdateMessageStatus
   * @apiGroup Messages
   */
  router.patch(
    "/:messageId/status",
    authMiddleware.authenticate,
    rateLimitMiddleware.reactionLimit,
    validationMiddleware.validateMongoId("messageId"),
    async (req, res) => {
      try {
        const { messageId } = req.params;
        const { status } = req.body; // DELIVERED, READ, etc.
        const userId = req.user.id;

        const result = await messageController.updateMessageStatus({
          messageId,
          userId,
          status
        });

        res.json(result);
      } catch (error) {
        console.error("❌ Erreur route update status:", error);
        res.status(500).json({
          success: false,
          message: "Erreur lors de la mise à jour du statut",
          code: "UPDATE_STATUS_ROUTE_ERROR"
        });
      }
    }
  );

  /**
   * @api {get} /api/messages/:messageId Message individuel
   * @apiName GetMessage
   * @apiGroup Messages
   */
  router.get(
    "/single/:messageId",
    authMiddleware.authenticate,
    rateLimitMiddleware.apiLimit,
    validationMiddleware.validateMongoId("messageId"),
    cacheMiddleware.checkMessageCache,
    async (req, res) => {
      await messageController.getMessage(req, res);
    }
  );

  /**
   * @api {delete} /api/messages/:messageId Supprimer un message
   * @apiName DeleteMessage
   * @apiGroup Messages
   */
  router.delete(
    "/:messageId",
    authMiddleware.authenticate,
    rateLimitMiddleware.apiLimit,
    validationMiddleware.validateMongoId("messageId"),
    async (req, res) => {
      try {
        const { messageId } = req.params;
        const userId = req.user.id;

        const result = await messageController.deleteMessage({
          messageId,
          userId
        });

        res.json(result);
      } catch (error) {
        console.error("❌ Erreur route delete message:", error);
        res.status(500).json({
          success: false,
          message: "Erreur lors de la suppression",
          code: "DELETE_MESSAGE_ROUTE_ERROR"
        });
      }
    }
  );

  /**
   * @api {post} /api/messages/:messageId/reactions Ajouter une réaction
   * @apiName AddReaction
   * @apiGroup Messages
   */
  router.post(
    "/:messageId/reactions",
    authMiddleware.authenticate,
    rateLimitMiddleware.reactionLimit,
    validationMiddleware.validateMongoId("messageId"),
    async (req, res) => {
      try {
        const { messageId } = req.params;
        const { emoji } = req.body;
        const userId = req.user.id;

        if (!emoji) {
          return res.status(400).json({
            success: false,
            message: "Emoji requis",
            code: "MISSING_EMOJI"
          });
        }

        const result = await messageController.addReaction({
          messageId,
          userId,
          emoji
        });

        res.json(result);
      } catch (error) {
        console.error("❌ Erreur route add reaction:", error);
        res.status(500).json({
          success: false,
          message: "Erreur lors de l'ajout de la réaction",
          code: "ADD_REACTION_ROUTE_ERROR"
        });
      }
    }
  );

  return router;
}

module.exports = createMessageRoutes;
