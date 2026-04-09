const UserCacheService = require("../../infrastructure/services/UserCacheService");

class SendMessage {
  constructor(
    messageRepository,
    conversationRepository,
    cacheService = null,
    resilientService = null,
    userCacheService = null,
    getFileUseCase = null, // ✅ AJOUT
  ) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
    this.cacheService = cacheService;
    this.resilientService = resilientService;
    this.userCacheService = userCacheService || new UserCacheService();
    this.getFileUseCase = getFileUseCase; // ✅ AJOUT
  }

  // ✅ MODIFIER LA MÉTHODE execute() - RETIRER KAFKA
  async execute(messageData) {
    const startTime = Date.now();

    try {
      const {
        content,
        senderId,
        senderSocketId = null,
        conversationId = null,
        type = "TEXT",
        receiverId = null,
        conversationName = null,
        fileId = null,
        callMetadata = null,
        // ✅ CHAMP DE RÉPONSE (optionnel, fourni par replyToMessage)
        replyTo = null,
        // ✅ CHAMPS DE TRANSFERT (optionnels, fournis par ForwardMessage)
        isForwarded = false,
        forwardedFrom = null,
        originalSenderId = null,
      } = messageData;

      // ✅ Pour les appels, le contenu est auto-généré si absent
      const isCallType = type === "CALL" || type === "VIDEO_CALL";
      const finalContent =
        isCallType && !content
          ? type === "CALL"
            ? "📞 Appel audio"
            : "📹 Appel vidéo"
          : content;

      if (!finalContent || !senderId) {
        throw new Error("Données de message incomplètes");
      }

      // ✅ RÉCUPÉRER LES INFOS DU FICHIER SI fileId EST FOURNI
      let fileMetadata = null;
      if (fileId && this.getFileUseCase) {
        try {
          console.log(`📎 Récupération métadonnées fichier: ${fileId}`);
          const file = await this.getFileUseCase.execute(fileId, senderId);

          if (file) {
            // ✅ La durée est dans file.metadata.content.duration (audio/vidéo)
            const fileDuration = file.metadata?.content?.duration || null;

            fileMetadata = {
              fileId: file._id,
              fileName: file.originalName,
              fileSize: file.size,
              duration: fileDuration, // ✅ Correspond au schéma MessageModel
              mimeType: file.mimeType, // ✅ Type MIME du fichier
              url: file.url,
              thumbnailUrl: file.metadata?.processing?.thumbnailUrl || null,
              uploadedAt: file.createdAt,
              status: file.status,
            };
            console.log(`✅ Métadonnées fichier récupérées:`, fileMetadata);
          }
        } catch (fileError) {
          // Bloquer l'envoi si le fichier est invalide/supprimé
          console.error(`❌ Fichier invalide (${fileId}):`, fileError.message);
          throw new Error(`Fichier invalide: ${fileError.message}`);
        }
      }

      // ✅ CONSTRUIRE LES MÉTADONNÉES D'APPEL SI TYPE CALL/VIDEO_CALL
      let callMeta = null;
      if (isCallType && callMetadata) {
        callMeta = {
          callId: callMetadata.callId || null,
          callType: type === "VIDEO_CALL" ? "VIDEO" : "AUDIO",
          status: callMetadata.status || "INITIATED",
          initiatorId: callMetadata.initiatorId || senderId,
          receiverIds:
            callMetadata.receiverIds ||
            (receiverId
              ? Array.isArray(receiverId)
                ? receiverId
                : [receiverId]
              : []),
          startedAt: callMetadata.startedAt || null,
          endedAt: callMetadata.endedAt || null,
          duration: callMetadata.duration || 0,
          endReason: callMetadata.endReason || null,
        };
        console.log(`📞 Métadonnées appel construites:`, callMeta);
      }

      console.log(`💬 Traitement message: ${senderId} → ${conversationId}`, {
        hasReceiverId: !!receiverId,
        contentLength: finalContent.length,
        type,
        fileId,
        isCall: isCallType,
      });

      // ✅ CRÉER/VÉRIFIER LA CONVERSATION
      let conversation = null;

      if (conversationId) {
        try {
          console.log(`🔍 Recherche conversation: ${conversationId}`);
          conversation =
            await this.conversationRepository.findById(conversationId);

          if (conversation && conversation._id) {
            console.log(`✅ Conversation trouvée: ${conversationId}`);

            // Vérifier que l'expéditeur est participant
            if (!conversation.participants.includes(senderId)) {
              throw new Error(
                `L'utilisateur ${senderId} n'est pas participant de cette conversation`,
              );
            }

            if (conversation.type === "CHANNEL") {
              if (!conversation.settings.broadcastAdmins.includes(senderId)) {
                throw new Error(
                  `L'utilisateur ${senderId} n'est pas autorisé à envoyer des messages dans ce canal`,
                );
              }
            }
          } else {
            console.log(`⚠️ Conversation ${conversationId} introuvable`);
            conversation = null;
          }
        } catch (findError) {
          console.log(
            `⚠️ Erreur lors de la recherche conversation ${conversationId}:`,
            findError.message,
          );
          conversation = null;
        }
      }

      // ✅ CRÉER LA CONVERSATION SI ELLE N'EXISTE PAS
      if (!conversation) {
        if (!receiverId) {
          throw new Error(
            "receiverId est requis pour créer une nouvelle conversation",
          );
        }

        if (receiverId === senderId) {
          throw new Error("receiverId doit être différent du senderId");
        }

        console.log(
          `🆕 Création automatique conversation privée: ${conversationId}`,
        );

        try {
          conversation = await this.createConversationIfNotExists(
            conversationId,
            senderId,
            receiverId,
            conversationName,
          );

          if (conversation && conversation._id) {
            console.log(`✅ Conversation privée créée: ${conversation._id}`, {
              participants: conversation.participants,
              participantsCount: conversation.participants?.length,
            });

            // ✅ PUBLIER ÉVÉNEMENT CONVERSATION CRÉÉE
            if (this.resilientService) {
              try {
                await this.resilientService.addToStream(
                  "chat:stream:events:conversation:created",
                  {
                    event: "conversation.created",
                    conversationId: conversation._id.toString(),
                    conversation: conversation,
                    type: "PRIVATE",
                    createdBy: senderId,
                    participants: JSON.stringify(conversation.participants),
                    name: conversation.name || "Conversation privée",
                    participantCount:
                      conversation.participants.length.toString(),
                    timestamp: Date.now().toString(),
                  },
                );
                console.log(
                  `📤 Événement conversation créée publiée pour ${conversation._id}`,
                );

                // ✅ ATTENDRE 100ms pour laisser le temps au consumer de distribuer l'événement
                await new Promise((resolve) => setTimeout(resolve, 100));
                console.log(
                  `⏱️ Délai de 100ms appliqué pour synchronisation conversation/message`,
                );
              } catch (streamErr) {
                console.error(
                  "❌ Erreur publication conversation créée:",
                  streamErr.message,
                );
              }
            }
          } else {
            throw new Error(
              "Échec de la création automatique de la conversation",
            );
          }
        } catch (createError) {
          console.error(
            `❌ Erreur création conversation ${conversationId}:`,
            createError.message,
          );
          throw new Error(
            `Impossible de créer la conversation: ${createError.message}`,
          );
        }
      }

      // ✅ VÉRIFICATION FINALE
      if (!conversation || !conversation._id) {
        throw new Error(
          "Conversation finale invalide après vérification/création",
        );
      }

      // ✅ VÉRIFICATION SUPPLÉMENTAIRE POUR CONVERSATIONS PRIVÉES
      if (
        conversation.type === "PRIVATE" &&
        conversation.participants.length !== 2
      ) {
        console.error("❌ Conversation privée invalide:", {
          id: conversation._id,
          participants: conversation.participants,
          count: conversation.participants.length,
        });
        throw new Error(
          `Conversation privée doit avoir exactement 2 participants (actuel: ${conversation.participants.length})`,
        );
      }

      console.log(`✅ Conversation validée pour traitement:`, {
        id: conversation._id,
        type: conversation.type,
        participants: conversation.participants,
      });

      // ✅ CALCULER totalRecipients SELON LE TYPE DE CONVERSATION
      // Utiliser la valeur stockée si disponible, sinon recalculer
      let totalRecipients = conversation.totalRecipients || 1; // Par défaut pour PRIVATE
      if (!conversation.totalRecipients) {
        if (
          conversation.type === "GROUP" ||
          conversation.type === "BROADCAST" ||
          conversation.type === "CHANNEL"
        ) {
          // Pour GROUP/BROADCAST: tous les participants sauf l'expéditeur
          totalRecipients = conversation.participants.filter(
            (p) => String(p) !== String(senderId),
          ).length;
        }
      }

      // ✅ CRÉER LE MESSAGE
      const message = {
        conversationId: conversation._id || conversation.id,
        senderId,
        // ✅ ASSURER QUE receiverId EST TOUJOURS UNE STRING
        receiverId: String(
          receiverId ||
            conversation.participants.find(
              (p) => String(p) !== String(senderId),
            ) ||
            null,
        ),
        content: finalContent,
        type,
        status: "SENT",
        totalRecipients,
        deliveredCount: 0,
        readCount: 0,
        deliveredBy: [],
        readBy: [],
        timestamp: new Date(),
        // ✅ CHAMP DE RÉPONSE (optionnel)
        ...(replyTo ? { replyTo } : {}),
        // ✅ CHAMPS DE TRANSFERT (optionnels)
        ...(isForwarded
          ? {
              isForwarded: true,
              forwardedFrom: forwardedFrom,
              originalSenderId: originalSenderId,
            }
          : {}),
        metadata: {
          conversationName,
          technical: {
            source: isForwarded
              ? "ForwardMessage-UseCase"
              : "SendMessage-UseCase",
            clientTimestamp: messageData.timestamp || new Date().toISOString(),
            ...(isForwarded
              ? {
                  forwardedAt: new Date().toISOString(),
                  originalMessageId: forwardedFrom,
                }
              : {}),
          },
          // ✅ MÉTADONNÉES CONTENU (fichier et/ou appel)
          contentMetadata: {
            file: fileMetadata ? fileMetadata : null,
            call: callMeta ? callMeta : null,
          },
        },
      };

      console.log(`📝 Création message:`, {
        senderId: message.senderId,
        conversationId: message.conversationId,
        contentLength: message.content.length,
        type: message.type,
        hasMetadata: !!message.metadata,
        hasCallMeta: !!callMeta,
      });

      // ✅ ÉTAPE 1 : LOG PRE-WRITE (Write-Ahead Logging)
      let walId = null;
      if (this.resilientService) {
        walId = await this.resilientService.logPreWrite(message);
      }

      // ✅ ÉTAPE 2 : SAUVEGARDER AVEC CIRCUIT BREAKER
      let savedMessage;
      try {
        if (this.resilientService) {
          savedMessage = await this.resilientService.circuitBreaker.execute(
            () => this.messageRepository.save(message),
          );
        } else {
          savedMessage = await this.messageRepository.save(message);
        }

        // ✅ MÉTRIQUES (PROTÉGÉ)
        if (this.resilientService && this.resilientService.metrics) {
          this.resilientService.metrics.totalMessages++;
          this.resilientService.metrics.successfulSaves++;
        }

        console.log(`✅ Message sauvegardé: ${savedMessage._id}`);
      } catch (saveError) {
        console.error(`❌ Erreur sauvegarde message:`, saveError.message);

        // ✅ RETRY AUTOMATIQUE
        if (this.resilientService && saveError.retryable !== false) {
          await this.resilientService.addRetry(message, 1, saveError);
        }

        // ✅ FALLBACK REDIS SI DISPONIBLE
        if (this.resilientService) {
          try {
            savedMessage = await this.resilientService.redisFallback(message);
            console.log(`✅ Message stocké en fallback Redis`);
          } catch (fallbackError) {
            // ✅ DEAD LETTER QUEUE EN DERNIER RECOURS
            await this.resilientService.addToDLQ(message, saveError, 1, {
              operation: "SendMessage.save",
              walId,
            });
            throw new Error(
              `Impossible de sauvegarder le message: ${saveError.message}`,
            );
          }
        } else {
          throw new Error(
            `Impossible de sauvegarder le message: ${saveError.message}`,
          );
        }
      }

      // ✅ ÉTAPE 3 : LOG POST-WRITE
      if (this.resilientService && walId) {
        await this.resilientService.logPostWrite(savedMessage._id, walId);
      }

      // ✅ ÉTAPE 4 : METTRE À JOUR lastMessage AVANT la publication Redis
      // Cela évite la race condition où MarkMessageDelivered essaie de
      // mettre à jour lastMessage.status avant que lastMessage._id soit à jour
      try {
        await this.conversationRepository.updateLastMessage(conversation._id, {
          _id: savedMessage._id || savedMessage.id,
          content: message.content,
          type: message.type,
          timestamp: message.timestamp,
          senderId: message.senderId,
          messageId: savedMessage._id || savedMessage.id,
          fileId: message.fileId,
        });
        console.log(`🔄 Conversation mise à jour: ${conversation._id}`);
      } catch (updateError) {
        console.warn(
          "⚠️ Erreur mise à jour conversation:",
          updateError.message,
        );
        // ✅ NE PAS FAIRE ÉCHOUER LE MESSAGE SI LA MISE À JOUR ÉCHOUE
      }

      // ✅ ÉTAPE 5 : PUBLIER DANS LE STREAM REDIS (APRÈS updateLastMessage)
      // Le consumer pourra désormais mettre à jour lastMessage.status correctement
      if (this.resilientService && savedMessage && conversation) {
        // ✅ Publication non-bloquante pour l'ACK
        this.resilientService
          .publishToMessageStream(savedMessage, {
            event: "NEW_MESSAGE",
            source: "SendMessage-UseCase",
            conversationParticipants: conversation.participants,
            senderSocketId,
          })
          .catch((err) => {
            console.error(
              `❌ Erreur publication stream (non-bloquant):`,
              err.message,
            );
          });
      }

      // ✅ CONSTRUIRE LE RÉSULTAT IMMÉDIATEMENT (ACK RAPIDE)
      const messageTimestamp =
        savedMessage.createdAt || savedMessage.timestamp || message.timestamp;
      const result = {
        success: true,
        message: {
          id: savedMessage._id || savedMessage.id,
          content: savedMessage.content,
          senderId: savedMessage.senderId,
          conversationId: savedMessage.conversationId,
          type: savedMessage.type,
          status: savedMessage.status,
          timestamp: messageTimestamp,
          createdAt: savedMessage.createdAt,
          // ✅ Inclure les métadonnées d'appel si présentes
          ...(callMeta ? { callMetadata: callMeta } : {}),
          // ✅ Inclure replyTo si présent
          ...(replyTo ? { replyTo } : {}),
          // ✅ Inclure les champs de transfert si présents
          ...(isForwarded
            ? { isForwarded: true, forwardedFrom, originalSenderId }
            : {}),
        },
        conversation: {
          id: conversation._id || conversation.id,
          name: conversation.name,
          type: conversation.type,
          participants: conversation.participants,
        },
      };

      console.log(`✅ Message traité avec succès: ${result.message.id}`);

      // ✅ ÉTAPE 6 : Incrémenter les compteurs non-lus (NON-BLOQUANT)
      // Fire-and-forget pour ne pas retarder l'ACK
      const otherParticipants = conversation.participants.filter(
        (p) => p !== messageData.senderId,
      );

      Promise.all(
        otherParticipants.map((participantId) =>
          this.conversationRepository.incrementUnreadCountInUserMetadata(
            conversation._id || conversation.id,
            participantId,
            1,
          ),
        ),
      ).catch((err) => {
        console.error(
          `❌ Erreur incrémentation compteurs non-lus (non-bloquant):`,
          err.message,
        );
      });

      return result;
    } catch (error) {
      console.error("❌ Erreur SendMessage use case:", error);
      // ✅ KAFKA COMPLÈTEMENT SUPPRIMÉ
      throw error;
    }
  }

  // ✅ MÉTHODE CORRIGÉE POUR CRÉER LA CONVERSATION
  async createConversationIfNotExists(
    conversationId,
    senderId,
    receiverId = null,
    conversationName = null,
  ) {
    try {
      const participants = [senderId, receiverId];

      // ✅ Récupérer les infos utilisateurs via UserCacheService
      let usersInfo = [];
      try {
        console.log(
          `🔍 Récupération infos participants de la conversation privée...`,
        );
        usersInfo = await this.userCacheService.fetchUsersInfo(participants);

        // Vérifier que tous les utilisateurs existent
        const invalidUsers = usersInfo.filter(
          (u) => u.name === "Utilisateur inconnu",
        );
        if (invalidUsers.length > 0) {
          const invalidIds = invalidUsers.map((u) => u.matricule).join(", ");
          throw new Error(`Utilisateurs invalides: ${invalidIds}`);
        }
        console.log(`✅ Infos participants récupérées:`, {
          count: usersInfo.length,
          users: usersInfo.map((u) => ({ id: u.userId, name: u.name })),
        });
      } catch (fetchError) {
        console.error(
          `❌ Erreur récupération infos participants:`,
          fetchError.message,
        );
        throw new Error(
          `Impossible de récupérer les infos participants: ${fetchError.message}`,
        );
      }

      const type = "PRIVATE";

      // ✅ CRÉER userMetadata AVEC LES INFOS UTILISATEURS
      const userMetadata = participants.map((participantId) => {
        const userInfo = usersInfo.find((u) => u.userId === participantId) || {
          userId: participantId,
          nom: null,
          prenom: null,
          sexe: null,
          avatar: null,
          matricule: participantId,
          departement: null,
          ministere: null,
        };

        return {
          userId: participantId,
          unreadCount: 0,
          lastReadAt: null,
          isMuted: false,
          isPinned: false,
          customName: null,
          notificationSettings: {
            enabled: true,
            sound: true,
            vibration: true,
          },
          // ✅ POPULATED À PARTIR DE UserCacheService
          nom: userInfo.nom || null,
          prenom: userInfo.prenom || null,
          sexe: userInfo.sexe || null,
          avatar: userInfo.avatar || null,
          departement: userInfo.departement || null,
          ministere: userInfo.ministere || null,
        };
      });

      const conversationData = {
        name: conversationName || `Conversation ${senderId} - ${receiverId}`,
        type,
        participants,
        createdBy: senderId,
        isPrivate: true,
        // ✅ REMPLIR userMetadata AVEC LES INFOS DES PARTICIPANTS
        userMetadata,
        settings: {
          allowInvites: true,
          isPublic: false,
          maxParticipants: type === "PRIVATE" ? 2 : 200,
          messageRetention: 0,
          autoDeleteAfter: 0,
        },
      };

      // ✅ conversationId optionnel: si présent, on le conserve pour l'idempotence
      if (conversationId) {
        conversationData._id = conversationId;
      }

      // Validation
      this.validateConversationData(conversationData);

      // Sauvegarde
      const savedConversation =
        await this.conversationRepository.save(conversationData);

      // ✅ KAFKA SUPPRIMÉ D'ICI AUSSI

      return savedConversation;
    } catch (error) {
      throw new Error(`Impossible de créer la conversation: ${error.message}`);
    }
  }

  // ✅ MÉTHODE DE VALIDATION EXISTANTE (INCHANGÉE)
  validateConversationData(conversationData) {
    const errors = [];

    if (!conversationData.name || conversationData.name.trim().length === 0) {
      errors.push("Le nom de la conversation est requis");
    }

    if (!conversationData.type) {
      errors.push("Le type de conversation est requis");
    }

    if (
      !Array.isArray(conversationData.participants) ||
      conversationData.participants.length === 0
    ) {
      errors.push("La conversation doit avoir au moins 1 participant");
    }

    if (!conversationData.createdBy) {
      errors.push("Le créateur de la conversation est requis");
    }

    if (conversationData.userMetadata) {
      if (!Array.isArray(conversationData.userMetadata)) {
        errors.push("userMetadata doit être un array");
      } else {
        for (const metadata of conversationData.userMetadata) {
          const participantId = metadata.userId || metadata.participantId;
          if (!conversationData.participants.includes(participantId)) {
            errors.push(
              `Métadonnées pour un participant non-existent: ${participantId}`,
            );
          }
        }
      }
    }

    if (conversationData.metadata) {
      if (
        conversationData.metadata.auditLog &&
        !Array.isArray(conversationData.metadata.auditLog)
      ) {
        errors.push("metadata.auditLog doit être un array");
      }
    }

    if (errors.length > 0) {
      console.error("❌ Erreurs validation conversation:", errors);
      throw new Error(
        `Données de conversation invalides: ${errors.join(", ")}`,
      );
    }

    console.log("✅ Validation conversation réussie");
    return true;
  }
}

module.exports = SendMessage;
