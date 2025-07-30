/**
 * Gestionnaire WebSocket pour le chat en temps réel
 * Responsable de la gestion des connexions, messages et événements socket
 */
const AuthMiddleware = require("../../interfaces/http/middleware/authMiddleware");
class ChatHandler {
  constructor(
    io,
    sendMessageUseCase = null,
    getMessagesUseCase = null,
    updateMessageStatusUseCase = null,
    messageProducer = null,
    redisClient = null,
    onlineUserManager = null,
    roomManager = null,
    getConversationIdsUseCase = null,
    getConversationUseCase = null,
    getConversationsUseCase = null,
    getMessageByIdUseCase = null,
    updateMessageContentUseCase = null,
    createGroupUseCase = null, // <-- Ajouté
    createBroadcastUseCase = null // <-- Ajouté
  ) {
    this.io = io;
    this.sendMessageUseCase = sendMessageUseCase;
    this.getMessagesUseCase = getMessagesUseCase;
    this.updateMessageStatusUseCase = updateMessageStatusUseCase;
    this.messageProducer = messageProducer;
    this.redisClient = redisClient;
    this.onlineUserManager = onlineUserManager;
    this.roomManager = roomManager;
    this.getConversationIdsUseCase = getConversationIdsUseCase;
    this.getConversationUseCase = getConversationUseCase;
    this.getConversationsUseCase = getConversationsUseCase;
    this.getMessageByIdUseCase = getMessageByIdUseCase;
    this.updateMessageContentUseCase = updateMessageContentUseCase;
    this.createGroupUseCase = createGroupUseCase; // <-- Ajouté
    this.createBroadcastUseCase = createBroadcastUseCase; // <-- Ajouté

    // Collections pour gérer les connexions
    this.connectedUsers = new Map();
    this.userSockets = new Map();

    console.log("🔌 ChatHandler initialisé avec:", {
      hasIO: !!io,
      hasSendMessage: !!sendMessageUseCase,
      hasUpdateMessageStatus: !!updateMessageStatusUseCase, // ✅ NOUVEAU
      hasMessageProducer: !!messageProducer,
      hasRedis: !!redisClient,
      hasUserManager: !!onlineUserManager,
      hasRoomManager: !!roomManager,
    });
  }

  // ✅ MÉTHODE SETUPSOCKETHANDLERS CORRIGÉE
  setupSocketHandlers() {
    try {
      console.log("🔌 Configuration des gestionnaires Socket.IO...");

      this.io.on("connection", (socket) => {
        console.log(`🔗 Nouvelle connexion WebSocket: ${socket.id}`);

        // ✅ ÉVÉNEMENTS D'AUTHENTIFICATION
        socket.on("authenticate", (data) => {
          // console.log("🔐 Demande d'authentification:", data);
          this.handleAuthentication(socket, data);
        });

        // ✅ ÉVÉNEMENTS DE CHAT
        socket.on("sendMessage", (data) => {
          console.log("💬 Envoi message:", data);
          this.handleSendMessage(socket, data);
        });

        socket.on("joinConversation", (data) => {
          console.log("👥 Rejoindre conversation:", data);
          this.handleJoinConversation(socket, data);
        });

        socket.on("leaveConversation", (data) => {
          console.log("👋 Quitter conversation:", data);
          this.handleLeaveConversation(socket, data);
        });

        // ✅ ÉVÉNEMENTS DE FRAPPE
        socket.on("typing", (data) => {
          this.handleTyping(socket, data);
        });

        socket.on("stopTyping", (data) => {
          this.handleStopTyping(socket, data);
        });

        // ✅ ÉVÉNEMENTS DE GESTION
        socket.on("getOnlineUsers", () => {
          this.handleGetOnlineUsers(socket);
        });

        socket.on("ping", () => {
          socket.emit("pong");
        });

        // ✅ NOUVEAUX ÉVÉNEMENTS POUR STATUTS DE MESSAGES
        socket.on("markMessageDelivered", (data) => {
          console.log("📬 Marquer message comme livré:", data);
          this.handleMarkMessageDelivered(socket, data);
        });

        socket.on("markMessageRead", (data) => {
          console.log("📖 Marquer message comme lu:", data);
          this.handleMarkMessageRead(socket, data);
        });

        socket.on("markConversationRead", (data) => {
          console.log("📚 Marquer conversation comme lue:", data);
          this.handleMarkConversationRead(socket, data);
        });

        socket.on("getMessageStatus", (data) => {
          console.log("📊 Demande statut message:", data);
          this.handleGetMessageStatus(socket, data);
        });

        // ✅ ÉVÉNEMENT POUR ACCUSÉ DE RÉCEPTION AUTOMATIQUE
        socket.on("messageReceived", (data) => {
          console.log("✅ Accusé de réception:", data);
          this.handleMessageReceived(socket, data);
        });

        // ✅ ÉVÉNEMENT DE DÉCONNEXION - CORRECTEMENT CONFIGURÉ
        socket.on("disconnect", (reason) => {
          console.log(
            `🔌 Déconnexion détectée: ${socket.id}, raison: ${reason}`
          );
          this.handleDisconnection(socket, reason);
        });

        // ✅ ÉVÉNEMENTS D'ERREUR
        socket.on("error", (error) => {
          console.error(`❌ Erreur Socket ${socket.id}:`, error);
        });

        // ✅ AJOUTER LES ÉVÉNEMENTS DE SUPPRESSION LOGIQUE
        socket.on("deleteMessage", (data) => {
          this.handleDeleteMessage(socket, data);
        });

        socket.on("deleteFile", (data) => {
          this.handleDeleteFile(socket, data);
        });

        // Dans setupSocketHandlers()
        socket.on("editMessage", (data) => {
          this.handleEditMessage(socket, data);
        });

        // ✅ Récupération des messages d'une conversation
        socket.on("getMessages", (data) => {
          this.handleGetMessages(socket, data);
        });

        // ✅ Récupération de toutes les conversations de l'utilisateur
        socket.on("getConversations", (data) => {
          this.handleGetConversations(socket, data);
        });

        // ✅ Récupération d'une conversation spécifique
        socket.on("getConversation", (data) => {
          this.handleGetConversation(socket, data);
        });
      });

      console.log("✅ Gestionnaires Socket.IO configurés");
    } catch (error) {
      console.error("❌ Erreur configuration Socket.IO:", error);
    }
  }

  // ✅ MÉTHODE DE DÉCONNEXION CORRIGÉE - GESTION SÉCURISÉE DU ROOMANAGER
  handleDisconnection(socket, reason = "unknown") {
    const userId = socket.userId;
    const matricule = socket.matricule;
    const socketId = socket.id;

    console.log(`🔌 Déconnexion utilisateur:`, {
      socketId: socketId,
      userId: userId,
      matricule: matricule,
      reason: reason,
      wasAuthenticated: !!userId,
    });

    try {
      // ✅ NETTOYAGE DES COLLECTIONS LOCALES
      if (userId) {
        // Supprimer de la collection des utilisateurs connectés
        const userData = this.connectedUsers.get(userId);
        if (userData) {
          console.log(
            `👤 Suppression utilisateur connecté: ${matricule} (${userId})`
          );
          this.connectedUsers.delete(userId);
        }

        // ✅ NETTOYAGE REDIS AVEC GESTION D'ERREURS
        if (this.onlineUserManager) {
          this.onlineUserManager
            .setUserOffline(userId)
            .then(() => {
              console.log(
                `✅ Utilisateur ${matricule} marqué hors ligne dans Redis`
              );
            })
            .catch((error) => {
              console.warn(
                `⚠️ Erreur nettoyage Redis pour ${userId}:`,
                error.message
              );
            });
        }

        // ✅ PUBLIER ÉVÉNEMENT KAFKA SEULEMENT SI MESSAGEPRODUCER DISPONIBLE
        if (
          this.messageProducer &&
          typeof this.messageProducer.publishMessage === "function"
        ) {
          const disconnectEvent = {
            eventType: "USER_DISCONNECTED",
            userId: userId,
            matricule: matricule,
            socketId: socketId,
            reason: reason,
            timestamp: new Date().toISOString(),
            source: "chat-handler",
          };

          this.messageProducer
            .publishMessage(disconnectEvent)
            .then(() => {
              console.log(`✅ Événement déconnexion publié pour ${matricule}`);
            })
            .catch((error) => {
              console.warn(
                `⚠️ Erreur publication événement déconnexion:`,
                error.message
              );
            });
        }

        // ✅ NOTIFIER LES AUTRES UTILISATEURS
        socket.broadcast.emit("user_disconnected", {
          userId: userId,
          matricule: matricule,
          timestamp: new Date().toISOString(),
          reason: reason,
        });

        console.log(
          `👋 Utilisateur ${matricule} (${userId}) déconnecté et nettoyé`
        );
      } else {
        console.log(`🔌 Socket ${socketId} déconnecté sans authentification`);
      }

      // ✅ NETTOYAGE FINAL DE LA SOCKET
      this.userSockets.delete(socketId);

      // ✅ NETTOYAGE DES SALLES - AVEC VÉRIFICATION DE LA MÉTHODE
      if (this.roomManager && userId) {
        // ✅ VÉRIFIER QUE LA MÉTHODE EXISTE AVANT DE L'APPELER
        if (typeof this.roomManager.removeUserFromAllRooms === "function") {
          this.roomManager.removeUserFromAllRooms(userId).catch((error) => {
            console.warn(
              `⚠️ Erreur nettoyage salles pour ${userId}:`,
              error.message
            );
          });
        } else if (typeof this.roomManager.getUserRooms === "function") {
          // ✅ FALLBACK: NETTOYER MANUELLEMENT LES ROOMS
          this.cleanupUserRoomsManually(userId).catch((error) => {
            console.warn(
              `⚠️ Erreur nettoyage manuel salles pour ${userId}:`,
              error.message
            );
          });
        } else {
          console.warn(
            `⚠️ RoomManager disponible mais méthodes de nettoyage manquantes pour ${userId}`
          );
        }
      }
    } catch (error) {
      console.error(`❌ Erreur lors de la déconnexion de ${socketId}:`, error);
    }
  }

  // ✅ MÉTHODE DE NETTOYAGE MANUEL DES ROOMS (FALLBACK)
  async cleanupUserRoomsManually(userId) {
    if (!this.roomManager) return;

    try {
      // Si getUserRooms existe, l'utiliser
      if (typeof this.roomManager.getUserRooms === "function") {
        const userRooms = await this.roomManager.getUserRooms(userId);

        if (userRooms && userRooms.length > 0) {
          console.log(
            `🏠 Nettoyage manuel: ${userRooms.length} room(s) pour utilisateur ${userId}`
          );

          for (const roomName of userRooms) {
            if (typeof this.roomManager.removeUserFromRoom === "function") {
              try {
                await this.roomManager.removeUserFromRoom(roomName, userId);
              } catch (error) {
                console.warn(
                  `⚠️ Erreur suppression room ${roomName}:`,
                  error.message
                );
              }
            }
          }
        }
      } else {
        console.warn(
          `⚠️ Méthode getUserRooms non disponible pour nettoyage ${userId}`
        );
      }
    } catch (error) {
      console.error(`❌ Erreur nettoyage manuel rooms pour ${userId}:`, error);
    }
  }

  // ✅ MÉTHODE DE DIAGNOSTIC DU ROOMANAGER
  diagnoseRoomManager() {
    if (!this.roomManager) {
      console.log("🔍 RoomManager: Non initialisé");
      return false;
    }

    const methods = [
      "removeUserFromAllRooms",
      "removeUserFromRoom",
      "getUserRooms",
      "getRooms",
      "getRoomsCount",
    ];

    const availableMethods = methods.filter(
      (method) => typeof this.roomManager[method] === "function"
    );

    console.log("🔍 RoomManager diagnostic:", {
      isInitialized: !!this.roomManager,
      availableMethods: availableMethods,
      missingMethods: methods.filter((m) => !availableMethods.includes(m)),
    });

    return availableMethods.length > 0;
  }

  // ✅ MÉTHODE D'AUTHENTIFICATION CORRIGÉE
  async handleAuthentication(socket, data) {
    try {
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
        if (!data.userId || !data.matricule) {
          socket.emit("auth_error", {
            message: "Données d'authentification manquantes",
            code: "MISSING_CREDENTIALS",
          });
          return;
        }
        userPayload = {
          id: String(data.userId),
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
      socket.userToken = data.token || null;
      socket.isAuthenticated = true;

      // ✅ DONNÉES UTILISATEUR POUR LES COLLECTIONS
      const userIdString = socket.userId;
      const matriculeString = socket.matricule;

      const userData = {
        socketId: socket.id,
        matricule: matriculeString,
        connectedAt: new Date(),
        lastActivity: new Date(),
        token: data.token,
      };

      // ✅ AJOUTER AUX COLLECTIONS LOCALES
      this.connectedUsers.set(userIdString, userData);
      this.userSockets.set(socket.id, {
        userId: userIdString,
        matricule: matriculeString,
      });

      // ✅ REJOINDRE UNE SALLE UTILISATEUR
      socket.join(`user_${userIdString}`);

      // 1. Rejoindre toutes les rooms de conversations de l'utilisateur
      if (this.getConversationIdsUseCase) {
        try {
          const conversationIds = await this.getConversationIdsUseCase.execute(
            userIdString
          );
          if (Array.isArray(conversationIds)) {
            for (const convId of conversationIds) {
              const roomName = `conversation_${convId}`;
              socket.join(roomName);
              console.log(
                `👥 Utilisateur ${userIdString} rejoint room ${roomName}`
              );

              // ✅ Gérer la room dans Redis via RoomManager
              if (
                this.roomManager &&
                typeof this.roomManager.createRoom === "function"
              ) {
                // Créer la room conversation si elle n'existe pas
                this.roomManager
                  .createRoom(roomName, {
                    type: "CONVERSATION",
                    description: `Room pour la conversation ${convId}`,
                    isPrivate: true,
                    maxUsers: 100,
                  })
                  .catch((error) => {
                    console.warn(
                      `⚠️ Erreur création room conversation dans Redis:`,
                      error.message
                    );
                  });
              }
              if (
                this.roomManager &&
                typeof this.roomManager.addUserToRoom === "function"
              ) {
                // Ajouter l'utilisateur à la room dans Redis
                this.roomManager
                  .addUserToRoom(roomName, userIdString, {
                    matricule: matriculeString,
                    joinedAt: new Date(),
                    conversationId: convId,
                  })
                  .catch((error) => {
                    console.warn(
                      `⚠️ Erreur ajout utilisateur à la room conversation dans Redis:`,
                      error.message
                    );
                  });
              }
            }
          }
        } catch (err) {
          console.warn(
            `⚠️ Erreur lors de la récupération/join des rooms conversations pour ${userIdString}:`,
            err.message
          );
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
        timestamp: new Date().toISOString(),
        method: data.token ? "token" : "credentials",
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

      // ✅ NOUVEAU: GESTION KAFKA POUR MESSAGES AUTOMATIQUES
      const consumer = kafka.consumer({ groupId: `user-${userId}` });
      await consumer.connect();
      await consumer.subscribe({
        topic: "chat-messages",
        fromBeginning: false,
      });

      consumer.run({
        eachMessage: async ({ message }) => {
          const msg = JSON.parse(message.value.toString());
          if (
            msg.receiverId === userId ||
            msg.conversationId in userConversations
          ) {
            socket.emit("newMessage", msg);
            await this.updateMessageStatusUseCase.markSingleMessage({
              messageId: msg.messageId,
              receiverId: userId,
              status: "DELIVERED",
            });
          }
        },
      });

      // 1. Récupérer toutes les conversations de l'utilisateur (optionnel, ou faire la requête sur tous les messages)
      if (this.updateMessageStatusUseCase) {
        try {
          // 2. Mettre à jour tous les messages "SENT" destinés à cet utilisateur en "DELIVERED"
          const result = await this.updateMessageStatusUseCase.execute({
            conversationId: null, // null = toutes conversations
            receiverId: userId,
            status: "DELIVERED",
            messageIds: null, // null = tous les messages concernés
          });

          if (result && result.modifiedCount > 0) {
            console.log(
              `✅ ${result.modifiedCount} messages marqués comme DELIVERED pour l'utilisateur ${userId} à la connexion`
            );
            // 3. Notifier le client connecté (optionnel)
            this.io.to(`user_${userId}`).emit("messagesAutoDelivered", {
              deliveredCount: result.modifiedCount,
              timestamp: new Date().toISOString(),
            });

            // ✅ NOUVEAU: NOTIFIER TOUS LES CONVERSATIONS DE L'UTILISATEUR
            if (
              this.messageRepository &&
              typeof this.messageRepository.getUserConversations === "function"
            ) {
              const conversationIds =
                this.messageRepository.getUserConversations(userId);
              for (const convId of conversationIds) {
                this.io
                  .to(`conversation_${convId}`)
                  .emit("messagesAutoDelivered", {
                    userId: userId,
                    deliveredCount: result.modifiedCount,
                    conversationId: convId,
                    timestamp: new Date().toISOString(),
                  });
              }
            }
          }
        } catch (err) {
          console.warn(
            "⚠️ Erreur auto-delivery messages à la connexion:",
            err.message
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
    if (this.onlineUserManager) {
      return await this.onlineUserManager.getOnlineUsersCount();
    }
    // Fallback local si Redis indisponible
    return this.connectedUsers.size;
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
    if (this.onlineUserManager) {
      return await this.onlineUserManager.getOnlineUsers();
    }
    // Fallback local
    return Array.from(this.connectedUsers.entries()).map(
      ([userId, userData]) => ({
        userId,
        matricule: userData.matricule,
        connectedAt: userData.connectedAt,
        lastActivity: userData.lastActivity,
      })
    );
  }

  getUserBySocketId(socketId) {
    return this.userSockets.get(socketId);
  }

  isUserConnected(userId) {
    return this.connectedUsers.has(userId);
  }

  sendToUser(userId, event, data) {
    try {
      this.io.to(`user_${userId}`).emit(event, data);
      return true;
    } catch (error) {
      console.error(`❌ Erreur envoi à l'utilisateur ${userId}:`, error);
      return false;
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
        conversationId,
        type = "TEXT",
        receiverId = null,
        conversationName = null,
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

      if (!conversationId) {
        socket.emit("message_error", {
          message: "ID de conversation requis",
          code: "MISSING_CONVERSATION_ID",
        });
        return;
      }

      if (!this.isValidObjectId(conversationId)) {
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
          conversationName: conversation.name,
          broadcast,
        });
      }

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

      // Rejoindre la room de la conversation
      socket.join(`conversation_${conversationId}`);

      // Notifier les autres participants
      socket
        .to(`conversation_${conversationId}`)
        .emit("user_joined_conversation", {
          userId: userId,
          matricule: socket.matricule,
          conversationId: conversationId,
          timestamp: new Date().toISOString(),
        });

      // Confirmer à l'utilisateur
      socket.emit("conversation_joined", {
        conversationId: conversationId,
        timestamp: new Date().toISOString(),
      });

      console.log(
        `👥 Utilisateur ${socket.matricule} a rejoint conversation ${conversationId}`
      );
    } catch (error) {
      console.error("❌ Erreur handleJoinConversation:", error);
      socket.emit("conversation_error", {
        message: "Erreur lors de la connexion à la conversation",
        code: "JOIN_ERROR",
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
  handleGetOnlineUsers(socket) {
    try {
      const onlineUsers = this.getConnectedUsers();

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

      // ✅ VÉRIFIER QUE LE USE CASE EST DISPONIBLE
      if (
        !this.updateMessageStatusUseCase ||
        typeof this.updateMessageStatusUseCase.markSingleMessage !== "function"
      ) {
        console.warn(
          "⚠️ UpdateMessageStatusUseCase non disponible - mode dégradé"
        );
        this._handleReadDegradedMode(socket, {
          messageId,
          conversationId,
          userId,
        });
        return;
      }

      try {
        const result = await this.updateMessageStatusUseCase.markSingleMessage({
          messageId: messageId,
          receiverId: userId,
          status: "READ",
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

        if (messages && messages.messages.length > 0) {
          // 2. Mettre à jour chaque message en tant que "LU"
          const messageIds = messages.messages.map((msg) => msg.id);
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
          status: "DELETED",
          timestamp: new Date().toISOString(),
        });
        // Notifier la conversation si besoin
        // this.io.to(`conversation_${conversationId}`).emit("messageDeleted", {...});
      } else {
        socket.emit("status_error", {
          message: "Message déjà supprimé ou introuvable",
          code: "ALREADY_DELETED",
          type: "delete_message",
        });
      }
    } catch (error) {
      console.error("❌ Erreur handleDeleteMessage:", error);
      socket.emit("status_error", {
        message: "Erreur lors de la suppression du message",
        code: "DELETE_MESSAGE_ERROR",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  // ✅ GESTIONNAIRE DE SUPPRESSION LOGIQUE DE FICHIER
  async handleDeleteFile(socket, data) {
    try {
      const { fileId } = data;
      const userId = socket.userId;

      if (!fileId || !userId) {
        socket.emit("status_error", {
          message: "ID fichier ou utilisateur manquant",
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
        `📄 Récupération de ${messages.messages.length} messages pour conversation ${conversationId}`
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

      console.log(
        "📄 Récupération des conversations:",
        result.conversations[0].participants
      );

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
