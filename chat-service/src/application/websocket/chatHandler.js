const axios = require("axios");

module.exports = (
  io,
  sendMessageUseCase,
  getConversationUseCase,
  getConversationsUseCase,
  getMessagesUseCase,
  updateMessageStatusUseCase
) => {
  io.on("connection", async (socket) => {
    console.log("Nouveau client connecté:", socket.id);

    // Récupérer le token depuis socket.handshake.auth
    const token = socket.handshake.auth?.token;

    if (!token) {
      console.error("Connexion refusée : token manquant");
      socket.emit("error", { message: "Token d'authentification requis" });
      socket.disconnect(); // Déconnecter le client
      return;
    }

    try {
      // Valider le token auprès de l'auth-service
      const response = await axios.post(
        `${process.env.AUTH_SERVICE_URL}/validate`,
        {
          token,
        }
      );

      const userData = response.data; // Récupérer les données utilisateur
      const userId = userData.id; // Supposons que l'auth-service renvoie un champ `id`

      console.log(`Utilisateur authentifié : ${userId}`);
      socket.join(userId); // Joindre la salle de l'utilisateur

      // Écouter l'événement 'sidebar' pour récupérer les conversations
      socket.on("sidebar", async () => {
        try {
          if (!userId) {
            console.error("Utilisateur non authentifié");
            return;
          }

          // Récupérer les conversations de l'utilisateur
          const conversations = await getConversationsUseCase.execute(userId);

          // Émettre les conversations au client
          socket.emit("sidebarData", conversations);
        } catch (error) {
          console.error(
            "Erreur lors de la récupération des conversations :",
            error
          );
          socket.emit("error", {
            message: "Erreur lors de la récupération des conversations",
          });
        }
      });

      // Écouter l'événement pour charger les messages d'une conversation
      socket.on("getMessages", async (data) => {
        try {
          const { conversationId } = data;

          if (!conversationId) {
            socket.emit("error", { message: "ID de conversation manquant" });
            return;
          }

          // Récupérer les messages de la conversation
          const messages = await getMessagesUseCase.execute({
            conversationId,
            userId, // Vérifier que l'utilisateur a accès à cette conversation
          });

          // Envoyer les messages au client
          socket.emit("messagesLoaded", messages);
        } catch (error) {
          console.error("Erreur lors du chargement des messages:", error);
          socket.emit("error", {
            message: "Erreur lors du chargement des messages",
          });
        }
      });

      // Gérer les messages privés
      socket.on("privateMessage", async (data) => {
        try {
          console.log("Message privé reçu:", data);
          const { senderId, receiverId, content } = data;

          // Vérifier l'identité de l'expéditeur
          if (senderId !== userId) {
            console.error("Tentative d'usurpation d'identité détectée");
            socket.emit("messageError", {
              message: "Vous n'êtes pas autorisé à envoyer ce message",
            });
            return;
          }

          // Envoyer le message avec l'ID de conversation
          const message = await sendMessageUseCase.execute({
            senderId,
            receiverId,
            content,
          });

          // Envoyer le message aux deux participants
          io.to(receiverId).emit("newMessage", message);
          socket.emit("newMessage", message);

          // Utiliser le conversationId retourné par le sendMessageUseCase
          const updatedConversationSender =
            await getConversationUseCase.execute(
              message.conversationId,
              userId
            );

          const updatedConversationReceiver =
            await getConversationUseCase.execute(
              message.conversationId,
              receiverId
            );

          // Émettre l'événement de mise à jour de conversation
          socket.emit("conversationUpdated", updatedConversationSender);
          io.to(receiverId).emit(
            "conversationUpdated",
            updatedConversationReceiver
          );
        } catch (error) {
          console.error("Erreur lors de l'envoi du message:", error);
          socket.emit("messageError", {
            message: "Erreur lors de l'envoi du message",
          });
        }
      });
      // Marquer les messages comme livrés
      socket.on("markDelivered", async (conversationId) => {
        try {
          console.log(
            "Marquage des messages comme livrés pour la conversation:",
            conversationId
          );
          await updateMessageStatusUseCase.execute({
            conversationId,
            receiverId: userId,
            status: "DELIVERED",
          });

          // Récupérer la conversation mise à jour
          const updatedConversationReceiver =
            await getConversationUseCase.execute(conversationId, userId);

          // Récupérer tous les messages
          const messages = await getMessagesUseCase.execute({
            conversationId,
            userId,
          });

          // Grouper les messages par expéditeur
          const messagesBySender = messages.reduce((acc, msg) => {
            if (msg.senderId !== userId) {
              // Ne traiter que les messages reçus
              if (!acc[msg.senderId]) {
                acc[msg.senderId] = [];
              }
              acc[msg.senderId].push(msg);
            }
            return acc;
          }, {});

          // Mettre à jour la conversation pour le récepteur
          socket.emit("conversationUpdated", updatedConversationReceiver);

          // Notifier chaque expéditeur pour ses messages
          for (const [senderId, senderMessages] of Object.entries(
            messagesBySender
          )) {
            const messagesInfo = senderMessages.map((msg) => ({
              _id: msg._id,
              senderId: msg.senderId,
              receiverId: msg.receiverId,
              content: msg.content,
              status: "DELIVERED",
              createdAt: msg.createdAt,
              updatedAt: msg.updatedAt,
            }));

            io.to(senderId).emit("messagesDelivered", {
              conversationId,
              receiverId: userId,
              messages: messagesInfo,
            });

            const updatedConversationSender =
              await getConversationUseCase.execute(conversationId, senderId);
            io.to(senderId).emit(
              "conversationUpdated",
              updatedConversationSender
            );
          }
        } catch (error) {
          console.error(
            "Erreur lors du marquage des messages comme livrés:",
            error
          );
        }
      });

      // Marquer les messages comme lus
      socket.on("markRead", async (conversationId) => {
        try {
          await updateMessageStatusUseCase.execute({
            conversationId,
            receiverId: userId,
            status: "READ",
          });

          // Récupérer la conversation mise à jour
          const updatedConversationReceiver =
            await getConversationUseCase.execute(conversationId, userId);

          // Récupérer tous les messages
          const messages = await getMessagesUseCase.execute({
            conversationId,
            userId,
          });

          // Grouper les messages par expéditeur
          const messagesBySender = messages.reduce((acc, msg) => {
            if (msg.senderId !== userId) {
              // Ne traiter que les messages reçus
              if (!acc[msg.senderId]) {
                acc[msg.senderId] = [];
              }
              acc[msg.senderId].push(msg);
            }
            return acc;
          }, {});

          // Mettre à jour la conversation pour le récepteur
          socket.emit("conversationUpdated", updatedConversationReceiver);

          // Notifier chaque expéditeur pour ses messages
          for (const [senderId, senderMessages] of Object.entries(
            messagesBySender
          )) {
            const messagesInfo = senderMessages.map((msg) => ({
              _id: msg._id,
              senderId: msg.senderId,
              receiverId: msg.receiverId,
              content: msg.content,
              status: "READ",
              createdAt: msg.createdAt,
              updatedAt: msg.updatedAt,
            }));

            io.to(senderId).emit("messagesRead", {
              conversationId,
              receiverId: userId,
              messages: messagesInfo,
            });

            const updatedConversationSender =
              await getConversationUseCase.execute(conversationId, senderId);
            io.to(senderId).emit(
              "conversationUpdated",
              updatedConversationSender
            );
          }
        } catch (error) {
          console.error(
            "Erreur lors du marquage des messages comme lus:",
            error
          );
        }
      });

      socket.on("disconnect", () => {
        console.log("Client déconnecté:", socket.id);
      });
    } catch (error) {
      console.error(
        "Erreur lors de la validation du token:",
        error.response?.data || error.message
      );
      socket.emit("error", { message: "Erreur d'authentification" });
      socket.disconnect(); // Déconnecter le client
    }
  });
};
