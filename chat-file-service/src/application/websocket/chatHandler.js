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

        // ✅ QUICK LOAD - Navigation rapide (SANS cache controller)
        socket.on("messages:quickload", async (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          try {
            const { conversationId, limit = 20 } = data;
            const userId = socket.userId;

            if (!conversationId || !userId) {
              return socket.emit("messages:error", {
                error: "Paramètres manquants",
                code: "MISSING_PARAMS",
              });
            }

            console.log(`⚡ QuickLoad: ${conversationId} pour ${userId}`);

            // ✅ APPEL DIRECT AU USE CASE (cache géré par le repository)
            const result = await this.getMessagesUseCase.execute(
              conversationId,
              {
                limit,
                userId,
                useCache: true, // Le repository décide du cache
              }
            );

            const quickData = {
              messages: result.messages || [],
              hasMore: (result.messages?.length || 0) === limit,
              fromCache: result.fromCache || false,
            };

            socket.emit("messages:quick", {
              conversationId,
              ...quickData,
              timestamp: Date.now(),
            });
          } catch (error) {
            console.error("❌ Erreur messages:quickload:", error);
            socket.emit("messages:error", {
              error: "Erreur chargement rapide",
              code: "QUICKLOAD_FAILED",
            });
          }
        });

        // ✅ FULL LOAD - Chargement complet (SANS cache controller)
        socket.on("messages:fullload", async (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          try {
            const { conversationId, cursor = null, limit = 50 } = data;
            const userId = socket.userId;

            // ✅ APPEL DIRECT AU USE CASE
            const result = await this.getMessagesUseCase.execute(
              conversationId,
              {
                cursor,
                limit,
                userId,
                useCache: !cursor, // Cache seulement première page
              }
            );

            socket.emit("messages:full", {
              conversationId,
              ...result,
              timestamp: Date.now(),
            });
          } catch (error) {
            console.error("❌ Erreur messages:fullload:", error);
            socket.emit("messages:error", {
              error: "Erreur chargement complet",
              code: "FULLLOAD_FAILED",
            });
          }
        });

        // ✅ CONVERSATIONS QUICK LOAD - Navigation rapide (SANS cache controller)
        socket.on("conversations:quickload", async (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          try {
            const { limit = 10 } = data;
            const userId = socket.userId;

            if (!userId) {
              return socket.emit("conversations:error", {
                error: "Authentification requise",
                code: "AUTH_REQUIRED",
              });
            }

            console.log(`⚡ Conversations QuickLoad pour ${userId}`);

            // ✅ APPEL DIRECT AU USE CASE (cache géré par le repository)
            const result = await this.getConversationsUseCase.execute(userId, {
              page: 1,
              limit,
              useCache: true, // Le repository décide du cache
            });

            const quickData = {
              conversations: result.conversations || [],
              hasMore: (result.conversations?.length || 0) === limit,
              fromCache: result.fromCache || false,
              totalUnreadMessages: result.totalUnreadMessages || 0,
              unreadConversations: result.unreadConversations || 0,
            };

            socket.emit("conversations:quick", {
              ...quickData,
              timestamp: Date.now(),
            });
          } catch (error) {
            console.error("❌ Erreur conversations:quickload:", error);
            socket.emit("conversations:error", {
              error: "Erreur chargement rapide conversations",
              code: "QUICKLOAD_FAILED",
            });
          }
        });

        // ✅ CONVERSATIONS FULL LOAD - Chargement complet (SANS cache controller)
        socket.on("conversations:fullload", async (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          try {
            const { page = 1, limit = 20, cursor = null } = data;
            const userId = socket.userId;

            if (!userId) {
              return socket.emit("conversations:error", {
                error: "Authentification requise",
                code: "AUTH_REQUIRED",
              });
            }

            // ✅ APPEL DIRECT AU USE CASE
            const result = await this.getConversationsUseCase.execute(userId, {
              page: Math.max(1, parseInt(page)),
              limit: Math.min(parseInt(limit), 50),
              cursor,
              useCache: !cursor, // Cache seulement première page
            });

            socket.emit("conversations:full", {
              ...result,
              timestamp: Date.now(),
            });
          } catch (error) {
            console.error("❌ Erreur conversations:fullload:", error);
            socket.emit("conversations:error", {
              error: "Erreur chargement complet conversations",
              code: "FULLLOAD_FAILED",
            });
          }
        });

        // ✅ CONVERSATION DETAIL LOAD - Charger une conversation spécifique (SANS cache)
        socket.on("conversation:load", async (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          try {
            const { conversationId } = data;
            const userId = socket.userId;

            if (!conversationId || !userId) {
              return socket.emit("conversation:error", {
                error: "Paramètres manquants",
                code: "MISSING_PARAMS",
              });
            }

            console.log(
              `🔍 Chargement conversation ${conversationId} pour ${userId}`
            );

            // ✅ APPEL DIRECT AU USE CASE (cache géré par le repository)
            const result = await this.getConversationUseCase.execute(
              conversationId,
              {
                userId,
                useCache: true, // Le repository décide du cache
              }
            );

            socket.emit("conversation:loaded", {
              conversation: result.conversation || result,
              fromCache: result.fromCache || false,
              timestamp: Date.now(),
            });
          } catch (error) {
            console.error("❌ Erreur conversation:load:", error);
            socket.emit("conversation:error", {
              error: "Erreur chargement conversation",
              code: "LOAD_FAILED",
            });
          }
        });

        // ✅ HANDLERS EXISTANTS MODIFIÉS (SANS CACHE)
        socket.on("getConversations", async (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          try {
            const userId = socket.userId;
            const { page = 1, limit = 20 } = data || {};

            if (!userId) {
              return socket.emit("conversations_error", {
                message: "ID utilisateur manquant",
                code: "MISSING_USER_ID",
              });
            }

            // ✅ APPEL DIRECT AU USE CASE (SANS cache controller)
            const result = await this.getConversationsUseCase.execute(userId, {
              page: Math.max(1, parseInt(page)),
              limit: Math.min(parseInt(limit), 50),
              useCache: page === 1, // Cache seulement première page
            });

            socket.emit("conversationsLoaded", {
              conversations: result.conversations || [],
              pagination: result.pagination || {},
              totalUnreadMessages: result.totalUnreadMessages || 0,
              unreadConversations: result.unreadConversations || 0,
              fromCache: result.fromCache || false,
              timestamp: Date.now(),
            });
          } catch (error) {
            console.error("❌ Erreur getConversations:", error);
            socket.emit("conversations_error", {
              message: "Erreur lors de la récupération des conversations",
              code: "GET_CONVERSATIONS_ERROR",
            });
          }
        });

        socket.on("getConversation", async (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          try {
            const userId = socket.userId;
            const { conversationId } = data || {};

            if (!conversationId || !userId) {
              return socket.emit("conversation_error", {
                message: "ID conversation ou utilisateur manquant",
                code: "MISSING_DATA",
              });
            }

            // ✅ APPEL DIRECT AU USE CASE (SANS cache controller)
            const result = await this.getConversationUseCase.execute(
              conversationId,
              {
                userId,
                useCache: true, // Le repository décide du cache
              }
            );

            socket.emit("conversationLoaded", {
              conversation: result.conversation || result,
              metadata: {
                fromCache: result.fromCache || false,
                timestamp: new Date().toISOString(),
              },
            });
          } catch (error) {
            console.error("❌ Erreur getConversation:", error);
            socket.emit("conversation_error", {
              message: "Erreur lors de la récupération de la conversation",
              code: "GET_CONVERSATION_ERROR",
            });
          }
        });

        // ========================================
        // ✅ NOUVEAUX ÉVÉNEMENTS GROUPES ET DIFFUSION
        // ========================================

        // ✅ CRÉER UN GROUPE
        socket.on("createGroup", async (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          try {
            const userId = socket.userId;

            if (!userId) {
              return socket.emit("group:error", {
                error: "Authentification requise",
                code: "AUTH_REQUIRED",
              });
            }

            const { name, members, groupId } = data;

            // ✅ VALIDATION
            if (!name || typeof name !== "string" || name.trim().length === 0) {
              return socket.emit("group:error", {
                error: "Nom du groupe requis",
                code: "MISSING_GROUP_NAME",
              });
            }

            if (!Array.isArray(members) || members.length === 0) {
              return socket.emit("group:error", {
                error: "Liste des membres requise (minimum 1 membre)",
                code: "MISSING_MEMBERS",
              });
            }

            if (members.includes(userId)) {
              return socket.emit("group:error", {
                error:
                  "Vous ne devez pas vous inclure dans la liste des membres",
                code: "ADMIN_IN_MEMBERS",
              });
            }

            console.log(
              `👥 Création groupe "${name}" par ${userId} avec ${members.length} membre(s)`
            );

            // ✅ GÉNÉRER ID SI NON FOURNI
            const finalGroupId = groupId || this.generateObjectId();

            // ✅ APPEL USE CASE
            const group = await this.createGroupUseCase.execute({
              groupId: finalGroupId,
              name: name.trim(),
              adminId: userId,
              members: members.filter((id) => id !== userId), // S'assurer que admin n'est pas dans members
            });

            // ✅ RÉPONSE SUCCÈS À L'ADMIN
            socket.emit("group:created", {
              success: true,
              group: {
                id: group._id,
                name: group.name,
                type: group.type,
                participants: group.participants,
                createdBy: group.createdBy,
                createdAt: group.createdAt,
                participantCount: group.participants.length,
              },
              timestamp: new Date().toISOString(),
            });

            // ✅ NOTIFIER TOUS LES PARTICIPANTS
            const allParticipants = [userId, ...members];
            for (const participantId of allParticipants) {
              const participantRoom = `user_${participantId}`;

              socket.to(participantRoom).emit("group:invitation", {
                group: {
                  id: group._id,
                  name: group.name,
                  type: group.type,
                  createdBy: group.createdBy,
                  createdAt: group.createdAt,
                },
                invitedBy: {
                  userId: userId,
                  matricule: socket.matricule,
                },
                timestamp: new Date().toISOString(),
              });
            }

            // ✅ JOINDRE AUTOMATIQUEMENT LA ROOM DU GROUPE
            const groupRoom = `conversation_${group._id}`;
            socket.join(groupRoom);

            console.log(`✅ Groupe "${name}" créé avec succès: ${group._id}`);
          } catch (error) {
            console.error("❌ Erreur createGroup:", error);
            socket.emit("group:error", {
              error: "Erreur lors de la création du groupe",
              code: "CREATE_GROUP_FAILED",
              details:
                process.env.NODE_ENV === "development"
                  ? error.message
                  : undefined,
            });
          }
        });

        // ✅ CRÉER UNE LISTE DE DIFFUSION
        socket.on("createBroadcast", async (data) => {
          if (this.onlineUserManager && socket.userId) {
            this.onlineUserManager.updateLastActivity(socket.userId, socket);
          }
          try {
            const userId = socket.userId;

            if (!userId) {
              return socket.emit("broadcast:error", {
                error: "Authentification requise",
                code: "AUTH_REQUIRED",
              });
            }

            const { name, recipients, broadcastId, admins = [] } = data;

            // ✅ VALIDATION
            if (!name || typeof name !== "string" || name.trim().length === 0) {
              return socket.emit("broadcast:error", {
                error: "Nom de la diffusion requis",
                code: "MISSING_BROADCAST_NAME",
              });
            }

            if (!Array.isArray(recipients) || recipients.length === 0) {
              return socket.emit("broadcast:error", {
                error:
                  "Liste des destinataires requise (minimum 1 destinataire)",
                code: "MISSING_RECIPIENTS",
              });
            }

            if (recipients.includes(userId)) {
              return socket.emit("broadcast:error", {
                error:
                  "Vous ne devez pas vous inclure dans la liste des destinataires",
                code: "ADMIN_IN_RECIPIENTS",
              });
            }

            console.log(
              `📢 Création diffusion "${name}" par ${userId} avec ${recipients.length} destinataire(s)`
            );

            // ✅ GÉNÉRER ID SI NON FOURNI
            const finalBroadcastId = broadcastId || this.generateObjectId();

            // ✅ PRÉPARER LES ADMINS
            const finalAdmins =
              Array.isArray(admins) && admins.length > 0
                ? [
                    ...new Set([
                      userId,
                      ...admins.filter((id) => id !== userId),
                    ]),
                  ]
                : [userId];

            // ✅ APPEL USE CASE
            const broadcast = await this.createBroadcastUseCase.execute({
              broadcastId: finalBroadcastId,
              name: name.trim(),
              adminIds: finalAdmins,
              recipientIds: recipients.filter(
                (id) => !finalAdmins.includes(id)
              ),
            });

            // ✅ RÉPONSE SUCCÈS À L'ADMIN
            socket.emit("broadcast:created", {
              success: true,
              broadcast: {
                id: broadcast._id,
                name: broadcast.name,
                type: broadcast.type,
                participants: broadcast.participants,
                createdBy: broadcast.createdBy,
                createdAt: broadcast.createdAt,
                participantCount: broadcast.participants.length,
                adminIds: finalAdmins,
                recipientIds: recipients,
              },
              timestamp: new Date().toISOString(),
            });

            // ✅ NOTIFIER TOUS LES ADMINS (sauf le créateur)
            for (const adminId of finalAdmins) {
              if (adminId !== userId) {
                const adminRoom = `user_${adminId}`;
                socket.to(adminRoom).emit("broadcast:admin_added", {
                  broadcast: {
                    id: broadcast._id,
                    name: broadcast.name,
                    type: broadcast.type,
                    createdBy: broadcast.createdBy,
                    createdAt: broadcast.createdAt,
                  },
                  addedBy: {
                    userId: userId,
                    matricule: socket.matricule,
                  },
                  timestamp: new Date().toISOString(),
                });
              }
            }

            // ✅ NOTIFIER TOUS LES DESTINATAIRES
            for (const recipientId of recipients) {
              const recipientRoom = `user_${recipientId}`;

              socket.to(recipientRoom).emit("broadcast:subscription", {
                broadcast: {
                  id: broadcast._id,
                  name: broadcast.name,
                  type: broadcast.type,
                  createdBy: broadcast.createdBy,
                  createdAt: broadcast.createdAt,
                },
                subscribedBy: {
                  userId: userId,
                  matricule: socket.matricule,
                },
                timestamp: new Date().toISOString(),
              });
            }

            // ✅ JOINDRE AUTOMATIQUEMENT LA ROOM DE LA DIFFUSION
            const broadcastRoom = `conversation_${broadcast._id}`;
            socket.join(broadcastRoom);

            console.log(
              `✅ Diffusion "${name}" créée avec succès: ${broadcast._id}`
            );
          } catch (error) {
            console.error("❌ Erreur createBroadcast:", error);
            socket.emit("broadcast:error", {
              error: "Erreur lors de la création de la diffusion",
              code: "CREATE_BROADCAST_FAILED",
              details:
                process.env.NODE_ENV === "development"
                  ? error.message
                  : undefined,
            });
          }
        });

        // ✅ REJOINDRE UN GROUPE/DIFFUSION EXISTANT
        socket.on("joinGroup", async (data) => {
          try {
            const userId = socket.userId;
            const { conversationId, accept = true } = data;

            if (!userId || !conversationId) {
              return socket.emit("group:error", {
                error: "Paramètres manquants",
                code: "MISSING_PARAMS",
              });
            }

            if (accept) {
              // ✅ JOINDRE LA ROOM
              const groupRoom = `conversation_${conversationId}`;
              socket.join(groupRoom);

              // ✅ NOTIFIER LES AUTRES PARTICIPANTS
              socket.to(groupRoom).emit("group:member_joined", {
                conversationId,
                user: {
                  userId: userId,
                  matricule: socket.matricule,
                },
                timestamp: new Date().toISOString(),
              });

              socket.emit("group:joined", {
                success: true,
                conversationId,
                timestamp: new Date().toISOString(),
              });

              console.log(
                `✅ ${socket.matricule} a rejoint le groupe/diffusion: ${conversationId}`
              );
            } else {
              // ✅ REFUSER L'INVITATION
              socket.emit("group:invitation_declined", {
                conversationId,
                timestamp: new Date().toISOString(),
              });

              console.log(
                `❌ ${socket.matricule} a refusé l'invitation: ${conversationId}`
              );
            }
          } catch (error) {
            console.error("❌ Erreur joinGroup:", error);
            socket.emit("group:error", {
              error: "Erreur lors de la jointure",
              code: "JOIN_GROUP_FAILED",
            });
          }
        });

        // ✅ QUITTER UN GROUPE/DIFFUSION
        socket.on("leaveGroup", async (data) => {
          try {
            const userId = socket.userId;
            const { conversationId } = data;

            if (!userId || !conversationId) {
              return socket.emit("group:error", {
                error: "Paramètres manquants",
                code: "MISSING_PARAMS",
              });
            }

            // ✅ QUITTER LA ROOM
            const groupRoom = `conversation_${conversationId}`;
            socket.leave(groupRoom);

            // ✅ NOTIFIER LES AUTRES PARTICIPANTS
            socket.to(groupRoom).emit("group:member_left", {
              conversationId,
              user: {
                userId: userId,
                matricule: socket.matricule,
              },
              timestamp: new Date().toISOString(),
            });

            socket.emit("group:left", {
              success: true,
              conversationId,
              timestamp: new Date().toISOString(),
            });

            console.log(
              `👋 ${socket.matricule} a quitté le groupe/diffusion: ${conversationId}`
            );

            // ✅ TODO: Implémenter la suppression du participant de la conversation en DB
            // if (this.leaveGroupUseCase) {
            //   await this.leaveGroupUseCase.execute({ conversationId, userId });
            // }
          } catch (error) {
            console.error("❌ Erreur leaveGroup:", error);
            socket.emit("group:error", {
              error: "Erreur lors de la sortie du groupe",
              code: "LEAVE_GROUP_FAILED",
            });
          }
        });

        // ✅ OBTENIR INFO D'UN GROUPE/DIFFUSION
        socket.on("getGroupInfo", async (data) => {
          try {
            const userId = socket.userId;
            const { conversationId } = data;

            if (!userId || !conversationId) {
              return socket.emit("group:error", {
                error: "Paramètres manquants",
                code: "MISSING_PARAMS",
              });
            }

            // ✅ APPEL USE CASE POUR RÉCUPÉRER INFO
            const result = await this.getConversationUseCase.execute(
              conversationId,
              {
                userId,
                useCache: true,
              }
            );

            if (!result.conversation) {
              return socket.emit("group:error", {
                error: "Groupe/Diffusion non trouvé",
                code: "GROUP_NOT_FOUND",
              });
            }

            const conversation = result.conversation;

            // ✅ VÉRIFIER QUE L'UTILISATEUR EST PARTICIPANT
            if (!conversation.participants.includes(userId)) {
              return socket.emit("group:error", {
                error: "Vous n'êtes pas membre de ce groupe/diffusion",
                code: "NOT_MEMBER",
              });
            }

            socket.emit("group:info", {
              success: true,
              group: {
                id: conversation._id,
                name: conversation.name,
                type: conversation.type,
                participants: conversation.participants,
                participantCount: conversation.participants.length,
                createdBy: conversation.createdBy,
                createdAt: conversation.createdAt,
                lastMessage: conversation.lastMessage,
                settings: conversation.settings,
                metadata: conversation.metadata,
              },
              fromCache: result.fromCache || false,
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            console.error("❌ Erreur getGroupInfo:", error);
            socket.emit("group:error", {
              error: "Erreur lors de la récupération des informations",
              code: "GET_GROUP_INFO_FAILED",
            });
          }
        });

        // ========================================
        // ✅ NOUVEAUX HANDLERS DE PRÉSENCE
        // ========================================

        // ✅ OBTENIR LES UTILISATEURS EN LIGNE D'UNE CONVERSATION
        socket.on("getConversationOnlineUsers", async (data) => {
          try {
            const { conversationId } = data;
            const userId = socket.userId;

            if (!conversationId || !userId) {
              return socket.emit("conversation_users:error", {
                error: "Paramètres manquants",
                code: "MISSING_PARAMS",
              });
            }

            if (!this.roomManager) {
              return socket.emit("conversation_users:error", {
                error: "Service de présence non disponible",
                code: "PRESENCE_SERVICE_UNAVAILABLE",
              });
            }

            const roomName = `conv_${conversationId}`;

            // Vérifier que l'utilisateur fait partie de la conversation
            const roomUsers = await this.roomManager.getRoomUsers(roomName);
            const isMember = roomUsers.some((user) => user.userId === userId);

            if (!isMember) {
              return socket.emit("conversation_users:error", {
                error: "Vous n'êtes pas membre de cette conversation",
                code: "NOT_A_MEMBER",
              });
            }

            // Récupérer les statistiques de présence
            const presenceStats = await this.roomManager.getRoomPresenceStats(
              roomName
            );

            socket.emit("conversation_online_users", {
              conversationId,
              ...presenceStats,
              userRole: await this.roomManager.getUserRoleInRoom(
                roomName,
                userId
              ),
              currentUserStatus: presenceStats.users.find(
                (u) => u.userId === userId
              ),
            });

            console.log(
              `👥 Statistiques envoyées pour ${conversationId}: ${presenceStats.onlineUsers}/${presenceStats.totalUsers}`
            );
          } catch (error) {
            console.error("❌ Erreur getConversationOnlineUsers:", error);
            socket.emit("conversation_users:error", {
              error: "Erreur lors de la récupération des utilisateurs",
              code: "GET_USERS_ERROR",
              details:
                process.env.NODE_ENV === "development"
                  ? error.message
                  : undefined,
            });
          }
        });

        // ✅ OBTENIR TOUTES LES CONVERSATIONS AVEC PRÉSENCE
        socket.on("getConversationsWithPresence", async () => {
          try {
            const userId = socket.userId;

            if (!userId) {
              return socket.emit("conversations_presence:error", {
                error: "Authentification requise",
                code: "AUTH_REQUIRED",
              });
            }

            if (!this.roomManager) {
              return socket.emit("conversations_presence:error", {
                error: "Service de présence non disponible",
                code: "PRESENCE_SERVICE_UNAVAILABLE",
              });
            }

            const conversations =
              await this.roomManager.getConversationsWithPresence(userId);

            socket.emit("conversations_with_presence", {
              userId,
              conversations,
              count: conversations.length,
              summary: {
                totalConversations: conversations.length,
                activeConversations: conversations.filter((c) => c.isActive)
                  .length,
                totalOnlineUsers: conversations.reduce(
                  (sum, c) => sum + c.onlineUsers,
                  0
                ),
                averageHealth:
                  conversations.length > 0
                    ? conversations.reduce((sum, c) => {
                        const healthScore =
                          c.roomHealth === "healthy"
                            ? 3
                            : c.roomHealth === "moderate"
                            ? 2
                            : c.roomHealth === "low"
                            ? 1
                            : 0;
                        return sum + healthScore;
                      }, 0) / conversations.length
                    : 0,
              },
              timestamp: new Date().toISOString(),
            });

            console.log(
              `📋 Conversations avec présence envoyées à ${socket.matricule}: ${conversations.length}`
            );
          } catch (error) {
            console.error("❌ Erreur getConversationsWithPresence:", error);
            socket.emit("conversations_presence:error", {
              error: "Erreur lors de la récupération des conversations",
              code: "GET_CONVERSATIONS_ERROR",
              details:
                process.env.NODE_ENV === "development"
                  ? error.message
                  : undefined,
            });
          }
        });

        // ✅ SURVEILLANCE EN TEMPS RÉEL (subscribe aux updates)
        socket.on("subscribeToPresence", async (data) => {
          try {
            const { conversationId } = data;
            const userId = socket.userId;

            if (!conversationId || !userId) {
              return socket.emit("presence:error", {
                error: "Paramètres manquants",
                code: "MISSING_PARAMS",
              });
            }

            if (!this.roomManager) {
              return socket.emit("presence:error", {
                error: "Service de présence non disponible",
                code: "PRESENCE_SERVICE_UNAVAILABLE",
              });
            }

            const roomName = `conv_${conversationId}`;

            // Joindre la room de présence
            socket.join(`presence_${roomName}`);

            // Envoyer les données initiales
            const presenceStats = await this.roomManager.getRoomPresenceStats(
              roomName
            );

            socket.emit("presence:initial", {
              conversationId,
              ...presenceStats,
              subscribed: true,
              timestamp: new Date().toISOString(),
            });

            // Broadcast la mise à jour à tous les abonnés
            await this.roomManager.broadcastPresenceUpdate(roomName);

            console.log(
              `👁️ ${socket.matricule} surveille la présence de ${conversationId}`
            );
          } catch (error) {
            console.error("❌ Erreur subscribeToPresence:", error);
            socket.emit("presence:error", {
              error: "Erreur lors de l'abonnement",
              code: "SUBSCRIBE_ERROR",
              details:
                process.env.NODE_ENV === "development"
                  ? error.message
                  : undefined,
            });
          }
        });

        // ✅ SE DÉSABONNER DE LA SURVEILLANCE
        socket.on("unsubscribeFromPresence", (data) => {
          try {
            const { conversationId } = data;

            if (conversationId) {
              const roomName = `conv_${conversationId}`;
              socket.leave(`presence_${roomName}`);

              socket.emit("presence:unsubscribed", {
                conversationId,
                timestamp: new Date().toISOString(),
              });

              console.log(
                `🚫 ${socket.matricule} ne surveille plus ${conversationId}`
              );
            }
          } catch (error) {
            console.error("❌ Erreur unsubscribeFromPresence:", error);
          }
        });

        // ✅ DASHBOARD GLOBAL DE PRÉSENCE
        socket.on("getPresenceDashboard", async () => {
          try {
            const userId = socket.userId;

            if (!userId) {
              return socket.emit("presence_dashboard:error", {
                error: "Authentification requise",
                code: "AUTH_REQUIRED",
              });
            }

            if (!this.roomManager) {
              return socket.emit("presence_dashboard:error", {
                error: "Service de présence non disponible",
                code: "PRESENCE_SERVICE_UNAVAILABLE",
              });
            }

            const dashboard =
              await this.roomManager.getGlobalPresenceDashboard();

            socket.emit("presence_dashboard", dashboard);

            console.log(
              `📊 Dashboard de présence envoyé à ${socket.matricule}`
            );
          } catch (error) {
            console.error("❌ Erreur getPresenceDashboard:", error);
            socket.emit("presence_dashboard:error", {
              error: "Erreur lors de la génération du dashboard",
              code: "DASHBOARD_ERROR",
            });
          }
        });

        // ✅ DÉFINIR LE RÔLE D'UN UTILISATEUR
        socket.on("setUserRole", async (data) => {
          try {
            const { conversationId, targetUserId, role } = data;
            const adminUserId = socket.userId;

            if (!conversationId || !targetUserId || !role || !adminUserId) {
              return socket.emit("role:error", {
                error: "Paramètres manquants",
                code: "MISSING_PARAMS",
              });
            }

            if (!this.roomManager) {
              return socket.emit("role:error", {
                error: "Service non disponible",
                code: "SERVICE_UNAVAILABLE",
              });
            }

            const roomName = `conv_${conversationId}`;

            // Vérifier que l'admin a les droits
            const adminRole = await this.roomManager.getUserRoleInRoom(
              roomName,
              adminUserId
            );
            if (adminRole !== "admin" && adminRole !== "moderator") {
              return socket.emit("role:error", {
                error: "Permissions insuffisantes",
                code: "INSUFFICIENT_PERMISSIONS",
              });
            }

            // Valider le rôle
            const validRoles = ["member", "moderator", "admin"];
            if (!validRoles.includes(role)) {
              return socket.emit("role:error", {
                error: "Rôle invalide",
                code: "INVALID_ROLE",
              });
            }

            // Définir le rôle
            const success = await this.roomManager.setUserRoleInRoom(
              roomName,
              targetUserId,
              role
            );

            if (success) {
              socket.emit("role:updated", {
                conversationId,
                targetUserId,
                role,
                updatedBy: adminUserId,
                timestamp: new Date().toISOString(),
              });

              // Notifier la room
              socket.to(roomName).emit("user:role_changed", {
                conversationId,
                userId: targetUserId,
                newRole: role,
                changedBy: {
                  userId: adminUserId,
                  matricule: socket.matricule,
                },
                timestamp: new Date().toISOString(),
              });

              // Broadcast la mise à jour de présence
              await this.roomManager.broadcastPresenceUpdate(roomName);
            } else {
              socket.emit("role:error", {
                error: "Erreur lors de la mise à jour du rôle",
                code: "UPDATE_FAILED",
              });
            }
          } catch (error) {
            console.error("❌ Erreur setUserRole:", error);
            socket.emit("role:error", {
              error: "Erreur lors de la définition du rôle",
              code: "ROLE_ERROR",
            });
          }
        });

        // ✅ METTRE À JOUR automatiquement la présence lors des interactions
        const originalHandlers = {
          joinConversation: this.handleJoinConversation.bind(this),
          sendMessage: this.handleSendMessage.bind(this),
          typing: this.handleTyping.bind(this),
          stopTyping: this.handleStopTyping.bind(this),
        };

        // Override joinConversation
        socket.on("joinConversation", async (data) => {
          try {
            // Appeler le handler original
            await originalHandlers.joinConversation(socket, data);

            // Mettre à jour la présence
            if (this.roomManager && data.conversationId) {
              const roomName = `conv_${data.conversationId}`;
              await this.roomManager.updateRoomActivity(roomName);
              await this.roomManager.broadcastPresenceUpdate(roomName);
            }
          } catch (error) {
            console.error("❌ Erreur joinConversation avec présence:", error);
          }
        });

        // ... autres overrides si nécessaire ...
      });

      console.log("✅ Gestionnaires Socket.IO configurés avec présence");
    } catch (error) {
      console.error("❌ Erreur configuration Socket.IO:", error);
    }
  }

  // ✅ AUTHENTIFICATION
  async handleAuthentication(socket, data) {
    const authStartTime = Date.now();
    const authStartDate = new Date().toISOString();
    console.log(`\n🔐 [${authStartDate}] ⏱️ AUTHENTIFICATION DÉBUTÉE`);
    try {
      console.log(
        `🔐 [${new Date().toISOString()}] Authentification demande:`,
        data
      );

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
          departement: data.departement || "",
        };
      }

      socket.userId = userPayload.id || userPayload.userId;
      socket.matricule = userPayload.matricule || "";
      socket.nom = userPayload.nom || "";
      socket.prenom = userPayload.prenom || "";
      socket.ministere = userPayload.ministere || "";
      socket.departement = userPayload.departement || "";
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

      // ✅ RÉCUPÉRATION DES CONVERSATIONS EN ARRIÈRE-PLAN (non-bloquante)
      setImmediate(async () => {
        const convStartTime = Date.now();
        console.log(
          `🔍 [${new Date().toISOString()}] Début récupération conversations (ARRIÈRE-PLAN)`
        );

        if (this.getConversationIdsUseCase) {
          try {
            const conversationIdsData =
              await this.getConversationIdsUseCase.execute(userIdString);

            if (!Array.isArray(conversationIdsData)) {
              console.warn(`⚠️ conversationIds n'est pas un tableau`);
              return;
            }

            const convDuration = Date.now() - convStartTime;
            console.log(
              `✅ [${new Date().toISOString()}] Récupération ${
                conversationIdsData.length
              } conversations pour ${userIdString} (⏱️ ${convDuration}ms)`
            );

            if (conversationIdsData.length > 0) {
              // ✅ JOINTURE DES ROOMS EN ARRIÈRE-PLAN
              const joinStartTime = Date.now();
              console.log(
                `👥 [${new Date().toISOString()}] Début jointure rooms (ARRIÈRE-PLAN)`
              );
              for (const convId of conversationIdsData) {
                const roomName = `conversation_${convId}`;
                socket.join(roomName);
              }
              const joinDuration = Date.now() - joinStartTime;
              console.log(
                `👥 [${new Date().toISOString()}] Jointure rooms terminée (⏱️ ${joinDuration}ms)`
              );

              // ✅ MISE À JOUR STATUT EN ARRIÈRE-PLAN
              const updateStartTime = Date.now();
              console.log(
                `📝 [${new Date().toISOString()}] Mise à jour statut lancée`
              );
              await Promise.all(
                conversationIdsData.map(async (convId) => {
                  if (this.updateMessageStatusUseCase) {
                    try {
                      await this.updateMessageStatusUseCase.execute({
                        conversationId: convId,
                        receiverId: userIdString,
                        status: "DELIVERED",
                        messageIds: null,
                      });
                    } catch (deliveredError) {
                      console.warn(
                        `⚠️ Erreur marquage delivered:`,
                        deliveredError.message
                      );
                    }
                  }
                })
              );
              const updateDuration = Date.now() - updateStartTime;
              console.log(
                `📝 [${new Date().toISOString()}] Mise à jour statut terminée (⏱️ ${updateDuration}ms)`
              );
            }
          } catch (convError) {
            console.warn(
              `⚠️ Erreur récupération conversations (ARRIÈRE-PLAN):`,
              convError.message
            );
          }
        }
      });

      if (
        socket.ministere &&
        typeof socket.ministere === "string" &&
        socket.ministere.trim()
      ) {
        try {
          const ministereRoom = `ministere_${socket.ministere
            .replace(/\s+/g, "_")
            .toLowerCase()}`;
          socket.join(ministereRoom);
          console.log(
            `🏛️ Utilisateur ${userIdString} rejoint room ministère: ${ministereRoom}`
          );
        } catch (ministereError) {
          console.error(
            `❌ Erreur jointure room ministère: ${ministereError.message}`
          );
        }
      } else {
        if (socket.ministere) {
          console.warn(
            `⚠️ socket.ministere n'est pas une chaîne valide: ${typeof socket.ministere} = ${JSON.stringify(
              socket.ministere
            )}`
          );
        }
      }

      const emitStartTime = Date.now();
      console.log(
        `📤 [${new Date().toISOString()}] Avant socket.emit('authenticated')...`
      );
      try {
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
        const emitDuration = Date.now() - emitStartTime;
        console.log(
          `✅ [${new Date().toISOString()}] socket.emit('authenticated') succès (⏱️ ${emitDuration}ms)`
        );
      } catch (emitErr) {
        console.error(`❌ Erreur lors du socket.emit: ${emitErr.message}`);
        throw emitErr;
      }

      console.log(
        `✅ [${new Date().toISOString()}] Utilisateur authentifié: ${matriculeString} (${userIdString})`
      );

      // ✅ ENREGISTRER LE SOCKET DANS MessageDeliveryService
      console.log(
        `🔍 [${new Date().toISOString()}] messageDeliveryService disponible? ${
          this.messageDeliveryService ? "✅ OUI" : "❌ NON"
        }`
      );

      if (this.messageDeliveryService) {
        const mdsStartTime = Date.now();
        try {
          console.log(
            `📤 [${new Date().toISOString()}] Enregistrement socket pour ${userIdString}...`
          );
          this.messageDeliveryService.registerUserSocket(userIdString, socket);
          console.log(
            `✅ [${new Date().toISOString()}] Socket enregistré pour ${userIdString}`
          );

          // ✅ LIVRER LES MESSAGES EN ATTENTE
          console.log(
            `📥 [${new Date().toISOString()}] Livraison messages en attente pour ${userIdString}...`
          );
          const deliveredCount =
            await this.messageDeliveryService.deliverPendingMessagesOnConnect(
              userIdString,
              socket
            );
          const mdsDuration = Date.now() - mdsStartTime;
          console.log(
            `✅ [${new Date().toISOString()}] ${deliveredCount} message(s) en attente livré(s) pour ${userIdString} (⏱️ ${mdsDuration}ms)`
          );
        } catch (mdsError) {
          console.error(
            `❌ Erreur MessageDeliveryService: ${mdsError.message}`
          );
        }
      } else {
        console.warn(
          `⚠️ [${new Date().toISOString()}] messageDeliveryService est NULL/UNDEFINED!`
        );
      }

      // ✅ SYNCHRONISATION REDIS EN ARRIÈRE-PLAN (non-bloquante)
      setImmediate(() => this.syncUserWithRedis(userIdString, userData));

      socket.broadcast.emit("user_connected", {
        userId: userIdString,
        matricule: matriculeString,
        timestamp: new Date().toISOString(),
      });

      const totalDuration = Date.now() - authStartTime;
      console.log(
        `\n✅ [${new Date().toISOString()}] ⏱️ AUTHENTIFICATION COMPLÈTE (⏱️ TOTAL: ${totalDuration}ms)\n`
      );
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

    // ✅ BROADCASTER LES MISES À JOUR DE PRÉSENCE
    if (this.roomManager && socket.userId) {
      const userRooms = await this.roomManager.getUserRooms(socket.userId);

      for (const roomName of userRooms) {
        if (roomName.startsWith("conv_")) {
          setTimeout(() => {
            this.roomManager.broadcastPresenceUpdate(roomName);
          }, 500);
        }
      }
    }

  }

  // ✅ SYNC REDIS - Via OnlineUserManager UNIQUEMENT
  async syncUserWithRedis(userId, userData) {
    const syncStartTime = Date.now();
    console.log(
      `🔴 [${new Date().toISOString()}] Sync Redis lancé en arrière-plan pour ${userId}`
    );
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
        const syncDuration = Date.now() - syncStartTime;
        console.log(
          `✅ [${new Date().toISOString()}] Utilisateur ${userId} synchronisé avec Redis (⏱️ ${syncDuration}ms)`
        );
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
