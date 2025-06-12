const express = require("express");
const router = express.Router();

function createMessageRoutes(sendMessageUseCase, getMessagesUseCase) {
  // Route pour envoyer un message
  router.post("/send", async (req, res) => {
    try {
      const { senderId, receiverId, content, conversationId, type, metadata } = req.body;

      if (!senderId || !receiverId || !content) {
        return res.status(400).json({ message: "Données manquantes" });
      }

      const message = await sendMessageUseCase.execute({
        senderId,
        receiverId,
        content,
        conversationId,
        type,
        metadata
      });
      
      res.status(201).json(message);
    } catch (error) {
      console.error("Erreur lors de l'envoi du message :", error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  });

  // Route pour récupérer les messages d'une conversation
  router.get("/conversation/:conversationId", async (req, res) => {
    try {
      const { conversationId } = req.params;
      const { userId } = req.query;

      if (!conversationId || !userId) {
        return res.status(400).json({ message: "conversationId et userId requis" });
      }

      const messages = await getMessagesUseCase.execute({
        conversationId,
        userId: parseInt(userId)
      });

      res.json(messages);
    } catch (error) {
      console.error("Erreur lors de la récupération des messages :", error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  });

  return router;
}

module.exports = createMessageRoutes;
