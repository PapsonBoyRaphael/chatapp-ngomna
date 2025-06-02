const express = require("express");
const router = express.Router();

// Exemple : Importer le cas d'utilisation pour envoyer un message
const sendMessageUseCase = require("../../../application/use-cases/SendMessage");
const getMessagesUseCase = require("../../../application/use-cases/GetConversations");

// Route pour envoyer un message
router.post("/send", async (req, res) => {
  try {
    const { senderId, receiverId, content } = req.body;

    if (!senderId || !receiverId || !content) {
      return res.status(400).json({ message: "Données manquantes" });
    }

    const message = await sendMessageUseCase.execute({
      senderId,
      receiverId,
      content,
    });
    res.status(201).json(message);
  } catch (error) {
    console.error("Erreur lors de l'envoi du message :", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

// Route pour récupérer les messages entre deux utilisateurs
router.get("/:senderId/:receiverId", async (req, res) => {
  try {
    const { senderId, receiverId } = req.params;

    if (!senderId || !receiverId) {
      return res.status(400).json({ message: "Paramètres manquants" });
    }

    const messages = await getMessagesUseCase.execute({ senderId, receiverId });
    res.status(200).json(messages);
  } catch (error) {
    console.error("Erreur lors de la récupération des messages :", error);
    res.status(500).json({ message: "Erreur interne du serveur" });
  }
});

module.exports = router;
