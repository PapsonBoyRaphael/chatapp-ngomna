/**
 * Gestionnaire WebSocket pour le chat en temps réel
 * Responsable de la gestion des connexions, messages et événements socket
 */
class ChatHandler {
  constructor(
    io,
    sendMessageUseCase = null,
    messageProducer = null,
    redisClient = null,
    onlineUserManager = null,
    roomManager = null
  ) {
    this.io = io;
    this.sendMessageUseCase = sendMessageUseCase;
    this.messageProducer = messageProducer;
    this.redisClient = redisClient;
    this.onlineUserManager = onlineUserManager;
    this.roomManager = roomManager;

    // Collections pour gérer les connexions
    this.connectedUsers = new Map();
    this.userSockets = new Map();

    console.log("🔌 ChatHandler initialisé avec:", {
      hasIO: !!io,
      hasSendMessage: !!sendMessageUseCase,
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
  handleAuthentication(socket, data) {
    try {
      const { userId, matricule, token } = data;

      console.log("🔐 Tentative d'authentification:", {
        userId: userId,
        matricule: matricule,
        hasToken: !!token,
        socketId: socket.id,
      });

      if (!userId || !matricule) {
        console.warn("❌ Données d'authentification manquantes");
        socket.emit("auth_error", {
          message: "Données d'authentification manquantes",
          code: "MISSING_CREDENTIALS",
        });
        return;
      }

      // ✅ VALIDATION ET CONVERSION DES DONNÉES
      const userIdString = String(userId);
      const matriculeString = String(matricule);

      if (
        userIdString === "undefined" ||
        userIdString === "null" ||
        userIdString === ""
      ) {
        console.warn("❌ ID utilisateur invalide:", userIdString);
        socket.emit("auth_error", {
          message: "ID utilisateur invalide",
          code: "INVALID_USER_ID",
        });
        return;
      }

      // ✅ STOCKER LES DONNÉES D'AUTHENTIFICATION DANS LA SOCKET
      socket.userId = userIdString;
      socket.matricule = matriculeString;
      socket.userToken = token || null;
      socket.isAuthenticated = true;

      // ✅ DONNÉES UTILISATEUR POUR LES COLLECTIONS
      const userData = {
        socketId: socket.id,
        matricule: matriculeString,
        connectedAt: new Date(),
        lastActivity: new Date(),
        token: token,
      };

      // ✅ AJOUTER AUX COLLECTIONS LOCALES
      this.connectedUsers.set(userIdString, userData);
      this.userSockets.set(socket.id, {
        userId: userIdString,
        matricule: matriculeString,
      });

      // ✅ REJOINDRE UNE SALLE UTILISATEUR
      socket.join(`user_${userIdString}`);

      // ✅ CONFIRMER L'AUTHENTIFICATION
      socket.emit("authenticated", {
        success: true,
        userId: userIdString,
        matricule: matriculeString,
        timestamp: new Date().toISOString(),
        method: token ? "token" : "credentials",
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
  getConnectedUserCount() {
    return this.connectedUsers.size;
  }

  getStats() {
    return {
      connectedUsers: this.connectedUsers.size,
      activeSockets: this.userSockets.size,
      timestamp: new Date().toISOString(),
    };
  }

  getConnectedUsers() {
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

      if (!userId || !content || !conversationId) {
        socket.emit("message_error", {
          message: "Données manquantes pour l'envoi du message",
          code: "MISSING_DATA",
        });
        return;
      }

      // ✅ VALIDATION DE L'OBJECTID MONGODB
      if (!this.isValidObjectId(conversationId)) {
        console.error(
          "❌ ID de conversation MongoDB invalide:",
          conversationId
        );

        socket.emit("message_error", {
          message: "ID de conversation invalide",
          code: "INVALID_CONVERSATION_ID",
          details: `L'ID "${conversationId}" n'est pas un ObjectId MongoDB valide`,
        });
        return;
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
        status: "sent",
      };

      // ✅ UTILISER LE USE CASE AVEC DONNÉES COMPLÈTES
      if (
        this.sendMessageUseCase &&
        typeof this.sendMessageUseCase.execute === "function"
      ) {
        try {
          const result = await this.sendMessageUseCase.execute({
            content: message.content,
            senderId: message.senderId,
            conversationId: message.conversationId,
            type: message.type,
            receiverId: receiverId, // ✅ PASSER LE RECEIVER ID
            conversationName: null, // ✅ PEUT ÊTRE FOURNI PAR LE CLIENT
          });

          // ✅ METTRE À JOUR AVEC LE RÉSULTAT
          if (result && result.success && result.message) {
            message.id = result.message.id;
            console.log(
              "✅ Message sauvegardé via Use Case:",
              result.message.id
            );
          }
        } catch (useCaseError) {
          console.warn("⚠️ Erreur Use Case message:", useCaseError.message);

          // ✅ GESTION SPÉCIFIQUE DES ERREURS
          if (useCaseError.message.includes("Cast to ObjectId failed")) {
            socket.emit("message_error", {
              message: "Conversation introuvable ou ID invalide",
              code: "CONVERSATION_NOT_FOUND",
              details: `La conversation "${conversationId}" n'existe pas ou l'ID est invalide`,
            });
            return;
          }

          // ✅ AUTRES ERREURS - CONTINUER EN MODE DÉGRADÉ
          console.log("🔄 Continuons en mode dégradé sans sauvegarde DB");
        }
      }

      // ✅ PUBLIER VIA KAFKA SI DISPONIBLE
      if (
        this.messageProducer &&
        typeof this.messageProducer.publishMessage === "function"
      ) {
        try {
          await this.messageProducer.publishMessage({
            eventType: "MESSAGE_SENT",
            messageId: message.id,
            senderId: message.senderId,
            conversationId: message.conversationId,
            content: message.content,
            timestamp: message.timestamp,
            source: "chat-handler",
          });

          console.log("✅ Message publié sur Kafka");
        } catch (kafkaError) {
          console.warn("⚠️ Erreur publication Kafka:", kafkaError.message);
        }
      }

      // ✅ DIFFUSER LE MESSAGE À TOUS LES PARTICIPANTS DE LA CONVERSATION
      this.io.to(`conversation_${conversationId}`).emit("newMessage", message);

      // ✅ CONFIRMER À L'EXPÉDITEUR
      socket.emit("message_sent", {
        messageId: message.id,
        status: "delivered",
        timestamp: message.timestamp,
      });

      console.log(`✅ Message diffusé pour conversation ${conversationId}`);
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
}

module.exports = ChatHandler;
