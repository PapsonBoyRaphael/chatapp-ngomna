/**
 * Gestionnaire WebSocket pour le chat en temps réel
 * Responsable de la gestion des connexions, messages et événements socket
 */
const AuthMiddleware = require("../../interfaces/http/middleware/authMiddleware");
const UserConsumerManager = require("../../infrastructure/kafka/consumers/UserConsumerManager");
class ChatHandler {
  constructor(
    io,
    sendMessageUseCase = null,
    getMessagesUseCase = null,
    updateMessageStatusUseCase = null,
    messageProducer = null,
    redisClient = null,
    onlineUserManager = null,
    getConversationIdsUseCase = null,
    getConversationUseCase = null,
    getConversationsUseCase = null,
    getMessageByIdUseCase = null,
    updateMessageContentUseCase = null,
    createGroupUseCase = null,
    createBroadcastUseCase = null
  ) {
    this.io = io;
    this.sendMessageUseCase = sendMessageUseCase;
    this.getMessagesUseCase = getMessagesUseCase;
    this.updateMessageStatusUseCase = updateMessageStatusUseCase;
    this.messageProducer = messageProducer;
    this.redisClient = redisClient;
    this.onlineUserManager = onlineUserManager;
    this.getConversationIdsUseCase = getConversationIdsUseCase;
    this.getConversationUseCase = getConversationUseCase;
    this.getConversationsUseCase = getConversationsUseCase;
    this.getMessageByIdUseCase = getMessageByIdUseCase;
    this.updateMessageContentUseCase = updateMessageContentUseCase;
    this.createGroupUseCase = createGroupUseCase;
    this.createBroadcastUseCase = createBroadcastUseCase;
    this.userConsumerManager = null;
    this.roomManager = null; // ✅ AJOUT : Initialiser à null
  }

  // ✅ MÉTHODE SETUPSOCKETHANDLERS CORRIGÉE AVEC SOCKET PASSÉ À updateLastActivity
  setupSocketHandlers() {
    try {
      console.log("🔌 Configuration des gestionnaires Socket.IO...");

      this.io.on("connection", (socket) => {
        console.log(`🔗 Nouvelle connexion WebSocket: ${socket.id}`);

        // ✅ ÉVÉNEMENT DE BATTEMENT DE CŒUR
        // socket.on("heartbeat", () => {
        //   if (this.onlineUserManager && socket.userId) {
        //     this.onlineUserManager.updateLastActivity(socket.userId, socket);
        //   }
        // });

        // ✅ ÉVÉNEMENTS D'AUTHENTIFICATION
        socket.on("authenticate", (data) => {
          this.handleAuthentication(socket, data);
        });

        // ✅ ÉVÉNEMENTS DE CHAT AVEC RENEW ACTIVITY (socket passé)
        socket.on("sendMessage", (data) => {
          console.log("💬 Envoi message:", data);
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleSendMessage(socket, data);
        });

        socket.on("joinConversation", (data) => {
          console.log("👥 Rejoindre conversation:", data);
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleJoinConversation(socket, data);
        });

        socket.on("leaveConversation", (data) => {
          console.log("👋 Quitter conversation:", data);
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleLeaveConversation(socket, data);
        });

        // ✅ ÉVÉNEMENTS DE FRAPPE AVEC RENEW (socket passé)
        socket.on("typing", (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleTyping(socket, data);
        });

        socket.on("stopTyping", (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleStopTyping(socket, data);
        });

        // ✅ ÉVÉNEMENTS DE GESTION (socket passé)
        socket.on("getOnlineUsers", (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleGetOnlineUsers(socket, data);
        });

        socket.on("ping", () => {
          // if (this.onlineUserManager && socket.userId) {
          //   this.onlineUserManager.updateLastActivity(socket.userId, socket);
          // }
          socket.emit("pong");
        });

        // ✅ ÉVÉNEMENTS DE STATUTS DE MESSAGES AVEC RENEW (socket passé)
        socket.on("markMessageDelivered", (data) => {
          console.log("📬 Marquer message comme livré:", data);
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleMarkMessageDelivered(socket, data);
        });

        socket.on("markMessageRead", (data) => {
          console.log("📖 Marquer message comme lu:", data);
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleMarkMessageRead(socket, data);
        });

        socket.on("markConversationRead", (data) => {
          console.log("📚 Marquer conversation comme lue:", data);
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleMarkConversationRead(socket, data);
        });

        socket.on("getMessageStatus", (data) => {
          console.log("📊 Demande statut message:", data);
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleGetMessageStatus(socket, data);
        });

        socket.on("messageReceived", (data) => {
          console.log("✅ Accusé de réception:", data);
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleMessageReceived(socket, data);
        });

        // ✅ ÉVÉNEMENTS DE SUPPRESSION/ÉDITION AVEC RENEW (socket passé)
        socket.on("deleteMessage", (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleDeleteMessage(socket, data);
        });

        socket.on("deleteFile", (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleDeleteFile(socket, data);
        });

        socket.on("editMessage", (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleEditMessage(socket, data);
        });

        // ✅ ÉVÉNEMENTS DE RÉCUPÉRATION DE DONNÉES AVEC RENEW (socket passé)
        socket.on("getMessages", (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleGetMessages(socket, data);
        });

        socket.on("getConversations", (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleGetConversations(socket, data);
        });

        socket.on("getConversation", (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleGetConversation(socket, data);
        });

        // ✅ ÉVÉNEMENTS D'ERREUR
        socket.on("error", (error) => {
          console.error(`❌ Erreur Socket ${socket.id}:`, error);
        });

        // ✅ ÉVÉNEMENT DE DÉCONNEXION - CORRECTEMENT CONFIGURÉ
        socket.on("disconnect", (reason) => {
          console.log(
            `🔌 Déconnexion détectée: ${socket.id}, raison: ${reason}`
          );
          this.handleDisconnection(socket, reason);
        });
      });

      console.log("✅ Gestionnaires Socket.IO configurés");
    } catch (error) {
      console.error("❌ Erreur configuration Socket.IO:", error);
    }
  }

  // ✅ MÉTHODE DE DÉCONNEXION OPTIMISÉE
  async handleDisconnection(socket, reason = "unknown") {
    const userId = socket.userId;
    const matricule = socket.matricule;

    try {
      if (userId && this.roomManager) {
        await this.roomManager.removeUserFromAllRooms(userId);
        console.log(
          `🧹 Utilisateur ${matricule} (${userId}) retiré de toutes les rooms`
        );
      }

      if (userId && this.onlineUserManager) {
        // Déconnexion via Redis
        await this.onlineUserManager.setUserOffline(userId);

        // Notification Kafka si disponible
        if (this.messageProducer?.publishMessage) {
          await this.messageProducer.publishMessage({
            eventType: "USER_DISCONNECTED",
            userId,
            matricule,
            socketId: socket.id,
            reason,
            timestamp: new Date().toISOString(),
          });
        }

        // Notification broadcast
        socket.broadcast.emit("user_disconnected", {
          userId,
          matricule,
          timestamp: new Date().toISOString(),
          reason,
        });

        // Nettoyage consumer Kafka
        if (this.userConsumerManager) {
          await this.userConsumerManager.removeUserConsumer(userId);
        }

        console.log(`👋 Utilisateur ${matricule} (${userId}) déconnecté`);
      }
    } catch (error) {
      console.error("❌ Erreur déconnexion:", error);
    }
  }

  // ✅ MÉTHODE D'AUTHENTIFICATION CORRIGÉE
  async handleAuthentication(socket, data) {
    try {
      console.log(`🔐 Authentification demande:`, data);

      // ✅ 1. Authentification via token JWT si présent
      let userPayload = null;
      if (data.token) {
        try {
          // Simule une requête pour réutiliser le middleware
          const fakeReq = {
            headers: { authorization: `Bearer ${data.token}` },
          };
          const fakeRes = {};
          await new Promise((resolve, reject) => {
            AuthMiddleware.authenticate(fakeReq, fakeRes, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
          if (fakeReq.user) {
            userPayload = fakeReq.user;
          } else {
            socket.emit("auth_error", {
              message: "Token JWT invalide ou expiré",
              code: "INVALID_TOKEN",
            });
            return;
          }
        } catch (jwtError) {
          socket.emit("auth_error", {
            message: "Token JWT invalide ou expiré",
            code: "INVALID_TOKEN",
          });
          return;
        }
      } else {
        // ✅ 2. Authentification fallback par données explicites (userId/matricule)
        if (!data.userId && !data.matricule) {
          socket.emit("auth_error", {
            message: "Données d'authentification manquantes",
            code: "MISSING_CREDENTIALS",
          });
          return;
        }
        userPayload = {
          id: String(data.matricule),
          userId: String(data.userId),
          matricule: String(data.matricule),
          nom: data.nom || "",
          prenom: data.prenom || "",
          ministere: data.ministere || "",
        };
      }

      // ✅ 3. Stocker les infos dans la socket
      socket.userId = userPayload.id || userPayload.userId;
      socket.matricule = userPayload.matricule || "";
      socket.nom = userPayload.nom || "";
      socket.prenom = userPayload.prenom || "";
      socket.ministere = userPayload.ministere || "";
      socket.isAuthenticated = true;

      // ✅ DONNÉES UTILISATEUR POUR LES COLLECTIONS
      const userIdString = socket.matricule; // Utiliser matricule comme userId
      const matriculeString = socket.matricule;

      const userData = {
        socketId: socket.id,
        // socketId: socket.matriculeString,
        matricule: matriculeString,
        connectedAt: new Date(),
        lastActivity: new Date(),
        token: data.token,
      };

      // ✅ REJOINDRE UNE SALLE UTILISATEUR
      socket.join(`user_${userIdString}`);

      let conversationIds = []; // ✅ INITIALISER À UN TABLEAU VIDE AU LIEU DE null

      // 1. Rejoindre toutes les rooms de conversations de l'utilisateur
      if (this.getConversationIdsUseCase) {
        try {
          conversationIds = await this.getConversationIdsUseCase.execute(
            userIdString
          );

          // ✅ VÉRIFIER QUE conversationIds EST UN TABLEAU
          if (!Array.isArray(conversationIds)) {
            console.warn(
              `⚠️ conversationIds n'est pas un tableau:`,
              typeof conversationIds,
              conversationIds
            );
            conversationIds = []; // ✅ FALLBACK À TABLEAU VIDE
          }

          console.log(
            `✅ Récupération ${conversationIds.length} conversations pour ${userIdString}`
          );

          if (conversationIds.length > 0) {
            for (const convId of conversationIds) {
              // 1. D'abord rejoindre la room
              const roomName = `conversation_${convId}`;
              socket.join(roomName);
              console.log(
                `👥 Utilisateur ${userIdString} rejoint room ${roomName}`
              );

              // 2. Rejoindre la room dans Redis RoomManager
              if (
                this.roomManager &&
                typeof this.roomManager.addUserToRoom === "function"
              ) {
                try {
                  await this.roomManager.addUserToRoom(roomName, userIdString, {
                    matricule: matriculeString,
                    joinedAt: new Date(),
                    conversationId: convId,
                  });
                } catch (roomError) {
                  console.warn(
                    `⚠️ Erreur ajout utilisateur à room ${roomName}:`,
                    roomError.message
                  );
                }
              }

              // 3. Marquer les messages comme DELIVERED automatiquement
              if (this.updateMessageStatusUseCase) {
                try {
                  const result = await this.updateMessageStatusUseCase.execute({
                    conversationId: convId,
                    receiverId: userIdString,
                    status: "DELIVERED",
                    messageIds: null,
                  });

                  if (result?.modifiedCount > 0) {
                    console.log(
                      `✅ ${result.modifiedCount} messages marqués DELIVERED dans ${convId}`
                    );
                  }
                } catch (deliveredError) {
                  console.warn(
                    `⚠️ Erreur marquage delivered pour ${convId}:`,
                    deliveredError.message
                  );
                }
              }

              // 4. Gérer la room dans Redis via RoomManager
              if (
                this.roomManager &&
                typeof this.roomManager.createRoom === "function"
              ) {
                try {
                  await this.roomManager.createRoom(roomName, {
                    type: "CONVERSATION",
                    description: `Room pour conversation ${convId}`,
                    isPrivate: true,
                    maxUsers: 100,
                  });
                } catch (createRoomError) {
                  console.warn(
                    `⚠️ Erreur création room ${roomName}:`,
                    createRoomError.message
                  );
                }
              }
            }
          } else {
            console.log(
              `ℹ️ Aucune conversation existante pour ${userIdString}`
            );
          }
        } catch (convError) {
          console.warn(
            `⚠️ Erreur récupération conversations pour ${userIdString}:`,
            convError.message
          );
          // ✅ NE PAS FAIRE ÉCHOUER L'AUTHENTIFICATION
          conversationIds = [];
        }
      }

      // 2. Rejoindre la room ministère (si renseigné)
      if (socket.ministere) {
        const ministereRoom = `ministere_${socket.ministere
          .replace(/\s+/g, "_")
          .toLowerCase()}`;
        socket.join(ministereRoom);
        console.log(
          `🏛️ Utilisateur ${userIdString} rejoint room ministère: ${ministereRoom}`
        );

        if (
          this.roomManager &&
          typeof this.roomManager.createRoom === "function"
        ) {
          this.roomManager
            .createRoom(ministereRoom, {
              type: "MINISTERE",
              description: `Room pour le ministère ${socket.ministere}`,
              isPrivate: false,
              maxUsers: 1000,
            })
            .catch((error) => {
              console.warn(
                `⚠️ Erreur création room ministère dans Redis:`,
                error.message
              );
            });
        }
      }

      // 2. Rejoindre la room département (si renseigné)
      if (socket.departement) {
        const departementRoom = `departement_${socket.departement
          .replace(/\s+/g, "_")
          .toLowerCase()}`;
        socket.join(departementRoom);
        console.log(
          `🏢 Utilisateur ${userIdString} rejoint room département: ${departementRoom}`
        );

        if (
          this.roomManager &&
          typeof this.roomManager.createRoom === "function"
        ) {
          this.roomManager
            .createRoom(departementRoom, {
              type: "DEPARTEMENT",
              description: `Room pour le département ${socket.departement}`,
              isPrivate: false,
              maxUsers: 1000,
            })
            .catch((error) => {
              console.warn(
                `⚠️ Erreur création room département dans Redis:`,
                error.message
              );
            });
        }
      }

      // ✅ CONFIRMER L'AUTHENTIFICATION
      socket.emit("authenticated", {
        success: true,
        userId: userIdString,
        matricule: matriculeString,
        nom: socket.nom,
        prenom: socket.prenom,
        ministere: socket.ministere,
        autoJoinedConversations: conversationIds.length, // ✅ MAINTENANT SÛREMENT UN NOMBRE
        timestamp: new Date().toISOString(),
      });

      console.log(
        `✅ Utilisateur authentifié: ${matriculeString} (${userIdString})`
      );

      // ✅ SYNC AVEC REDIS AVEC GESTION D'ERREURS
      this.syncUserWithRedis(userIdString, userData);

      // ✅ NOTIFIER LES AUTRES UTILISATEURS
      socket.broadcast.emit("user_connected", {
        userId: userIdString,
        matricule: matriculeString,
        timestamp: new Date().toISOString(),
      });

      // Après avoir authentifié l'utilisateur et stocké socket.userId, socket.matricule, etc.

      const userId = socket.userId;

      // Si le consumer utilisateur est disponible, le créer
      if (this.userConsumerManager) {
        try {
          // Référence vers le ChatHandler pour accéder aux use-cases
          socket.chatHandler = this;

          await this.userConsumerManager.createUserConsumer(userId, socket);
          console.log(`✅ Consumer personnel configuré pour ${userId}`);
        } catch (error) {
          console.warn(
            "⚠️ Erreur création consumer utilisateur:",
            error.message
          );
        }
      }
    } catch (error) {
      console.error("❌ Erreur authentification WebSocket:", error);
      socket.emit("auth_error", {
        message: "Erreur d'authentification",
        code: "AUTH_ERROR",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  // ✅ MÉTHODE SYNC REDIS CORRIGÉE
  async syncUserWithRedis(userId, userData) {
    if (this.onlineUserManager) {
      try {
        // ✅ S'ASSURER QUE TOUS LES TYPES SONT CORRECTS
        const sanitizedData = {
          socketId: userData.socketId ? String(userData.socketId) : null,
          matricule: userData.matricule
            ? String(userData.matricule)
            : "Unknown",
          connectedAt:
            userData.connectedAt instanceof Date
              ? userData.connectedAt
              : new Date(),
          lastActivity:
            userData.lastActivity instanceof Date
              ? userData.lastActivity
              : new Date(),
        };

        await this.onlineUserManager.setUserOnline(
          String(userId),
          sanitizedData
        );
        console.log(`✅ Utilisateur ${userId} synchronisé avec Redis`);
      } catch (error) {
        console.warn("⚠️ Erreur sync utilisateur Redis:", error.message);
      }
    }
  }

  // ✅ MÉTHODES PUBLIQUES POUR INDEX.JS
  async getConnectedUserCount() {
    if (this.userPresenceManager) {
      return await this.userPresenceManager.getOnlineUsersCount();
    }
    return 0;
  }

  async getStats() {
    if (this.onlineUserManager) {
      const totalOnline = await this.onlineUserManager.getOnlineUsersCount();
      return {
        connectedUsers: totalOnline,
        activeSockets: this.userSockets.size,
        timestamp: new Date().toISOString(),
      };
    }
    return {
      connectedUsers: this.connectedUsers.size,
      activeSockets: this.userSockets.size,
      timestamp: new Date().toISOString(),
    };
  }

  async getConnectedUsers() {
    if (this.userPresenceManager) {
      return await this.userPresenceManager.getOnlineUsers({
        withDetails: true,
        limit: 1000,
      });
    }
    return [];
  }

  async sendToUser(userId, event, data) {
    try {
      if (!this.userPresenceManager) {
        throw new Error("UserPresenceManager non disponible");
      }

      const isOnline = await this.userPresenceManager.isUserOnline(userId);

      if (isOnline) {
        this.io.to(`user_${userId}`).emit(event, data);
        return true;
      }

      // Gestion messages offline
      await this.handleOfflineMessage(userId, event, data);
      return false;
    } catch (error) {
      console.error(`❌ Erreur envoi à ${userId}:`, error);
      return false;
    }
  }

  async handleOfflineMessage(userId, event, data) {
    if (event === "newMessage" && data) {
      try {
        // Stocker dans Redis avec TTL
        const offlineKey = `offline:${userId}:messages`;
        const message = {
          ...data,
          event,
          timestamp: new Date().toISOString(),
        };

        if (this.redisClient) {
          await this.redisClient.lPush(offlineKey, JSON.stringify(message));
          await this.redisClient.expire(offlineKey, 7 * 24 * 3600); // 7 jours
        }

        console.log(`💾 Message offline stocké pour ${userId}`);
      } catch (error) {
        console.error("❌ Erreur stockage message offline:", error);
      }
    }
  }

  // ✅ MÉTHODES DE DIFFUSION
  broadcastToRoom(roomId, event, data) {
    try {
      this.io.to(`conversation_${roomId}`).emit(event, data);
      return true;
    } catch (error) {
      console.error(`❌ Erreur diffusion room ${roomId}:`, error);
      return false;
    }
  }

  broadcastToAll(event, data) {
    try {
      this.io.emit(event, data);
      return true;
    } catch (error) {
      console.error(`❌ Erreur diffusion globale:`, error);
      return false;
    }
  }

  // ✅ AJOUTER LA MÉTHODE handleSendMessage MANQUANTE
  async handleSendMessage(socket, data) {
    try {
      const {
        content,
        conversationId = "",
        type = "TEXT",
        receiverId = null,
        conversationName = null,
        duration,
        fileId,
        fileUrl,
        fileName,
        fileSize,
        mimeType,
        broadcast = false,
      } = data;
      const userId = socket.userId;
      const matricule = socket.matricule;

      console.log("💬 Traitement envoi message:", {
        userId: userId,
        matricule: matricule,
        conversationId: conversationId,
        contentLength: content ? content.length : 0,
        type: type,
        receiverId: receiverId, // ✅ AJOUT
      });

      if (!userId) {
        socket.emit("message_error", {
          message: "Authentification requise",
          code: "AUTH_REQUIRED",
        });
        return;
      }

      if (
        !content ||
        typeof content !== "string" ||
        content.trim().length === 0
      ) {
        socket.emit("message_error", {
          message: "Le contenu du message est requis",
          code: "MISSING_CONTENT",
        });
        return;
      }
      if (content.trim().length > 10000) {
        socket.emit("message_error", {
          message: "Le message ne peut pas dépasser 10000 caractères",
          code: "CONTENT_TOO_LONG",
        });
        return;
      }
      const forbiddenPattern = /<script|<\/script>/i;
      if (forbiddenPattern.test(content)) {
        socket.emit("message_error", {
          message: "Le contenu du message contient des caractères interdits",
          code: "CONTENT_FORBIDDEN",
        });
        return;
      }

      if (!conversationId && !receiverId) {
        socket.emit("message_error", {
          message: "ID de conversation requis",
          code: "MISSING_CONVERSATION_ID",
        });
        return;
      }

      if (conversationId !== "" && !this.isValidObjectId(conversationId)) {
        socket.emit("message_error", {
          message: "ID de conversation invalide",
          code: "INVALID_CONVERSATION_ID",
        });
        return;
      }

      // Validation receiverId
      if (receiverId) {
        if (Array.isArray(receiverId)) {
          if (receiverId.includes(userId)) {
            socket.emit("message_error", {
              message:
                "Vous ne pouvez pas vous ajouter vous-même comme destinataire",
              code: "INVALID_RECEIVER",
            });
            return;
          }
        } else if (receiverId === userId) {
          socket.emit("message_error", {
            message: "Vous ne pouvez pas vous envoyer un message à vous-même",
            code: "INVALID_RECEIVER",
          });
          return;
        }
        // Optionnel : vérifier existence receiverId dans la base
        // if (this.userRepository && typeof this.userRepository.exists === "function") {
        //   const exists = await this.userRepository.exists(receiverId);
        //   if (!exists) {
        //     socket.emit("message_error", {
        //       message: "Destinataire introuvable",
        //       code: "RECEIVER_NOT_FOUND",
        //     });
        //     return;
        //   }
        // }
      }

      // ✅ CRÉER LE MESSAGE AVEC DONNÉES ENRICHIES
      const message = {
        id: this.generateObjectId(),
        content: content.trim(),
        senderId: userId,
        senderMatricule: matricule,
        conversationId: conversationId,
        type: type,
        timestamp: new Date().toISOString(),
        status: "SENT",
      };

      // Création de groupe ou diffusion si receiverId est un tableau
      let conversation = null;
      let conversationType = "PRIVATE";
      if (Array.isArray(receiverId) && receiverId.length > 1) {
        if (broadcast && this.createBroadcastUseCase) {
          conversationType = "BROADCAST";
          conversation = await this.createBroadcastUseCase.execute({
            broadcastId: conversationId,
            name: conversationName || "Liste de diffusion",
            adminIds: [userId],
            recipientIds: receiverId.filter((id) => id !== userId),
          });
        } else if (this.createGroupUseCase) {
          conversationType = "GROUP";
          conversation = await this.createGroupUseCase.execute({
            groupId: conversationId,
            name: conversationName || "Groupe",
            adminId: userId,
            members: receiverId.filter((id) => id !== userId),
          });
        } else {
          socket.emit("message_error", {
            message: "Service de création de groupe/diffusion non disponible",
            code: "GROUP_OR_BROADCAST_CREATION_UNAVAILABLE",
          });
          return;
        }
      }

      // Si conversation n'a pas été créée, fallback sur SendMessage
      let result;
      if (!conversation) {
        result = await this.sendMessageUseCase.execute({
          content,
          senderId: userId,
          conversationId,
          type,
          receiverId,
          duration: duration,
          fileId: fileId,
          fileName: fileName,
          fileUrl: fileUrl,
          fileSize: fileSize,
          mimeType: mimeType,
          conversationName,
          broadcast,
        });
        conversationType = result?.conversation?.type || conversationType;
        conversation = result?.conversation;
      } else {
        result = await this.sendMessageUseCase.execute({
          content,
          senderId: userId,
          conversationId: conversation._id,
          type,
          receiverId: null,
          duration: duration,
          fileId: fileId,
          fileName: fileName,
          fileUrl: fileUrl,
          fileSize: fileSize,
          mimeType: mimeType,
          conversationName: conversation.name,
          broadcast,
        });
      }

      socket.emit("newMessage", {
        messageId: message.id,
        conversationId: conversation.id,
        content: message.content,
        senderId: message.senderId,
        type: message.type,
        timestamp: message.timestamp,
        fileData: { fileId, fileUrl, fileName, fileSize, mimeType },
      });

      // Logique pour chaque type de conversation
      if (conversation.type === "BROADCAST") {
        if (
          !conversation.settings ||
          !Array.isArray(conversation.settings.broadcastAdmins) ||
          !conversation.settings.broadcastAdmins.includes(userId)
        ) {
          socket.emit("message_error", {
            message:
              "Seuls les admins peuvent envoyer dans une liste de diffusion",
            code: "NOT_BROADCAST_ADMIN",
          });
          return;
        }
        if (
          !conversation.settings ||
          !Array.isArray(conversation.settings.broadcastRecipients)
        ) {
          socket.emit("message_error", {
            message: "Aucun destinataire dans la liste de diffusion",
            code: "NO_BROADCAST_RECIPIENTS",
          });
          return;
        }
        for (const recipientId of conversation.settings.broadcastRecipients) {
          this.sendToUser(recipientId, "newMessage", message);
        }
      } else if (conversation.type === "GROUP") {
        if (typeof this.broadcastToRoom === "function") {
          this.broadcastToRoom(conversationId, "newMessage", message);
        } else {
          socket.emit("message_error", {
            message: "Méthode broadcastToRoom non disponible",
            code: "METHOD_MISSING",
          });
        }
      } else if (conversation.type === "PRIVATE") {
        // Vérifier que les participants existent et que le destinataire est bien dans la conversation
        if (
          !Array.isArray(conversation.participants) ||
          conversation.participants.length !== 2
        ) {
          socket.emit("message_error", {
            message: "Conversation privée invalide",
            code: "INVALID_PRIVATE_CONVERSATION",
          });
          return;
        }
        // Déterminer l'autre participant
        const otherParticipant = conversation.participants.find(
          (id) => id !== userId
        );
        if (!otherParticipant) {
          socket.emit("message_error", {
            message: "Destinataire introuvable dans la conversation",
            code: "PRIVATE_RECIPIENT_NOT_FOUND",
          });
          return;
        }
        if (typeof this.sendToUser === "function") {
          this.sendToUser(otherParticipant, "newMessage", message);
        } else {
          socket.emit("message_error", {
            message: "Méthode sendToUser non disponible",
            code: "METHOD_MISSING",
          });
        }
      } else {
        socket.emit("message_error", {
          message: "Type de conversation non supporté",
          code: "UNSUPPORTED_CONVERSATION_TYPE",
        });
        return;
      }

      // ✅ PUBLIER VIA KAFKA SI DISPONIBLE
      if (
        this.messageProducer &&
        typeof this.messageProducer.publishMessage === "function"
      ) {
        // Publication Kafka avec gestion avancée des erreurs
        let kafkaSuccess = false;
        let kafkaError = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await this.messageProducer.publishMessage({
              eventType: "MESSAGE_SENT",
              messageId: message.id,
              senderId: message.senderId,
              conversationId: message.conversationId,
              content: message.content,
              timestamp: new Date().toISOString(),
            });
            kafkaSuccess = true;
            break;
          } catch (err) {
            kafkaError = err;
            console.warn(
              `⚠️ Erreur publication Kafka (tentative ${attempt}):`,
              err.message
            );
            await new Promise((res) => setTimeout(res, 500 * attempt)); // backoff
          }
        }

        if (!kafkaSuccess) {
          // Stocker le message pour retry ultérieur (exemple avec Redis)
          if (this.redisClient) {
            try {
              await this.redisClient.lPush(
                "pending:kafka:messages",
                JSON.stringify({
                  message,
                  error: kafkaError ? kafkaError.message : "Unknown error",
                  timestamp: new Date().toISOString(),
                })
              );
              console.warn(
                "⚠️ Message stocké temporairement pour retry Kafka",
                message.id
              );
            } catch (redisError) {
              console.error(
                "❌ Erreur stockage temporaire message Kafka:",
                redisError.message
              );
            }
          }
          socket.emit("kafka_error", {
            message: "Erreur Kafka, message stocké pour retry",
            code: "KAFKA_PUBLISH_FAILED",
            details: kafkaError ? kafkaError.message : undefined,
          });
        }
      }

      socket.emit("message_sent", {
        messageId: result.message.id,
        status: "sent",
        timestamp: result.message.timestamp,
        conversationType: conversationType,
        conversationId: result.conversation.id,
        requiresReceipts: true,
      });

      if (result && this.getConversationUseCase) {
        try {
          // Récupérer la conversation avec findById du MongoConversationRepository
          const conversationResult = await this.getConversationUseCase.execute(
            result.conversation._id || result.conversation.id, // Utiliser _id ou id
            userId,
            false // Ne pas utiliser le cache pour avoir les données à jour
          );

          if (conversationResult) {
            // Construire l'objet conversation avec le dernier message
            const conversation = {
              ...conversationResult,
              lastMessage: {
                _id: result.message._id,
                content: result.message.content,
                senderId: result.message.senderId,
                type: result.message.type,
                timestamp: result.message.createdAt || new Date(),
              },
            };

            // Émettre la mise à jour aux participants de la conversation
            const roomId = `conversation_${conversation._id}`;
            this.io.to(roomId).emit("conversationUpdate", {
              conversation,
              metadata: {
                event: "NEW_MESSAGE",
                timestamp: new Date().toISOString(),
              },
            });

            // Log de succès
            console.log(
              `✅ Conversation ${conversation._id} mise à jour avec message ${result.message._id}`
            );

            // Notifier individuellement chaque participant
            if (Array.isArray(conversation.participants)) {
              conversation.participants.forEach((participantId) => {
                this.io
                  .to(`user_${participantId}`)
                  .emit("conversationsUpdated", {
                    type: "NEW_MESSAGE",
                    conversationId: conversation._id,
                    timestamp: new Date().toISOString(),
                  });
              });
            }
          }
        } catch (error) {
          console.error("❌ Erreur mise à jour conversation:", error);
        }
      }

      console.log(
        `✅ Message diffusé avec tracking pour conversation ${conversationId}`
      );
    } catch (error) {
      console.error("❌ Erreur handleSendMessage:", error);

      socket.emit("message_error", {
        message: "Erreur lors de l'envoi du message",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "SEND_ERROR",
      });
    }
  }

  // ✅ AJOUTER MÉTHODE DE VALIDATION D'OBJECTID
  isValidObjectId(id) {
    if (!id || typeof id !== "string") return false;
    // Vérifier que c'est un ObjectId MongoDB valide (24 caractères hexadécimaux)
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  // ✅ AJOUTER MÉTHODE DE GÉNÉRATION D'OBJECTID
  generateObjectId() {
    // Générer un ObjectId MongoDB valide
    const timestamp = Math.floor(Date.now() / 1000)
      .toString(16)
      .padStart(8, "0");
    const machineId = Math.floor(Math.random() * 16777216)
      .toString(16)
      .padStart(6, "0");
    const processId = Math.floor(Math.random() * 65536)
      .toString(16)
      .padStart(4, "0");
    const counter = Math.floor(Math.random() * 16777216)
      .toString(16)
      .padStart(6, "0");

    return timestamp + machineId + processId + counter;
  }

  // ✅ AJOUTER handleJoinConversation
  async handleJoinConversation(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      if (!conversationId || !userId) {
        socket.emit("conversation_error", {
          message: "ID conversation ou utilisateur manquant",
          code: "MISSING_DATA",
        });
        return;
      }

      const roomName = `conversation_${conversationId}`;

      // 3. Mark read (seulement cette conv)
      if (this.updateMessageStatusUseCase) {
        try {
          const result = await this.updateMessageStatusUseCase.execute({
            conversationId,
            receiverId: userId,
            status: "READ",
            messageIds: null, // Tous non lus
          });
          console.log(
            `✅ ${
              result?.modifiedCount || 0
            } messages marqués lus dans conversation ${conversationId}`
          );
        } catch (deliveredError) {
          console.warn(`⚠️ Erreur marquage delivered:`, deliveredError.message);
        }
      }

      // 4. Renew presence (déjà fait via socket.on, mais double safety)
      if (this.onlineUserManager) {
        try {
          await this.onlineUserManager.updateLastActivity(userId);
          console.log(`✅ Présence renouvelée pour ${userId}`);
        } catch (presenceError) {
          console.warn(
            `⚠️ Erreur renouvellement présence:`,
            presenceError.message
          );
        }
      }

      // 5. Notifier les participants
      this.io.to(roomName).emit("messagesRead", {
        conversationId,
        userId,
        count: result.modifiedCount,
        timestamp: new Date().toISOString(),
      });

      // 6. Confirmer à l'utilisateur
      socket.emit("conversation_joined", {
        conversationId,
        timestamp: new Date().toISOString(),
      });

      console.log(
        `✅ ${socket.matricule} a rejoint la conversation ${conversationId}`
      );
    } catch (error) {
      console.error("❌ Erreur handleJoinConversation:", error);
      socket.emit("conversation_error", {
        message: "Erreur lors de la connexion à la conversation",
        code: "JOIN_ERROR",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  // ✅ AJOUTER handleLeaveConversation
  async handleLeaveConversation(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      if (!conversationId || !userId) return;

      // Quitter la room de la conversation
      socket.leave(`conversation_${conversationId}`);

      // Notifier les autres participants
      socket
        .to(`conversation_${conversationId}`)
        .emit("user_left_conversation", {
          userId: userId,
          matricule: socket.matricule,
          conversationId: conversationId,
          timestamp: new Date().toISOString(),
        });

      console.log(
        `👋 Utilisateur ${socket.matricule} a quitté conversation ${conversationId}`
      );
    } catch (error) {
      console.error("❌ Erreur handleLeaveConversation:", error);
    }
  }

  // ✅ AJOUTER handleTyping
  handleTyping(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      console.log("📝 Traitement de l'indicateur de frappe");

      if (!conversationId || !userId) return;

      // Diffuser l'indicateur de frappe aux autres participants
      socket.to(`conversation_${conversationId}`).emit("userTyping", {
        userId: userId,
        matricule: socket.matricule,
        conversationId: conversationId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Erreur handleTyping:", error);
    }
  }

  // ✅ AJOUTER handleStopTyping
  handleStopTyping(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      console.log("✋ Traitement de l'arrêt de frappe");

      if (!conversationId || !userId) return;

      // Diffuser l'arrêt de frappe aux autres participants
      socket.to(`conversation_${conversationId}`).emit("userStoppedTyping", {
        userId: userId,
        matricule: socket.matricule,
        conversationId: conversationId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Erreur handleStopTyping:", error);
    }
  }

  // ✅ AJOUTER handleGetOnlineUsers
  handleGetOnlineUsers(socket, data) {
    try {
      const onlineUsers = this.getConnectedUsers(data);

      socket.emit("onlineUsers", {
        users: onlineUsers,
        count: onlineUsers.length,
        timestamp: new Date().toISOString(),
      });

      console.log(
        `📋 Envoi de ${onlineUsers.length} utilisateurs en ligne à ${socket.matricule}`
      );
    } catch (error) {
      console.error("❌ Erreur handleGetOnlineUsers:", error);
    }
  }

  // ========================================
  // GESTION DES STATUTS DE MESSAGES
  // ========================================

  /**
   * Marquer un message comme livré (DELIVERED)
   */
  async handleMarkMessageDelivered(socket, data) {
    try {
      const { messageId, conversationId } = data;
      const userId = socket.userId;

      if (!messageId || !userId) {
        socket.emit("status_error", {
          message: "ID message ou utilisateur manquant",
          code: "MISSING_DATA",
          type: "delivered",
        });
        return;
      }

      console.log(
        `📬 Marquage livré: message ${messageId} par utilisateur ${userId}`
      );

      // ✅ VÉRIFIER QUE LE USE CASE EST DISPONIBLE
      if (!this.updateMessageStatusUseCase) {
        console.warn(
          "⚠️ UpdateMessageStatusUseCase non disponible - mode dégradé"
        );
        this._handleDeliveredDegradedMode(socket, {
          messageId,
          conversationId,
          userId,
        });
        return;
      }

      // ✅ VÉRIFIER QUE LA MÉTHODE EXISTE
      if (
        typeof this.updateMessageStatusUseCase.markSingleMessage !== "function"
      ) {
        console.error(
          "❌ Méthode markSingleMessage non disponible dans UpdateMessageStatusUseCase"
        );
        socket.emit("status_error", {
          message: "Service de mise à jour de statut non disponible",
          code: "SERVICE_UNAVAILABLE",
          type: "delivered",
        });
        return;
      }

      try {
        // ✅ UTILISER LE USE CASE AVEC GESTION D'ERREUR ROBUSTE
        const result = await this.updateMessageStatusUseCase.markSingleMessage({
          messageId: messageId,
          receiverId: userId,
          status: "DELIVERED",
        });

        if (result && result.modifiedCount > 0) {
          console.log(`✅ Message ${messageId} marqué comme livré avec succès`);

          // ✅ NOTIFIER L'EXPÉDITEUR
          this.io
            .to(`conversation_${conversationId}`)
            .emit("messageStatusChanged", {
              messageId: messageId,
              status: "DELIVERED",
              userId: userId,
              timestamp: new Date().toISOString(),
            });

          // ✅ CONFIRMER AU DESTINATAIRE
          socket.emit("messageDelivered", {
            messageId: messageId,
            status: "DELIVERED",
            timestamp: new Date().toISOString(),
          });
        } else {
          console.log(
            `ℹ️ Message ${messageId} déjà marqué comme livré ou non trouvé`
          );

          // ✅ ENVOYER QUAND MÊME UNE CONFIRMATION
          socket.emit("messageDelivered", {
            messageId: messageId,
            status: "DELIVERED",
            timestamp: new Date().toISOString(),
            note: "Déjà marqué comme livré",
          });
        }
      } catch (useCaseError) {
        console.error(`❌ Erreur Use Case delivered:`, {
          error: useCaseError.message,
          messageId,
          userId,
          stack: useCaseError.stack,
        });

        // ✅ FALLBACK EN MODE DÉGRADÉ
        console.log("🔄 Basculement en mode dégradé pour la livraison");
        this._handleDeliveredDegradedMode(socket, {
          messageId,
          conversationId,
          userId,
        });
      }
    } catch (error) {
      console.error("❌ Erreur handleMarkMessageDelivered:", error);
      socket.emit("status_error", {
        message: "Erreur marquage livré",
        code: "DELIVERED_ERROR",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  // ✅ AJOUTER UNE MÉTHODE DE MODE DÉGRADÉ
  _handleDeliveredDegradedMode(socket, { messageId, conversationId, userId }) {
    console.log("⚠️ Mode dégradé: notification socket uniquement");

    // ✅ NOTIFIER VIA SOCKET SEULEMENT
    if (conversationId) {
      this.io
        .to(`conversation_${conversationId}`)
        .emit("messageStatusChanged", {
          messageId: messageId,
          status: "DELIVERED",
          userId: userId,
          timestamp: new Date().toISOString(),
          degraded: true,
        });
    }

    socket.emit("messageDelivered", {
      messageId: messageId,
      status: "DELIVERED",
      timestamp: new Date().toISOString(),
      degraded: true,
      note: "Mode dégradé - notification uniquement",
    });
  }

  /**
   * Marquer un message comme lu (READ)
   */
  async handleMarkMessageRead(socket, data) {
    try {
      const { messageId, conversationId } = data;
      const userId = socket.userId;

      if (!messageId || !userId) {
        socket.emit("status_error", {
          message: "ID message ou utilisateur manquant",
          code: "MISSING_DATA",
          type: "read",
        });
        return;
      }

      console.log(
        `📖 Marquage lu: message ${messageId} par utilisateur ${userId}`
      );

      try {
        const result = await this.updateMessageStatusUseCase.markSingleMessage({
          messageId: messageId,
          receiverId: userId,
          status: "READ",
          conversationId,
        });

        if (result && result.modifiedCount > 0) {
          console.log(`✅ Message ${messageId} marqué comme lu avec succès`);

          // ✅ NOTIFIER L'EXPÉDITEUR (ACCUSÉ DE LECTURE)
          this.io
            .to(`conversation_${conversationId}`)
            .emit("messageStatusChanged", {
              messageId: messageId,
              status: "READ",
              userId: userId,
              timestamp: new Date().toISOString(),
            });

          // ✅ CONFIRMER AU LECTEUR
          socket.emit("messageRead", {
            messageId: messageId,
            status: "READ",
            timestamp: new Date().toISOString(),
          });

          // ✅ PUBLIER ÉVÉNEMENT KAFKA
          if (
            this.messageProducer &&
            typeof this.messageProducer.publishMessage === "function"
          ) {
            try {
              await this.messageProducer.publishMessage({
                eventType: "MESSAGE_READ",
                messageId: messageId,
                readBy: userId,
                conversationId: conversationId,
                timestamp: new Date().toISOString(),
                source: "chat-handler",
              });
              console.log(`📤 Événement MESSAGE_READ publié`);
            } catch (kafkaError) {
              console.warn("⚠️ Erreur publication Kafka:", kafkaError.message);
            }
          }
        } else {
          console.log(
            `ℹ️ Message ${messageId} déjà marqué comme lu ou non trouvé`
          );

          socket.emit("messageRead", {
            messageId: messageId,
            status: "READ",
            timestamp: new Date().toISOString(),
            note: "Déjà marqué comme lu",
          });
        }
      } catch (useCaseError) {
        console.error(`❌ Erreur Use Case read:`, useCaseError.message);
        this._handleReadDegradedMode(socket, {
          messageId,
          conversationId,
          userId,
        });
      }
    } catch (error) {
      console.error("❌ Erreur handleMarkMessageRead:", error);
      socket.emit("status_error", {
        message: "Erreur marquage lu",
        code: "READ_ERROR",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  // ✅ AJOUTER UNE MÉTHODE DE MODE DÉGRADÉ POUR LA LECTURE
  _handleReadDegradedMode(socket, { messageId, conversationId, userId }) {
    console.log("⚠️ Mode dégradé lecture: notification socket uniquement");

    if (conversationId) {
      this.io
        .to(`conversation_${conversationId}`)
        .emit("messageStatusChanged", {
          messageId: messageId,
          status: "READ",
          userId: userId,
          timestamp: new Date().toISOString(),
          degraded: true,
        });
    }

    socket.emit("messageRead", {
      messageId: messageId,
      status: "READ",
      timestamp: new Date().toISOString(),
      degraded: true,
      note: "Mode dégradé - notification uniquement",
    });
  }

  /**
   * Marquer toute une conversation comme lue
   */
  async handleMarkConversationRead(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      if (!conversationId || !userId) {
        socket.emit("status_error", {
          message: "ID conversation ou utilisateur manquant",
          code: "MISSING_DATA",
          type: "conversation_read",
        });
        return;
      }

      console.log(
        `📚 Marquage conversation comme lue: ${conversationId} par ${userId}`
      );

      // ✅ VÉRIFIER QUE LE USE CASE EST DISPONIBLE
      if (!this.updateMessageStatusUseCase) {
        console.warn(
          "⚠️ UpdateMessageStatusUseCase non disponible - mode dégradé"
        );
        socket.emit("conversationMarkedRead", {
          conversationId: conversationId,
          readCount: 0,
          degraded: true,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      try {
        // 1. Récupérer tous les messages non lus de la conversation
        const messages = await this.getMessagesUseCase.execute(conversationId, {
          page: 1,
          limit: 100,
          userId,
        });

        // Vérifier si messages est un tableau ou un objet avec .messages
        const messagesList = Array.isArray(messages)
          ? messages
          : messages.messages;

        if (messagesList && messagesList.length > 0) {
          // 2. Mettre à jour chaque message en tant que "LU"
          const messageIds = messagesList.map((msg) => msg.id || msg._id);
          const result = await this.updateMessageStatusUseCase.execute({
            conversationId,
            receiverId: userId,
            status: "READ",
            messageIds,
          });

          console.log(
            `✅ ${result.modifiedCount} messages marqués comme lus dans la conversation ${conversationId}`
          );

          // ✅ NOTIFIER L'EXPÉDITEUR ET LES PARTICIPANTS
          this.io
            .to(`conversation_${conversationId}`)
            .emit("messageStatusChanged", {
              messageId: messageIds,
              status: "READ",
              userId: userId,
              timestamp: new Date().toISOString(),
            });
        } else {
          console.log(
            `ℹ️ Aucun nouveau message à marquer comme lu dans ${conversationId}`
          );
          socket.emit("conversationMarkedRead", {
            conversationId: conversationId,
            readCount: 0,
            message: "Tous les messages étaient déjà lus",
            timestamp: new Date().toISOString(),
          });
        }
      } catch (useCaseError) {
        console.error(
          `❌ Erreur Use Case conversation read:`,
          useCaseError.message
        );
        socket.emit("status_error", {
          message: "Erreur marquage conversation",
          code: "CONVERSATION_READ_ERROR",
          type: "conversation_read",
        });
      }
    } catch (error) {
      console.error("❌ Erreur handleMarkConversationRead:", error);
      socket.emit("status_error", {
        message: "Erreur marquage conversation",
        code: "CONVERSATION_READ_ERROR",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  /**
   * Obtenir le statut d'un message
   */
  async handleGetMessageStatus(socket, data) {
    try {
      const { messageId } = data;

      if (!messageId) {
        socket.emit("status_error", {
          message: "ID message manquant",
          code: "MISSING_MESSAGE_ID",
          type: "get_status",
        });
        return;
      }

      console.log(`📊 Demande statut pour message: ${messageId}`);

      // ✅ UTILISER LE REPOSITORY POUR RÉCUPÉRER LE STATUT
      if (this.messageRepository) {
        try {
          const message = await this.messageRepository.findById(messageId);

          if (message) {
            const statusInfo = {
              messageId: messageId,
              status: message.status,
              deliveredAt: message.metadata?.deliveryMetadata?.deliveredAt,
              readAt: message.metadata?.deliveryMetadata?.readAt,
              timestamp: new Date().toISOString(),
            };

            socket.emit("messageStatus", statusInfo);
            console.log(
              `✅ Statut envoyé pour message ${messageId}: ${message.status}`
            );
          } else {
            socket.emit("status_error", {
              message: "Message introuvable",
              code: "MESSAGE_NOT_FOUND",
              messageId: messageId,
              type: "get_status",
            });
          }
        } catch (repoError) {
          console.error(`❌ Erreur repository get status:`, repoError.message);
          socket.emit("status_error", {
            message: "Erreur récupération statut",
            code: "REPO_ERROR",
            type: "get_status",
          });
        }
      } else {
        socket.emit("status_error", {
          message: "Repository non disponible",
          code: "NO_REPOSITORY",
          type: "get_status",
        });
      }
    } catch (error) {
      console.error("❌ Erreur handleGetMessageStatus:", error);
      socket.emit("status_error", {
        message: "Erreur récupération statut",
        code: "GET_STATUS_ERROR",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  /**
   * Accusé de réception automatique d'un message
   */
  async handleMessageReceived(socket, data) {
    try {
      const { messageId, conversationId } = data;
      const userId = socket.userId;

      if (!messageId || !userId) {
        return; // Pas d'erreur pour cet événement automatique
      }

      console.log(
        `✅ Accusé de réception: message ${messageId} reçu par ${userId}`
      );

      // ✅ MARQUER AUTOMATIQUEMENT COMME LIVRÉ
      await this.handleMarkMessageDelivered(socket, {
        messageId: messageId,
        conversationId: conversationId,
      });
    } catch (error) {
      console.warn("⚠️ Erreur handleMessageReceived:", error.message);
      // Ne pas émettre d'erreur pour éviter de polluer l'interface
    }
  }

  // ✅ GESTIONNAIRE DE SUPPRESSION LOGIQUE DE MESSAGE
  async handleDeleteMessage(socket, data) {
    try {
      const { messageId } = data;
      const userId = socket.userId;

      if (!messageId || !userId) {
        socket.emit("status_error", {
          message: "ID message ou utilisateur manquant",
          code: "MISSING_DATA",
          type: "delete_message",
        });
        return;
      }

      if (
        !this.updateMessageStatusUseCase ||
        typeof this.updateMessageStatusUseCase.markSingleMessage !== "function"
      ) {
        socket.emit("status_error", {
          message: "Service de suppression non disponible",
          code: "SERVICE_UNAVAILABLE",
          type: "delete_message",
        });
        return;
      }

      // Marquer le message comme DELETED
      const result = await this.updateMessageStatusUseCase.markSingleMessage({
        messageId,
        receiverId: userId,
        status: "DELETED",
      });

      if (result && result.modifiedCount > 0) {
        socket.emit("messageDeleted", {
          messageId,
          code: "MISSING_DATA",
          type: "delete_file",
        });
        return;
      }

      // On suppose que le repository de fichiers est accessible via this.fileRepository
      if (
        !this.fileRepository ||
        typeof this.fileRepository.deleteFile !== "function"
      ) {
        socket.emit("status_error", {
          message: "Service de suppression de fichier non disponible",
          code: "SERVICE_UNAVAILABLE",
          type: "delete_file",
        });
        return;
      }

      // Marquer le fichier comme DELETED (soft delete)
      const deletedFile = await this.fileRepository.deleteFile(fileId, true);

      if (deletedFile && deletedFile.status === "DELETED") {
        socket.emit("fileDeleted", {
          fileId,
          status: "DELETED",
          timestamp: new Date().toISOString(),
        });
        // Notifier la conversation si besoin
        // this.io.to(`conversation_${deletedFile.conversationId}`).emit("fileDeleted", {...});
      } else {
        socket.emit("status_error", {
          message: "Fichier déjà supprimé ou introuvable",
          code: "ALREADY_DELETED",
          type: "delete_file",
        });
      }
    } catch (error) {
      console.error("❌ Erreur handleDeleteFile:", error);
      socket.emit("status_error", {
        message: "Erreur lors de la suppression du fichier",
        code: "DELETE_FILE_ERROR",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  // ✅ AJOUTER handleEditMessage
  async handleEditMessage(socket, data) {
    try {
      const { messageId, newContent } = data;
      const userId = socket.userId;

      if (!messageId || !newContent || !userId) {
        socket.emit("status_error", {
          message: "ID message, contenu ou utilisateur manquant",
          code: "MISSING_DATA",
          type: "edit_message",
        });
        return;
      }

      if (!this.updateMessageContentUseCase) {
        socket.emit("status_error", {
          message: "Service d'édition non disponible",
          code: "SERVICE_UNAVAILABLE",
          type: "edit_message",
        });
        return;
      }

      const updated = await this.updateMessageContentUseCase.execute({
        messageId,
        newContent,
        userId,
      });

      socket.emit("messageEdited", {
        messageId,
        newContent,
        editedAt: updated.editedAt,
        timestamp: new Date().toISOString(),
      });

      // Notifier la conversation si besoin
      this.io
        .to(`conversation_${updated.conversationId}`)
        .emit("messageEdited", {
          messageId,
          newContent,
          editedAt: updated.editedAt,
          timestamp: new Date().toISOString(),
        });
    } catch (error) {
      socket.emit("status_error", {
        message: "Erreur lors de l'édition du message",
        code: "EDIT_MESSAGE_ERROR",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  // ✅ Ajout de la méthode handleGetMessages
  async handleGetMessages(socket, data) {
    try {
      console.log("📥 Récupération des messages", data);
      const { conversationId, page = 1, limit = 50 } = data;
      const userId = socket.userId;

      if (!conversationId || !userId) {
        socket.emit("messages_error", {
          message: "ID conversation ou utilisateur manquant",
          code: "MISSING_DATA",
        });
        return;
      }

      if (!this.getMessagesUseCase) {
        socket.emit("messages_error", {
          message: "Service de récupération des messages non disponible",
          code: "SERVICE_UNAVAILABLE",
        });
        return;
      }

      const messages = await this.getMessagesUseCase.execute(conversationId, {
        page: parseInt(page),
        limit: parseInt(limit),
        userId,
      });

      console.log(
        `📄 Récupération de ${messages} messages pour conversation ${conversationId}`
      );

      socket.emit("messagesLoaded", messages);
    } catch (error) {
      console.error("❌ Erreur handleGetMessages:", error);
      socket.emit("messages_error", {
        message: "Erreur lors de la récupération des messages",
        code: "GET_MESSAGES_ERROR",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  // Récupérer toutes les conversations de l'utilisateur
  async handleGetConversations(socket, data) {
    try {
      const userId = socket.userId;
      const { page = 1, limit = 20, includeArchived = false } = data || {};

      if (!userId) {
        socket.emit("conversations_error", {
          message: "ID utilisateur manquant",
          code: "MISSING_USER_ID",
        });
        return;
      }

      if (!this.getConversationsUseCase) {
        socket.emit("conversations_error", {
          message: "Service de récupération des conversations non disponible",
          code: "SERVICE_UNAVAILABLE",
        });
        return;
      }

      const result = await this.getConversationsUseCase.execute(userId, true);

      console.log("📄 Récupération des conversations:", result.length);

      socket.emit("conversationsLoaded", {
        conversations: result.conversations || [],
        pagination: result.pagination || {},
        totalCount: result.pagination?.totalCount || 0,
        totalUnreadMessages: result.totalUnreadMessages || 0,
        unreadConversations: result.unreadConversations || 0,
        fromCache: result.fromCache || false,
        cachedAt: result.cachedAt || new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Erreur handleGetConversations:", error);
      socket.emit("conversations_error", {
        message: "Erreur lors de la récupération des conversations",
        code: "GET_CONVERSATIONS_ERROR",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  // Récupérer une conversation spécifique
  async handleGetConversation(socket, data) {
    try {
      const userId = socket.userId;
      const { conversationId } = data || {};

      if (!conversationId || !userId) {
        socket.emit("conversation_error", {
          message: "ID conversation ou utilisateur manquant",
          code: "MISSING_DATA",
        });
        return;
      }

      if (!this.getConversationUseCase) {
        socket.emit("conversation_error", {
          message: "Service de récupération de la conversation non disponible",
          code: "SERVICE_UNAVAILABLE",
        });
        return;
      }

      const result = await this.getConversationUseCase.execute(
        conversationId,
        userId,
        true
      );

      socket.emit("conversationLoaded", {
        conversation: result.conversation || result,
        metadata: {
          fromCache: result.fromCache || false,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("❌ Erreur handleGetConversation:", error);
      socket.emit("conversation_error", {
        message: "Erreur lors de la récupération de la conversation",
        code: "GET_CONVERSATION_ERROR",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
}

module.exports = ChatHandler;
