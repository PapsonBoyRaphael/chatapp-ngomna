/**
 * Gestionnaire WebSocket pour le chat en temps réel
 * ✅ RESPONSABILITÉ UNIQUE : Gérer les événements WebSocket
 * ✅ PAS DE REDIS, PAS DE KAFKA → Déléguer aux Use Cases
 */
const AuthMiddleware = require("../../interfaces/http/middleware/authMiddleware");

class ChatHandler {
  constructor(
    io,
    sendMessageUseCase,
    getMessagesUseCase,
    updateMessageStatusUseCase,
    onlineUserManager,
    getConversationIdsUseCase,
    getConversationUseCase,
    getConversationsUseCase,
    getMessageByIdUseCase,
    updateMessageContentUseCase,
    createGroupUseCase,
    createBroadcastUseCase,
    roomManager,
    markMessageDeliveredUseCase,
    markMessageReadUseCase,
    resilientMessageService = null,
    messageDeliveryService = null
  ) {
    this.io = io;
    this.sendMessageUseCase = sendMessageUseCase;
    this.resilientService = resilientMessageService;
    this.getMessagesUseCase = getMessagesUseCase;
    this.updateMessageStatusUseCase = updateMessageStatusUseCase;
    this.onlineUserManager = onlineUserManager;
    this.getConversationIdsUseCase = getConversationIdsUseCase;
    this.getConversationUseCase = getConversationUseCase;
    this.getConversationsUseCase = getConversationsUseCase;
    this.getMessageByIdUseCase = getMessageByIdUseCase;
    this.updateMessageContentUseCase = updateMessageContentUseCase;
    this.createGroupUseCase = createGroupUseCase;
    this.createBroadcastUseCase = createBroadcastUseCase;
    this.roomManager = roomManager;
    this.markMessageDeliveredUseCase = markMessageDeliveredUseCase;
    this.markMessageReadUseCase = markMessageReadUseCase;
    this.messageDeliveryService = messageDeliveryService;

    // ✅ LOG DE DEBUG
    console.log(
      "🔍 ChatHandler reçu messageDeliveryService:",
      this.messageDeliveryService ? "✅ OUI" : "❌ NON"
    );
  }

  setupSocketHandlers() {
    try {
      console.log("🔌 Configuration des gestionnaires Socket.IO...");

      this.io.on("connection", (socket) => {
        console.log(`🔗 Nouvelle connexion WebSocket: ${socket.id}`);

        socket.on("authenticate", async (data) => {
          try {
            await this.handleAuthentication(socket, data);
          } catch (err) {
            console.error("❌ Erreur authentification:", err.message);
            socket.emit("auth_error", {
              message: "Erreur lors de l'authentification",
              code: "AUTH_ERROR",
            });
          }
        });

        socket.on("sendMessage", (data) => {
          console.log("💬 Envoi message:", data);
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleSendMessage(socket, data);
        });

        socket.on("joinConversation", (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleJoinConversation(socket, data);
        });

        socket.on("leaveConversation", (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleLeaveConversation(socket, data);
        });

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

        socket.on("markMessageDelivered", (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleMarkMessageDelivered(socket, data);
        });

        socket.on("markMessageRead", (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          this.handleMarkMessageRead(socket, data);
        });

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

        socket.on("ping", () => {
          socket.emit("pong");
        });

        socket.on("disconnect", (reason) => {
          this.handleDisconnection(socket, reason);
        });

        socket.on("error", (error) => {
          console.error(`❌ Erreur Socket ${socket.id}:`, error);
        });
      });

      console.log("✅ Gestionnaires Socket.IO configurés");
    } catch (error) {
      console.error("❌ Erreur configuration Socket.IO:", error);
    }
  }

  // ✅ AUTHENTIFICATION
  async handleAuthentication(socket, data) {
    try {
      console.log(`🔐 Authentification demande:`, data);

      let userPayload = null;
      if (data.token) {
        try {
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

      socket.userId = userPayload.id || userPayload.userId;
      socket.matricule = userPayload.matricule || "";
      socket.nom = userPayload.nom || "";
      socket.prenom = userPayload.prenom || "";
      socket.ministere = userPayload.ministere || "";
      socket.isAuthenticated = true;

      const userIdString = socket.matricule;
      const matriculeString = socket.matricule;

      const userData = {
        socketId: socket.id,
        matricule: matriculeString,
        connectedAt: new Date(),
        lastActivity: new Date(),
      };

      socket.join(`user_${userIdString}`);

      let conversationIds = [];

      // ✅ UTILISER LE USE CASE POUR RÉCUPÉRER LES CONVERSATIONS
      if (this.getConversationIdsUseCase) {
        try {
          conversationIds = await this.getConversationIdsUseCase.execute(
            userIdString
          );

          if (!Array.isArray(conversationIds)) {
            console.warn(`⚠️ conversationIds n'est pas un tableau`);
            conversationIds = [];
          }

          console.log(
            `✅ Récupération ${conversationIds.length} conversations pour ${userIdString}`
          );

          if (conversationIds.length > 0) {
            for (const convId of conversationIds) {
              const roomName = `conversation_${convId}`;
              socket.join(roomName);
              console.log(
                `👥 Utilisateur ${userIdString} rejoint room ${roomName}`
              );

              // ✅ UTILISER LE USE CASE POUR MARQUER COMME DELIVERED
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
                      `✅ ${result.modifiedCount} messages marqués DELIVERED`
                    );
                  }
                } catch (deliveredError) {
                  console.warn(
                    `⚠️ Erreur marquage delivered:`,
                    deliveredError.message
                  );
                }
              }
            }
          }
        } catch (convError) {
          console.warn(
            `⚠️ Erreur récupération conversations:`,
            convError.message
          );
          conversationIds = [];
        }
      }

      if (socket.ministere) {
        const ministereRoom = `ministere_${socket.ministere
          .replace(/\s+/g, "_")
          .toLowerCase()}`;
        socket.join(ministereRoom);
        console.log(
          `🏛️ Utilisateur ${userIdString} rejoint room ministère: ${ministereRoom}`
        );
      }

      socket.emit("authenticated", {
        success: true,
        userId: userIdString,
        matricule: matriculeString,
        nom: socket.nom,
        prenom: socket.prenom,
        ministere: socket.ministere,
        autoJoinedConversations: conversationIds.length,
        timestamp: new Date().toISOString(),
      });

      console.log(
        `✅ Utilisateur authentifié: ${matriculeString} (${userIdString})`
      );

      // ✅ ENREGISTRER LE SOCKET DANS MessageDeliveryService
      console.log(
        `🔍 messageDeliveryService disponible? ${
          this.messageDeliveryService ? "✅ OUI" : "❌ NON"
        }`
      );

      if (this.messageDeliveryService) {
        console.log(`📤 Enregistrement socket pour ${userIdString}...`);
        this.messageDeliveryService.registerUserSocket(userIdString, socket);

        // ✅ LIVRER LES MESSAGES EN ATTENTE
        console.log(`📥 Livraison messages en attente pour ${userIdString}...`);
        const deliveredCount =
          await this.messageDeliveryService.deliverPendingMessagesOnConnect(
            userIdString,
            socket
          );
        console.log(`✅ ${deliveredCount} message(s) en attente livré(s)`);
      } else {
        console.warn(`⚠️ messageDeliveryService est NULL/UNDEFINED!`);
      }

      await this.syncUserWithRedis(userIdString, userData);

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

  // ✅ DÉCONNEXION
  async handleDisconnection(socket, reason = "unknown") {
    const userId = socket.userId;
    const matricule = socket.matricule;

    try {
      if (userId && this.onlineUserManager) {
        await this.onlineUserManager.setUserOffline(userId);

        socket.broadcast.emit("user_disconnected", {
          userId,
          matricule,
          timestamp: new Date().toISOString(),
          reason,
        });

        console.log(`👋 Utilisateur ${matricule} (${userId}) déconnecté`);
      }
    } catch (error) {
      console.error("❌ Erreur déconnexion:", error);
    }
  }

  // ✅ SYNC REDIS - Via OnlineUserManager UNIQUEMENT
  async syncUserWithRedis(userId, userData) {
    if (this.onlineUserManager) {
      try {
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

  // ========================================
  // ✅ ENVOYER UN MESSAGE - SIMPLIFIÉ
  // ========================================
  /**
   * ✅ RESPONSABILITÉ UNIQUE : Valider et déléguer au Use Case
   * SendMessage Use Case gère : MongoDB + Kafka + ResilientService
   */
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
        userId,
        conversationId,
        contentLength: content ? content.length : 0,
        type,
      });

      // ✅ VALIDATION
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

      if (!conversationId && !receiverId) {
        socket.emit("message_error", {
          message: "ID de conversation requis",
          code: "MISSING_CONVERSATION_ID",
        });
        return;
      }

      if (conversationId && !this.isValidObjectId(conversationId)) {
        socket.emit("message_error", {
          message: "ID de conversation invalide",
          code: "INVALID_CONVERSATION_ID",
        });
        return;
      }

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
      }

      // ✅ ÉTAPE 1 : DÉLÉGUER AU USE CASE
      // SendMessage gère : MongoDB + Kafka + ResilientService (tout en internal)
      let result;
      try {
        if (this.resilientService) {
          result = await this.resilientService.circuitBreaker.execute(() =>
            this.sendMessageUseCase.execute({
              content: content.trim(),
              senderId: userId,
              conversationId,
              type,
              receiverId,
              duration,
              fileId,
              fileName,
              fileUrl,
              fileSize,
              mimeType,
              conversationName,
              broadcast,
            })
          );
        } else {
          result = await this.sendMessageUseCase.execute({
            content: content.trim(),
            senderId: userId,
            conversationId,
            type,
            receiverId,
            duration,
            fileId,
            fileName,
            fileUrl,
            fileSize,
            mimeType,
            conversationName,
            broadcast,
          });
        }
      } catch (saveError) {
        console.error("❌ Erreur sendMessageUseCase:", saveError.message);
        socket.emit("message_error", {
          message: "Erreur lors de l'envoi du message",
          code: "SEND_ERROR",
        });
        return;
      }

      if (!result || !result.message) {
        socket.emit("message_error", {
          message: "Erreur lors de l'envoi du message",
          code: "SEND_ERROR",
        });
        return;
      }

      const messageId = result.message._id || result.message.id;

      // ✅ ÉTAPE 2 : RÉPONDRE À L'EXPÉDITEUR (ACK IMMÉDIAT)
      socket.emit("message_sent", {
        messageId,
        temporaryId: data.temporaryId,
        status: "sent",
        timestamp: new Date().toISOString(),
      });

      console.log(
        `✅ Message envoyé (Use Case gère Kafka + ResilientService): ${messageId}`
      );
      // ✅ FIN
      // Tout le reste (Kafka, livraison, retry) est géré en interne par le Use Case
    } catch (error) {
      console.error("❌ Erreur handleSendMessage:", error);

      socket.emit("message_error", {
        message: "Erreur lors de l'envoi du message",
        code:
          this.resilientService?.circuitBreaker.state === "OPEN"
            ? "CIRCUIT_OPEN"
            : "SEND_ERROR",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  // ✅ UTILITAIRES
  isValidObjectId(id) {
    if (!id || typeof id !== "string") return false;
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  generateObjectId() {
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

  // ========================================
  // AUTRES GESTIONNAIRES (inchangés)
  // ========================================

  async handleJoinConversation(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      if (!conversationId || !userId) return;

      const roomName = `conversation_${conversationId}`;

      if (this.updateMessageStatusUseCase) {
        try {
          await this.updateMessageStatusUseCase.execute({
            conversationId,
            receiverId: userId,
            status: "READ",
            messageIds: null,
          });
        } catch (err) {
          console.warn("⚠️ Erreur marquage read:", err.message);
        }
      }

      if (this.onlineUserManager) {
        try {
          await this.onlineUserManager.updateLastActivity(userId);
        } catch (err) {
          console.warn("⚠️ Erreur renouvellement présence:", err.message);
        }
      }

      socket.emit("conversation_joined", {
        conversationId,
        timestamp: new Date().toISOString(),
      });

      console.log(
        `✅ ${socket.matricule} a rejoint conversation ${conversationId}`
      );
    } catch (error) {
      console.error("❌ Erreur handleJoinConversation:", error);
      socket.emit("conversation_error", {
        message: "Erreur lors de la connexion à la conversation",
        code: "JOIN_ERROR",
      });
    }
  }

  async handleLeaveConversation(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      if (!conversationId || !userId) return;

      socket.leave(`conversation_${conversationId}`);

      socket
        .to(`conversation_${conversationId}`)
        .emit("user_left_conversation", {
          userId,
          matricule: socket.matricule,
          conversationId,
          timestamp: new Date().toISOString(),
        });

      console.log(
        `👋 ${socket.matricule} a quitté conversation ${conversationId}`
      );
    } catch (error) {
      console.error("❌ Erreur handleLeaveConversation:", error);
    }
  }

  handleTyping(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      if (!conversationId || !userId) return;

      socket.to(`conversation_${conversationId}`).emit("userTyping", {
        userId,
        matricule: socket.matricule,
        conversationId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Erreur handleTyping:", error);
    }
  }

  handleStopTyping(socket, data) {
    try {
      const { conversationId } = data;
      const userId = socket.userId;

      if (!conversationId || !userId) return;

      socket.to(`conversation_${conversationId}`).emit("userStoppedTyping", {
        userId,
        matricule: socket.matricule,
        conversationId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Erreur handleStopTyping:", error);
    }
  }

  async handleMarkMessageDelivered(socket, data) {
    try {
      const { messageId, conversationId } = data;
      const userId = socket.userId;

      if (!messageId || !userId) return;

      if (!this.updateMessageStatusUseCase) {
        console.warn("⚠️ UpdateMessageStatusUseCase non disponible");
        return;
      }

      try {
        const result = await this.updateMessageStatusUseCase.execute({
          messageId,
          receiverId: userId,
          status: "DELIVERED",
          conversationId,
        });

        if (result && result.modifiedCount > 0) {
          this.io
            .to(`conversation_${conversationId}`)
            .emit("messageStatusChanged", {
              messageId,
              status: "DELIVERED",
              userId,
              timestamp: new Date().toISOString(),
            });

          socket.emit("messageDelivered", {
            messageId,
            status: "DELIVERED",
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.warn("⚠️ Erreur marquage delivered:", err.message);
      }
    } catch (error) {
      console.error("❌ Erreur handleMarkMessageDelivered:", error);
    }
  }

  async handleMarkMessageRead(socket, data) {
    try {
      const { messageId, conversationId } = data;
      const userId = socket.userId;

      if (!messageId || !userId) return;

      if (!this.updateMessageStatusUseCase) {
        console.warn("⚠️ UpdateMessageStatusUseCase non disponible");
        return;
      }

      try {
        const result = await this.updateMessageStatusUseCase.execute({
          messageId,
          receiverId: userId,
          status: "READ",
          conversationId,
        });

        if (result && result.modifiedCount > 0) {
          this.io
            .to(`conversation_${conversationId}`)
            .emit("messageStatusChanged", {
              messageId,
              status: "READ",
              userId,
              timestamp: new Date().toISOString(),
            });

          socket.emit("messageRead", {
            messageId,
            status: "READ",
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.warn("⚠️ Erreur marquage read:", err.message);
      }
    } catch (error) {
      console.error("❌ Erreur handleMarkMessageRead:", error);
    }
  }

  async handleGetMessages(socket, data) {
    try {
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
          message: "Service non disponible",
          code: "SERVICE_UNAVAILABLE",
        });
        return;
      }

      const result = await this.getMessagesUseCase.execute(conversationId, {
        page: parseInt(page),
        limit: parseInt(limit),
        userId,
      });

      socket.emit("messagesLoaded", result);
    } catch (error) {
      console.error("❌ Erreur handleGetMessages:", error);
      socket.emit("messages_error", {
        message: "Erreur lors de la récupération des messages",
        code: "GET_MESSAGES_ERROR",
      });
    }
  }

  async handleGetConversations(socket, data) {
    try {
      const userId = socket.userId;
      const { page = 1, limit = 20 } = data || {};

      if (!userId) {
        socket.emit("conversations_error", {
          message: "ID utilisateur manquant",
          code: "MISSING_USER_ID",
        });
        return;
      }

      if (!this.getConversationsUseCase) {
        socket.emit("conversations_error", {
          message: "Service non disponible",
          code: "SERVICE_UNAVAILABLE",
        });
        return;
      }

      const result = await this.getConversationsUseCase.execute(userId);

      socket.emit("conversationsLoaded", {
        conversations: result.conversations || [],
        pagination: result.pagination || {},
        totalUnreadMessages: result.totalUnreadMessages || 0,
        fromCache: result.fromCache || false,
      });
    } catch (error) {
      console.error("❌ Erreur handleGetConversations:", error);
      socket.emit("conversations_error", {
        message: "Erreur lors de la récupération des conversations",
        code: "GET_CONVERSATIONS_ERROR",
      });
    }
  }

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
          message: "Service non disponible",
          code: "SERVICE_UNAVAILABLE",
        });
        return;
      }

      const result = await this.getConversationUseCase.execute(
        conversationId,
        userId
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
      });
    }
  }

  // ✅ DÉCONNEXION - NETTOYER LES RESSOURCES
  async handleDisconnection(socket, reason = "unknown") {
    const userId = socket.userId;
    const socketId = socket.id;

    try {
      if (userId) {
        // ✅ DÉSENREGISTRER DU MessageDeliveryService
        if (this.messageDeliveryService) {
          this.messageDeliveryService.unregisterUserSocket(userId, socketId);
        }

        // ✅ MARQUER OFFLINE DANS Redis
        if (this.onlineUserManager) {
          await this.onlineUserManager.setUserOffline(userId);
        }

        // Notifier les autres utilisateurs
        socket.broadcast.emit("user_disconnected", {
          userId,
          matricule: socket.matricule,
          timestamp: new Date().toISOString(),
          reason,
        });

        console.log(
          `👋 Utilisateur ${socket.matricule} (${userId}) déconnecté`
        );
      }
    } catch (error) {
      console.error("❌ Erreur handleDisconnection:", error);
    }
  }
}

module.exports = ChatHandler;
