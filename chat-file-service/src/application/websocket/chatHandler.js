const axios = require("axios");
let OnlineUserManager = null;
let RoomManager = null;

// Tentative d'import des gestionnaires Redis
try {
  OnlineUserManager = require("../../infrastructure/redis/OnlineUserManager");
  RoomManager = require("../../infrastructure/redis/RoomManager");
} catch (error) {
  console.log(
    "⚠️ Gestionnaires Redis non disponibles, mode mémoire locale activé"
  );
}

// Stockage en mémoire locale si Redis indisponible
const onlineUsers = new Set();
const createdRooms = new Map();
const userSockets = new Map(); // Mapping userId -> socketId

const chatHandler = (
  io,
  redisClient,
  sendMessageUseCase,
  getConversationUseCase,
  getConversationsUseCase,
  getMessagesUseCase,
  updateMessageStatusUseCase,
  kafkaProducers = null
) => {
  // Utiliser Redis si disponible, sinon mode mémoire locale
  const userManager = redisClient ? new OnlineUserManager(redisClient) : null;
  const roomManager = redisClient ? new RoomManager(redisClient) : null;
  const serverId = process.env.SERVER_ID || "chat-file-1";

  console.log(
    redisClient
      ? "🚀 Mode Redis activé"
      : "⚠️ Mode développement (mémoire locale)"
  );
  console.log(
    kafkaProducers
      ? "📤 Kafka producers activés"
      : "⚠️ Mode développement (sans Kafka)"
  );

  // Méthodes utilitaires
  const publishToKafka = async (topic, message, key = null) => {
    if (!kafkaProducers) return false;

    try {
      const producer = topic.includes("message")
        ? kafkaProducers.messageProducer
        : kafkaProducers.fileProducer;
      if (producer) {
        (await producer.publishMessage)
          ? producer.publishMessage(message)
          : producer.publishFileUpload(message);
        return true;
      }
    } catch (error) {
      console.warn(`⚠️ Erreur publication Kafka ${topic}:`, error.message);
    }
    return false;
  };

  const updateUserActivity = async (userId) => {
    if (userManager) {
      await userManager.updateUserActivity(userId);
    }
  };

  const getSocketByUserId = (userId) => {
    if (userManager) {
      // Avec Redis, nous devons chercher dans tous les sockets connectés
      for (const [socketId, socket] of io.sockets.sockets) {
        if (socket.userId === userId) return socket;
      }
    } else {
      return userSockets.get(userId);
    }
    return null;
  };

  const emitToUser = (userId, event, data) => {
    const socket = getSocketByUserId(userId);
    if (socket) {
      socket.emit(event, data);
      return true;
    }
    return false;
  };

  const broadcastToRoom = (roomId, event, data, excludeUserId = null) => {
    if (excludeUserId) {
      io.to(roomId)
        .except(getSocketByUserId(excludeUserId)?.id)
        .emit(event, data);
    } else {
      io.to(roomId).emit(event, data);
    }
  };

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

      // Configuration socket utilisateur
      socket.userId = userId;
      socket.userData = userData;
      socket.join(userId);

      // Ajouter l'utilisateur (Redis ou mémoire locale)
      if (userManager) {
        await userManager.addUser(userId, socket.id, serverId);
      } else {
        onlineUsers.add(userId);
        userSockets.set(userId, socket);
      }

      // Statistiques initiales
      let onlineCount, roomsCount;
      if (userManager && roomManager) {
        onlineCount = await userManager.getOnlineUsersCount();
        roomsCount = await roomManager.getRoomsCount();
      } else {
        onlineCount = onlineUsers.size;
        roomsCount = createdRooms.size;
      }

      // Événements d'information
      io.emit("onlineUsersCount", { count: onlineCount });
      socket.emit("serverInfo", { serverId, onlineCount, roomsCount });
      socket.emit("userAuthenticated", { userId, userData });

      console.log(`👥 Utilisateurs en ligne: ${onlineCount}`);

      // ==================== ÉVÉNEMENTS PRINCIPAUX ====================

      // Récupération des statistiques
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
              kafkaEnabled: !!kafkaProducers,
              redisEnabled: !!redisClient,
            };
          } else {
            stats = {
              onlineUsers: Array.from(onlineUsers),
              totalOnlineUsers: onlineUsers.size,
              createdRooms: Array.from(createdRooms.entries()),
              totalRooms: createdRooms.size,
              serverId,
              kafkaEnabled: !!kafkaProducers,
              redisEnabled: !!redisClient,
            };
          }
          socket.emit("stats", stats);
        } catch (error) {
          console.error("Erreur récupération stats:", error);
          socket.emit("error", { message: "Erreur récupération statistiques" });
        }
      });

      // Création de salon
      socket.on("createRoom", async (roomData) => {
        try {
          const {
            roomName,
            roomType = "conversation",
            isPrivate = false,
          } = roomData;
          const roomId = `room_${Date.now()}_${userId}`;

          const newRoomData = {
            name: roomName,
            type: roomType,
            creator: userId,
            createdAt: new Date().toISOString(),
            participants: [userId],
            isPrivate,
            serverId,
          };

          if (roomManager) {
            await roomManager.createRoom(roomId, newRoomData);
          } else {
            createdRooms.set(roomId, newRoomData);
          }

          socket.join(roomId);

          // Publier l'événement dans Kafka
          await publishToKafka("chat.events", {
            type: "ROOM_CREATED",
            roomId,
            roomData: newRoomData,
            timestamp: new Date().toISOString(),
          });

          // Notifier tous les clients
          if (!isPrivate) {
            io.emit("roomCreated", {
              roomId,
              roomName,
              creator: userId,
              createdAt: new Date(),
              serverId,
              participants: [userId],
            });
          }

          socket.emit("roomJoined", { roomId, roomData: newRoomData });
          console.log(`🏠 Salon créé: ${roomId} par ${userId}`);
        } catch (error) {
          console.error("Erreur création salon:", error);
          socket.emit("error", {
            message: "Erreur lors de la création du salon",
          });
        }
      });

      // Rejoindre un salon
      socket.on("joinRoom", async (roomId) => {
        try {
          let roomData;
          if (roomManager) {
            roomData = await roomManager.getRoomData(roomId);
            if (roomData) {
              await roomManager.addParticipant(roomId, userId);
            }
          } else {
            roomData = createdRooms.get(roomId);
            if (roomData && !roomData.participants.includes(userId)) {
              roomData.participants.push(userId);
            }
          }

          if (roomData) {
            socket.join(roomId);
            socket.emit("roomJoined", { roomId, roomData });

            // Notifier les autres participants
            broadcastToRoom(
              roomId,
              "userJoinedRoom",
              {
                roomId,
                userId,
                userData: socket.userData,
                timestamp: new Date().toISOString(),
              },
              userId
            );

            // Publier dans Kafka
            await publishToKafka("chat.events", {
              type: "USER_JOINED_ROOM",
              roomId,
              userId,
              timestamp: new Date().toISOString(),
            });

            console.log(`👤 ${userId} a rejoint le salon ${roomId}`);
          } else {
            socket.emit("error", { message: "Salon non trouvé" });
          }
        } catch (error) {
          console.error("Erreur rejoindre salon:", error);
          socket.emit("error", {
            message: "Erreur lors de la tentative de rejoindre le salon",
          });
        }
      });

      // Quitter un salon
      socket.on("leaveRoom", async (roomId) => {
        try {
          if (roomManager) {
            await roomManager.removeParticipant(roomId, userId);
          } else {
            const roomData = createdRooms.get(roomId);
            if (roomData) {
              roomData.participants = roomData.participants.filter(
                (id) => id !== userId
              );
            }
          }

          socket.leave(roomId);

          // Notifier les autres participants
          broadcastToRoom(
            roomId,
            "userLeftRoom",
            {
              roomId,
              userId,
              timestamp: new Date().toISOString(),
            },
            userId
          );

          // Publier dans Kafka
          await publishToKafka("chat.events", {
            type: "USER_LEFT_ROOM",
            roomId,
            userId,
            timestamp: new Date().toISOString(),
          });

          socket.emit("roomLeft", { roomId });
          console.log(`👤 ${userId} a quitté le salon ${roomId}`);
        } catch (error) {
          console.error("Erreur quitter salon:", error);
          socket.emit("error", {
            message: "Erreur lors de la tentative de quitter le salon",
          });
        }
      });

      // Récupération des conversations
      socket.on("sidebar", async () => {
        try {
          if (!userId) {
            socket.emit("error", { message: "Utilisateur non authentifié" });
            return;
          }

          const conversations = await getConversationsUseCase.execute(userId);

          // Ajouter les conversations aux salons (Redis ou mémoire locale)
          conversations.forEach((conv) => {
            const roomId = conv._id.toString();
            const roomData = {
              name: `Conversation ${conv._id}`,
              type: "private",
              participants: conv.participants,
              createdAt: conv.createdAt,
              isConversation: true,
            };

            if (!roomManager) {
              if (!createdRooms.has(roomId)) {
                createdRooms.set(roomId, roomData);
              }
            }
          });

          socket.emit("sidebarData", conversations);

          // Émettre la liste des salons
          if (roomManager) {
            const rooms = await roomManager.getRooms();
            socket.emit("createdRooms", rooms);
          } else {
            socket.emit("createdRooms", Array.from(createdRooms.entries()));
          }

          // Mettre à jour l'activité utilisateur
          await updateUserActivity(userId);
        } catch (error) {
          console.error("Erreur récupération conversations:", error);
          socket.emit("error", {
            message: "Erreur lors de la récupération des conversations",
          });
        }
      });

      // Chargement des messages
      socket.on("getMessages", async (data) => {
        try {
          const { conversationId, page = 1, limit = 50 } = data;

          if (!conversationId) {
            socket.emit("error", { message: "ID de conversation manquant" });
            return;
          }

          // Récupérer les messages avec pagination
          const messages = await getMessagesUseCase.execute({
            conversationId,
            userId,
            page,
            limit,
          });

          socket.emit("messagesLoaded", {
            conversationId,
            messages,
            page,
            hasMore: messages.length === limit,
          });

          // Mettre à jour l'activité
          await updateUserActivity(userId);
        } catch (error) {
          console.error("Erreur chargement messages:", error);
          socket.emit("error", {
            message: "Erreur lors du chargement des messages",
          });
        }
      });

      // Envoi de message privé
      socket.on("privateMessage", async (data) => {
        try {
          console.log("Message privé reçu:", data);
          const {
            senderId,
            receiverId,
            content,
            messageType = "TEXT",
            metadata = {},
          } = data;

          // Vérification de sécurité
          if (senderId !== userId) {
            console.error("Tentative d'usurpation d'identité détectée");
            socket.emit("messageError", {
              message: "Vous n'êtes pas autorisé à envoyer ce message",
            });
            return;
          }

          // Validation du contenu
          if (!content || content.trim().length === 0) {
            socket.emit("messageError", {
              message: "Le message ne peut pas être vide",
            });
            return;
          }

          // Envoyer le message
          const message = await sendMessageUseCase.execute({
            senderId,
            receiverId,
            content: content.trim(),
            type: messageType,
            metadata,
          });

          // Publier dans Kafka
          await publishToKafka("chat.messages", {
            ...message,
            eventType: "MESSAGE_SENT",
            timestamp: new Date().toISOString(),
          });

          // Envoyer aux participants
          emitToUser(receiverId, "newMessage", message);
          socket.emit("newMessage", message);

          // Mettre à jour les conversations
          const [updatedConversationSender, updatedConversationReceiver] =
            await Promise.all([
              getConversationUseCase.execute(message.conversationId, userId),
              getConversationUseCase.execute(
                message.conversationId,
                receiverId
              ),
            ]);

          socket.emit("conversationUpdated", updatedConversationSender);
          emitToUser(
            receiverId,
            "conversationUpdated",
            updatedConversationReceiver
          );

          // Notification push si l'utilisateur est hors ligne
          const isReceiverOnline = userManager
            ? await userManager.isUserOnline(receiverId)
            : onlineUsers.has(receiverId);

          if (!isReceiverOnline) {
            await publishToKafka("chat.notifications", {
              type: "PUSH_NOTIFICATION",
              userId: receiverId,
              title: `Nouveau message de ${socket.userData.nom} ${socket.userData.prenom}`,
              body: content.substring(0, 100),
              data: {
                conversationId: message.conversationId,
                senderId: userId,
                messageId: message._id,
              },
              timestamp: new Date().toISOString(),
            });
          }

          console.log(`💬 Message envoyé: ${userId} -> ${receiverId}`);
        } catch (error) {
          console.error("Erreur envoi message:", error);
          socket.emit("messageError", {
            message: "Erreur lors de l'envoi du message",
          });
        }
      });

      // Message de salon
      socket.on("roomMessage", async (data) => {
        try {
          const { roomId, content, messageType = "TEXT", metadata = {} } = data;

          if (!content || content.trim().length === 0) {
            socket.emit("messageError", {
              message: "Le message ne peut pas être vide",
            });
            return;
          }

          // Vérifier l'appartenance au salon
          let isParticipant = false;
          if (roomManager) {
            isParticipant = await roomManager.isParticipant(roomId, userId);
          } else {
            const roomData = createdRooms.get(roomId);
            isParticipant = roomData && roomData.participants.includes(userId);
          }

          if (!isParticipant) {
            socket.emit("error", {
              message:
                "Vous n'êtes pas autorisé à envoyer des messages dans ce salon",
            });
            return;
          }

          const messageData = {
            _id: `msg_${Date.now()}_${userId}`,
            roomId,
            senderId: userId,
            senderData: socket.userData,
            content: content.trim(),
            type: messageType,
            metadata,
            createdAt: new Date().toISOString(),
            serverId,
          };

          // Publier dans Kafka
          await publishToKafka("chat.messages", {
            ...messageData,
            eventType: "ROOM_MESSAGE_SENT",
          });

          // Diffuser dans le salon
          io.to(roomId).emit("roomMessage", messageData);

          // Mettre à jour l'activité du salon
          if (roomManager) {
            await roomManager.updateRoomActivity(roomId);
          }

          console.log(`🏠 Message salon ${roomId}: ${userId}`);
        } catch (error) {
          console.error("Erreur message salon:", error);
          socket.emit("messageError", {
            message: "Erreur lors de l'envoi du message au salon",
          });
        }
      });

      // Messages livrés
      socket.on("markDelivered", async (conversationId) => {
        try {
          console.log("Marquage messages livrés:", conversationId);

          const result = await updateMessageStatusUseCase.execute({
            conversationId,
            receiverId: userId,
            status: "DELIVERED",
          });

          if (result.modifiedCount > 0) {
            // Publier dans Kafka
            await publishToKafka("chat.events", {
              type: "MESSAGES_DELIVERED",
              conversationId,
              receiverId: userId,
              count: result.modifiedCount,
              timestamp: new Date().toISOString(),
            });

            // Récupérer et notifier les expéditeurs
            const messages = await getMessagesUseCase.execute({
              conversationId,
              userId,
            });
            const messagesBySender = messages.reduce((acc, msg) => {
              if (msg.senderId !== userId) {
                if (!acc[msg.senderId]) acc[msg.senderId] = [];
                acc[msg.senderId].push(msg);
              }
              return acc;
            }, {});

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

              emitToUser(senderId, "messagesDelivered", {
                conversationId,
                receiverId: userId,
                messages: messagesInfo,
              });

              const updatedConversation = await getConversationUseCase.execute(
                conversationId,
                senderId
              );
              emitToUser(senderId, "conversationUpdated", updatedConversation);
            }

            // Mettre à jour pour le récepteur
            const updatedConversationReceiver =
              await getConversationUseCase.execute(conversationId, userId);
            socket.emit("conversationUpdated", updatedConversationReceiver);
          }
        } catch (error) {
          console.error("Erreur marquage livré:", error);
          socket.emit("error", {
            message: "Erreur lors du marquage des messages comme livrés",
          });
        }
      });

      // Messages lus
      socket.on("markRead", async (conversationId) => {
        try {
          const result = await updateMessageStatusUseCase.execute({
            conversationId,
            receiverId: userId,
            status: "READ",
          });

          if (result.modifiedCount > 0) {
            // Publier dans Kafka
            await publishToKafka("chat.events", {
              type: "MESSAGES_READ",
              conversationId,
              receiverId: userId,
              count: result.modifiedCount,
              timestamp: new Date().toISOString(),
            });

            // Notifier les expéditeurs (même logique que markDelivered)
            const messages = await getMessagesUseCase.execute({
              conversationId,
              userId,
            });
            const messagesBySender = messages.reduce((acc, msg) => {
              if (msg.senderId !== userId) {
                if (!acc[msg.senderId]) acc[msg.senderId] = [];
                acc[msg.senderId].push(msg);
              }
              return acc;
            }, {});

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

              emitToUser(senderId, "messagesRead", {
                conversationId,
                receiverId: userId,
                messages: messagesInfo,
              });

              const updatedConversation = await getConversationUseCase.execute(
                conversationId,
                senderId
              );
              emitToUser(senderId, "conversationUpdated", updatedConversation);
            }

            const updatedConversationReceiver =
              await getConversationUseCase.execute(conversationId, userId);
            socket.emit("conversationUpdated", updatedConversationReceiver);
          }
        } catch (error) {
          console.error("Erreur marquage lu:", error);
          socket.emit("error", {
            message: "Erreur lors du marquage des messages comme lus",
          });
        }
      });

      // Événement de frappe (typing)
      socket.on("typing", ({ conversationId, isTyping }) => {
        try {
          socket.to(conversationId).emit("userTyping", {
            userId,
            userData: socket.userData,
            isTyping,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          console.error("Erreur événement typing:", error);
        }
      });

      // Notification de présence
      socket.on("updatePresence", async (status) => {
        try {
          const presenceData = {
            userId,
            status, // online, away, busy, offline
            lastSeen: new Date().toISOString(),
            serverId,
          };

          // Publier dans Kafka
          await publishToKafka("chat.events", {
            type: "PRESENCE_UPDATE",
            ...presenceData,
          });

          // Notifier les contacts
          socket.broadcast.emit("presenceUpdate", presenceData);

          // Mettre à jour l'activité
          await updateUserActivity(userId);
        } catch (error) {
          console.error("Erreur mise à jour présence:", error);
        }
      });

      // Événements de fichiers
      socket.on("fileUpload", async (data) => {
        try {
          const { conversationId, fileId, fileName, fileSize, fileType } = data;

          // Publier dans Kafka
          await publishToKafka("chat.files", {
            type: "FILE_UPLOAD_STARTED",
            userId,
            conversationId,
            fileId,
            fileName,
            fileSize,
            fileType,
            timestamp: new Date().toISOString(),
          });

          socket.emit("fileUploadStarted", { fileId, status: "uploading" });
        } catch (error) {
          console.error("Erreur événement upload:", error);
          socket.emit("fileUploadError", {
            message: "Erreur lors du démarrage de l'upload",
          });
        }
      });

      socket.on("fileUploadComplete", async (data) => {
        try {
          const {
            conversationId,
            fileId,
            fileName,
            filePath,
            fileSize,
            fileType,
          } = data;

          // Publier dans Kafka
          await publishToKafka("chat.files", {
            type: "FILE_UPLOAD_COMPLETED",
            userId,
            conversationId,
            fileId,
            fileName,
            filePath,
            fileSize,
            fileType,
            timestamp: new Date().toISOString(),
          });

          // Notifier les participants
          const fileMessage = {
            _id: `file_${Date.now()}_${userId}`,
            conversationId,
            senderId: userId,
            type: "FILE",
            content: fileName,
            metadata: {
              fileId,
              fileName,
              filePath,
              fileSize,
              fileType,
            },
            createdAt: new Date().toISOString(),
          };

          socket.emit("fileMessage", fileMessage);
          socket.to(conversationId).emit("fileMessage", fileMessage);
        } catch (error) {
          console.error("Erreur fin upload:", error);
          socket.emit("fileUploadError", {
            message: "Erreur lors de la finalisation de l'upload",
          });
        }
      });

      // Événement de ping pour maintenir la connexion
      socket.on("ping", () => {
        socket.emit("pong", { timestamp: new Date().toISOString(), serverId });
        updateUserActivity(userId);
      });

      // Déconnexion
      socket.on("disconnect", async (reason) => {
        console.log(`🔌 Client déconnecté: ${socket.id} (${reason})`);

        if (socket.userId) {
          try {
            // Publier dans Kafka
            await publishToKafka("chat.events", {
              type: "USER_DISCONNECTED",
              userId: socket.userId,
              reason,
              timestamp: new Date().toISOString(),
              serverId,
            });

            // Supprimer l'utilisateur
            if (userManager) {
              await userManager.removeUser(socket.userId);
            } else {
              onlineUsers.delete(socket.userId);
              userSockets.delete(socket.userId);
            }

            // Notifier la déconnexion
            socket.broadcast.emit("userOffline", {
              userId: socket.userId,
              timestamp: new Date().toISOString(),
            });

            console.log(
              `👋 Utilisateur ${socket.userId} déconnecté de ${serverId}`
            );

            // Émettre le nouveau nombre d'utilisateurs
            const onlineCount = userManager
              ? await userManager.getOnlineUsersCount()
              : onlineUsers.size;

            io.emit("onlineUsersCount", { count: onlineCount });
            console.log(`👥 Utilisateurs en ligne restants: ${onlineCount}`);
          } catch (error) {
            console.error("Erreur lors de la déconnexion:", error);
          }
        }
      });

      // Gestion d'erreur générique
      socket.on("error", (error) => {
        console.error(`❌ Erreur socket ${socket.id}:`, error);
        socket.emit("error", { message: "Erreur interne du serveur" });
      });
    } catch (error) {
      console.error(
        "Erreur validation token:",
        error.response?.data || error.message
      );
      socket.emit("error", { message: "Erreur d'authentification" });
      socket.disconnect();
    }
  });

  // Nettoyage périodique
  if (roomManager) {
    setInterval(async () => {
      try {
        const cleaned = await roomManager.cleanupInactiveRooms();
        if (cleaned > 0) {
          console.log(`🧹 ${cleaned} salons inactifs nettoyés`);
        }
      } catch (error) {
        console.error("Erreur nettoyage salons:", error);
      }
    }, 3600000); // Toutes les heures
  }

  console.log(`🎯 ChatHandler initialisé sur ${serverId}`);
  return io;
};

module.exports = chatHandler;
