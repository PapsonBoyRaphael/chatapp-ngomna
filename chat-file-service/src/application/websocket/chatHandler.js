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
    this.connectedUsers = new Map();
    this.userSockets = new Map();

    console.log("✅ ChatHandler initialisé avec:", {
      io: !!io,
      sendMessageUseCase: !!sendMessageUseCase,
      messageProducer: !!messageProducer,
      redisClient: !!redisClient,
      onlineUserManager: !!onlineUserManager,
      roomManager: !!roomManager,
    });

    // ✅ APPELER LA MÉTHODE QUI EXISTE MAINTENANT
    this.setupSocketHandlers();
  }

  // ✅ AJOUTER LA MÉTHODE MANQUANTE
  setupSocketHandlers() {
    try {
      console.log("🔌 Configuration des gestionnaires Socket.IO...");

      this.io.on("connection", (socket) => {
        console.log(`🔗 Nouvelle connexion WebSocket: ${socket.id}`);

        // Événements d'authentification
        socket.on("authenticate", (data) =>
          this.handleAuthentication(socket, data)
        );

        // Événements de chat
        socket.on("sendMessage", (data) =>
          this.handleSendMessage(socket, data)
        );
        socket.on("joinConversation", (data) =>
          this.handleJoinConversation(socket, data)
        );
        socket.on("leaveConversation", (data) =>
          this.handleLeaveConversation(socket, data)
        );
        socket.on("typing", (data) => this.handleTyping(socket, data));
        socket.on("stopTyping", (data) => this.handleStopTyping(socket, data));

        // Événements de gestion
        socket.on("getOnlineUsers", () => this.handleGetOnlineUsers(socket));
        socket.on("ping", () => socket.emit("pong"));

        // Déconnexion
        socket.on("disconnect", () => this.handleDisconnection(socket));
      });

      console.log("✅ Gestionnaires Socket.IO configurés");
    } catch (error) {
      console.error("❌ Erreur configuration Socket.IO:", error);
    }
  }

  // ✅ MÉTHODE D'AUTHENTIFICATION AMÉLIORÉE
  handleAuthentication(socket, data) {
    try {
      const { userId, matricule, token } = data;

      if (!userId || !matricule) {
        socket.emit("auth_error", {
          message: "Données d'authentification manquantes",
        });
        return;
      }

      // ✅ CONVERTIR ET VALIDER LES DONNÉES
      const userIdString = String(userId);
      const matriculeString = String(matricule);

      if (
        userIdString === "undefined" ||
        userIdString === "null" ||
        userIdString === ""
      ) {
        socket.emit("auth_error", {
          message: "ID utilisateur invalide",
        });
        return;
      }

      socket.userId = userIdString;
      socket.matricule = matriculeString;
      socket.userToken = token;

      const userData = {
        socketId: socket.id,
        matricule: matriculeString,
        connectedAt: new Date(),
        lastActivity: new Date(),
      };

      this.connectedUsers.set(userIdString, userData);
      this.userSockets.set(socket.id, {
        userId: userIdString,
        matricule: matriculeString,
      });

      socket.join(`user_${userIdString}`);
      socket.emit("authenticated", {
        success: true,
        userId: userIdString,
        matricule: matriculeString,
        timestamp: new Date().toISOString(),
      });

      console.log(
        `✅ Utilisateur authentifié: ${matriculeString} (${userIdString})`
      );

      // ✅ SYNC AVEC REDIS AVEC DONNÉES VALIDÉES
      this.syncUserWithRedis(userIdString, userData);

      // Notifier les autres utilisateurs
      socket.broadcast.emit("user_connected", {
        userId: userIdString,
        matricule: matriculeString,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("❌ Erreur authentification:", error);
      socket.emit("auth_error", { message: "Erreur d'authentification" });
    }
  }

  // ✅ GESTION DES MESSAGES
  async handleSendMessage(socket, data) {
    try {
      const { content, conversationId, type = "TEXT" } = data;

      if (!content || !socket.userId) {
        socket.emit("error", { message: "Données manquantes" });
        return;
      }

      const messageData = {
        id: require("uuid").v4(),
        senderId: socket.userId,
        senderMatricule: socket.matricule,
        content,
        conversationId: conversationId || "general",
        timestamp: new Date(),
        type,
      };

      // Use case pour sauvegarder
      if (this.sendMessageUseCase) {
        try {
          await this.sendMessageUseCase.execute(messageData);
          console.log("✅ Message sauvegardé via use case");
        } catch (error) {
          console.error("❌ Erreur use case:", error);
        }
      }

      // ✅ CORRIGER: Utiliser publishMessage au lieu de send
      if (this.messageProducer) {
        try {
          await this.messageProducer.publishMessage({
            eventType: "MESSAGE_SENT",
            messageId: messageData.id,
            senderId: socket.userId,
            senderMatricule: socket.matricule,
            content: messageData.content,
            conversationId: messageData.conversationId,
            timestamp: messageData.timestamp.toISOString(),
          });
          console.log("✅ Message publié via Kafka");
        } catch (error) {
          console.warn("⚠️ Erreur publication Kafka:", error.message);
        }
      }

      // Diffuser le message
      const targetRoom = messageData.conversationId
        ? `conversation_${messageData.conversationId}`
        : "general";

      this.io.to(targetRoom).emit("newMessage", {
        id: messageData.id,
        senderId: socket.userId,
        senderMatricule: socket.matricule,
        content: messageData.content,
        conversationId: messageData.conversationId,
        timestamp: messageData.timestamp,
        type: messageData.type,
      });

      socket.emit("message_sent", {
        success: true,
        messageId: messageData.id,
        timestamp: messageData.timestamp,
      });

      this.updateUserActivity(socket.userId);
    } catch (error) {
      console.error("❌ Erreur envoi message:", error);
      socket.emit("error", { message: "Erreur lors de l'envoi du message" });
    }
  }

  // ✅ REJOINDRE UNE CONVERSATION
  handleJoinConversation(socket, data) {
    try {
      const { conversationId } = data;

      if (!conversationId) {
        socket.emit("error", { message: "ID de conversation requis" });
        return;
      }

      // ✅ VALIDATION DES DONNÉES UTILISATEUR
      if (!socket.userId || socket.userId === "undefined") {
        socket.emit("error", { message: "Utilisateur non authentifié" });
        return;
      }

      const conversationIdString = String(conversationId);
      const roomName = `conversation_${conversationIdString}`;
      socket.join(roomName);

      console.log(
        `👥 ${socket.matricule} a rejoint la conversation ${conversationIdString}`
      );

      // ✅ SYNC AVEC REDIS AVEC DONNÉES VALIDÉES
      this.syncRoomWithRedis(roomName, {
        userId: socket.userId, // Déjà converti en string dans handleAuthentication
        matricule: socket.matricule,
        conversationId: conversationIdString,
        joinedAt: new Date(),
      });

      socket.to(roomName).emit("user_joined_conversation", {
        userId: socket.userId,
        matricule: socket.matricule,
        conversationId: conversationIdString,
        timestamp: new Date(),
      });

      socket.emit("conversation_joined", {
        conversationId: conversationIdString,
        success: true,
      });

      this.updateUserActivity(socket.userId);
    } catch (error) {
      console.error("❌ Erreur rejoindre conversation:", error);
      socket.emit("error", {
        message: "Erreur lors de la connexion à la conversation",
      });
    }
  }

  // ✅ QUITTER UNE CONVERSATION
  handleLeaveConversation(socket, data) {
    try {
      const { conversationId } = data;

      if (!conversationId) {
        return;
      }

      const roomName = `conversation_${conversationId}`;
      socket.leave(roomName);

      socket.to(roomName).emit("user_left_conversation", {
        userId: socket.userId,
        matricule: socket.matricule,
        conversationId: conversationId,
        timestamp: new Date(),
      });

      console.log(
        `👋 ${socket.matricule} a quitté la conversation ${conversationId}`
      );
    } catch (error) {
      console.error("❌ Erreur quitter conversation:", error);
    }
  }

  // ✅ INDICATEUR DE FRAPPE
  handleTyping(socket, data) {
    try {
      const { conversationId } = data;

      if (!conversationId || !socket.userId) {
        return;
      }

      const roomName = `conversation_${conversationId}`;

      socket.to(roomName).emit("userTyping", {
        userId: socket.userId,
        matricule: socket.matricule,
        conversationId: conversationId,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("❌ Erreur typing:", error);
    }
  }

  // ✅ ARRÊT FRAPPE
  handleStopTyping(socket, data) {
    try {
      const { conversationId } = data;

      if (!conversationId || !socket.userId) {
        return;
      }

      const roomName = `conversation_${conversationId}`;

      socket.to(roomName).emit("userStoppedTyping", {
        userId: socket.userId,
        matricule: socket.matricule,
        conversationId: conversationId,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("❌ Erreur stop typing:", error);
    }
  }

  // ✅ OBTENIR UTILISATEURS EN LIGNE
  handleGetOnlineUsers(socket) {
    try {
      const onlineUsers = this.getConnectedUsers();
      socket.emit("onlineUsers", {
        users: onlineUsers,
        count: onlineUsers.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Erreur get online users:", error);
      socket.emit("onlineUsers", { users: [], count: 0 });
    }
  }

  // ✅ DÉCONNEXION
  handleDisconnection(socket) {
    const userId = socket.userId;
    const matricule = socket.matricule;

    console.log(
      `🔌 Utilisateur déconnecté: ${matricule || "Anonyme"} (${socket.id})`
    );

    if (userId) {
      this.connectedUsers.delete(userId);

      // ✅ NETTOYER REDIS
      if (this.onlineUserManager) {
        this.onlineUserManager.setUserOffline(userId).catch((error) => {
          console.warn("⚠️ Erreur nettoyage Redis:", error.message);
        });
      }

      socket.broadcast.emit("user_disconnected", {
        userId: userId,
        matricule: matricule,
        timestamp: new Date(),
      });

      // ✅ CORRIGER: Utiliser publishMessage au lieu de send
      if (this.messageProducer) {
        try {
          this.messageProducer
            .publishMessage({
              eventType: "USER_DISCONNECTED",
              userId: userId,
              matricule: matricule,
              timestamp: new Date().toISOString(),
            })
            .catch((error) => {
              console.warn("⚠️ Erreur publication déconnexion:", error.message);
            });
        } catch (error) {
          console.warn("⚠️ Erreur Kafka déconnexion:", error.message);
        }
      }
    }

    this.userSockets.delete(socket.id);
  }

  // ✅ MÉTHODES UTILITAIRES
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
      } catch (error) {
        console.warn("⚠️ Erreur sync utilisateur Redis:", error.message);
      }
    }
  }

  async syncRoomWithRedis(roomName, data) {
    if (this.roomManager) {
      try {
        // ✅ S'ASSURER QUE TOUS LES TYPES SONT CORRECTS
        const sanitizedData = {
          matricule: data.matricule ? String(data.matricule) : "Unknown",
          conversationId: data.conversationId
            ? String(data.conversationId)
            : null,
          joinedAt: data.joinedAt instanceof Date ? data.joinedAt : new Date(),
        };

        await this.roomManager.addUserToRoom(
          String(roomName),
          String(data.userId),
          sanitizedData
        );
      } catch (error) {
        console.warn("⚠️ Erreur sync room Redis:", error.message);
      }
    }
  }

  updateUserActivity(userId) {
    if (this.connectedUsers.has(userId)) {
      const userData = this.connectedUsers.get(userId);
      userData.lastActivity = new Date();
      this.connectedUsers.set(userId, userData);

      // Sync avec Redis avec validation
      this.syncUserWithRedis(userId, userData);
    }
  }

  // ✅ MÉTHODES PUBLIQUES ATTENDUES PAR INDEX.JS
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
    const users = [];
    for (const [userId, userData] of this.connectedUsers.entries()) {
      users.push({
        userId,
        matricule: userData.matricule,
        connectedAt: userData.connectedAt,
        lastActivity: userData.lastActivity,
      });
    }
    return users;
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
}

module.exports = ChatHandler;
