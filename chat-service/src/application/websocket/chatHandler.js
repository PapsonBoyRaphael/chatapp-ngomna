const axios = require("axios");
const OnlineUserManager = require("../../infrastructure/redis/OnlineUserManager");
const RoomManager = require("../../infrastructure/redis/RoomManager");

// Fallback pour le mode développement sans Redis
const onlineUsers = new Set();
const createdRooms = new Map();

module.exports = (
  io,
  redisClient,
  sendMessageUseCase,
  getConversationUseCase,
  getConversationsUseCase,
  getMessagesUseCase,
  updateMessageStatusUseCase
) => {
  // Utiliser Redis si disponible, sinon mode mémoire locale
  const userManager = redisClient ? new OnlineUserManager(redisClient) : null;
  const roomManager = redisClient ? new RoomManager(redisClient) : null;
  const serverId = process.env.SERVER_ID || "chat-1";

  console.log(
    redisClient
      ? "🚀 Mode Redis activé"
      : "⚠️  Mode développement (mémoire locale)"
  );

  io.on("connection", async (socket) => {
    console.log(`🔌 Nouveau client connecté: ${socket.id} sur ${serverId}`);

    const token = socket.handshake.auth?.token;

    if (!token) {
      console.error("❌ Connexion refusée : token manquant");
      socket.emit("error", { message: "Token d'authentification requis" });
      socket.disconnect();
      return;
    }

    try {
      // Validation du token
      const response = await axios.post(
        `${process.env.AUTH_SERVICE_URL}/validate`,
        { token }
      );

      const userData = response.data;
      const userId = userData.id;

      console.log(`✅ Utilisateur authentifié : ${userId} sur ${serverId}`);

      // Ajouter l'utilisateur (Redis ou mémoire locale)
      if (userManager) {
        await userManager.addUser(userId, socket.id, serverId);
      } else {
        onlineUsers.add(userId);
      }

      socket.userId = userId;
      socket.join(userId);

      // Émettre les statistiques
      let onlineCount, roomsCount;
      if (userManager && roomManager) {
        onlineCount = await userManager.getOnlineUsersCount();
        roomsCount = await roomManager.getRoomsCount();
      } else {
        onlineCount = onlineUsers.size;
        roomsCount = createdRooms.size;
      }

      io.emit("onlineUsersCount", { count: onlineCount });
      socket.emit("serverInfo", { serverId, onlineCount, roomsCount });

      console.log(`👥 Utilisateurs en ligne: ${onlineCount}`);

      // Événement pour obtenir les statistiques
      socket.on("getStats", async () => {
        try {
          let stats;
          if (userManager && roomManager) {
            const onlineUsersData = await userManager.getOnlineUsers();
            const rooms = await roomManager.getRooms();
            stats = {
              onlineUsers: onlineUsersData,
              totalOnlineUsers: onlineUsersData.length,
              createdRooms: rooms,
              totalRooms: rooms.length,
              serverId,
            };
          } else {
            stats = {
              onlineUsers: Array.from(onlineUsers),
              totalOnlineUsers: onlineUsers.size,
              createdRooms: Array.from(createdRooms.entries()),
              totalRooms: createdRooms.size,
              serverId,
            };
          }
          socket.emit("stats", stats);
        } catch (error) {
          console.error("Erreur récupération stats:", error);
        }
      });

      // Événement pour créer un salon
      socket.on("createRoom", async (roomData) => {
        try {
          const { roomName, roomType = "conversation" } = roomData;
          const roomId = `room_${Date.now()}_${userId}`;

          if (roomManager) {
            await roomManager.createRoom(roomId, {
              name: roomName,
              type: roomType,
              creator: userId,
              createdAt: new Date().toISOString(),
              participants: [userId],
            });
          } else {
            createdRooms.set(roomId, {
              name: roomName,
              type: roomType,
              creator: userId,
              createdAt: new Date().toISOString(),
              participants: [userId],
            });
          }

          socket.join(roomId);

          // Notifier tous les clients
          io.emit("roomCreated", {
            roomId,
            roomName,
            creator: userId,
            createdAt: new Date(),
            serverId,
          });

          console.log(`🏠 Salon créé: ${roomId} par ${userId}`);
        } catch (error) {
          console.error("Erreur création salon:", error);
        }
      });

      // Écouter l'événement 'sidebar' pour récupérer les conversations
      socket.on("sidebar", async () => {
        try {
          if (!userId) {
            console.error("Utilisateur non authentifié");
            return;
          }

          const conversations = await getConversationsUseCase.execute(userId);

          // Ajouter les conversations à notre Map des salons (Redis ou mémoire locale)
          conversations.forEach((conv) => {
            const roomId = conv._id.toString();
            const roomData = {
              name: `Conversation ${conv._id}`,
              type: "private",
              participants: conv.participants,
              createdAt: conv.createdAt,
            };

            if (roomManager) {
              // Pas besoin d'ajouter ici car les conversations existent déjà
            } else {
              if (!createdRooms.has(roomId)) {
                createdRooms.set(roomId, roomData);
              }
            }
          });

          socket.emit("sidebarData", conversations);

          // Émettre la liste mise à jour des salons
          if (roomManager) {
            const rooms = await roomManager.getRooms();
            io.emit("createdRooms", rooms);
          } else {
            io.emit("createdRooms", Array.from(createdRooms.entries()));
          }
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
            console.log(
              "Conversation mise à jour pour l'expéditeur:",
              senderId
            );
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

      socket.on("disconnect", async () => {
        console.log(`🔌 Client déconnecté: ${socket.id}`);

        if (socket.userId) {
          // Supprimer l'utilisateur (Redis ou mémoire locale)
          if (userManager) {
            await userManager.removeUser(socket.userId);
          } else {
            onlineUsers.delete(socket.userId);
          }

          console.log(
            `👋 Utilisateur ${socket.userId} déconnecté de ${serverId}`
          );

          // Émettre le nouveau nombre d'utilisateurs en ligne
          const onlineCount = userManager
            ? await userManager.getOnlineUsersCount()
            : onlineUsers.size;

          io.emit("onlineUsersCount", { count: onlineCount });
          console.log(`👥 Utilisateurs en ligne restants: ${onlineCount}`);
        }
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
