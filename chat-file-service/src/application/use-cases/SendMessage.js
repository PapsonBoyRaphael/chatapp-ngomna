const UserCacheService = require("../../infrastructure/services/UserCacheService");

class SendMessage {
  constructor(
    messageRepository,
    conversationRepository,
    cacheService = null,
    resilientService = null,
    userCacheService = null,
  ) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
    this.cacheService = cacheService;
    this.resilientService = resilientService;
    // ✅ Service intelligent avec Redis cache + fallback HTTP
    this.userCacheService = userCacheService || new UserCacheService();
  }

  // ✅ MODIFIER LA MÉTHODE execute() - RETIRER KAFKA
  async execute(messageData) {
    const startTime = Date.now();

    try {
      const {
        content,
        senderId,
        conversationId = "",
        type = "TEXT",
        receiverId = null,
        conversationName = null,
        duration = null,
        fileId = null,
        fileName = null,
        fileUrl = null,
        fileSize = null,
        mimeType = null,
      } = messageData;

      if (!content || !senderId) {
        throw new Error("Données de message incomplètes");
      }

      console.log(`💬 Traitement message: ${senderId} → ${conversationId}`, {
        hasReceiverId: !!receiverId,
        contentLength: content.length,
        type,
        fileId,
        fileName,
        duration,
      });

      if (conversationId === null) {
        conversationId = "";
      }

      // ✅ CRÉER/VÉRIFIER LA CONVERSATION
      let conversation = null;

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
                  "stream:conversation:created",
                  {
                    event: "conversation.created",
                    conversationId: conversation._id.toString(),
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
        content,
        type,
        status: "SENT",
        ...(fileId && { fileId }),
        ...(fileName && { fileName }),
        ...(fileUrl && { fileUrl }),
        ...(fileSize && { fileSize }),
        ...(mimeType && { mimeType }),
        ...(duration && { duration }),
        timestamp: new Date(),
        metadata: {
          conversationName,
          technical: {
            source: "SendMessage-UseCase",
            clientTimestamp: messageData.timestamp || new Date().toISOString(),
          },
        },
      };

      console.log(`📝 Création message:`, {
        senderId: message.senderId,
        conversationId: message.conversationId,
        contentLength: message.content.length,
        type: message.type,
        hasMetadata: !!message.metadata,
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

          // ✅ PUBLIER DANS LE STREAM REDIS AVEC DONNÉES COMPLÈTES
          if (savedMessage && conversation) {
            await this.resilientService.publishToMessageStream(savedMessage, {
              event: "NEW_MESSAGE",
              source: "SendMessage-UseCase",
              conversationParticipants: conversation.participants, // ✅ AJOUTER LES PARTICIPANTS
            });

            // ✅ ATTENDRE 50ms pour donner du temps au consumer de traiter l'événement conversationCreated
            // avant le message, puisque les deux streams sont maintenant consommés à priorité égale
            await new Promise((resolve) => setTimeout(resolve, 50));
            console.log(
              `⏱️ Délai de 50ms appliqué après publication du message`,
            );
          }
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

      // ✅ ÉTAPE 4 : METTRE À JOUR LA CONVERSATION
      try {
        await this.conversationRepository.updateLastMessage(conversationId, {
          content: message.content,
          timestamp: message.timestamp,
          senderId: message.senderId,
          messageId: savedMessage._id || savedMessage.id,
        });
        console.log(`🔄 Conversation mise à jour: ${conversationId}`);
      } catch (updateError) {
        console.warn(
          "⚠️ Erreur mise à jour conversation:",
          updateError.message,
        );
        // ✅ NE PAS FAIRE ÉCHOUER LE MESSAGE SI LA MISE À JOUR ÉCHOUE
      }

      // ✅ RETOURNER LE RÉSULTAT (SANS KAFKA)
      const result = {
        success: true,
        message: {
          id: savedMessage._id || savedMessage.id,
          content: savedMessage.content,
          senderId: savedMessage.senderId,
          conversationId: savedMessage.conversationId,
          type: savedMessage.type,
          status: savedMessage.status,
          timestamp: savedMessage.timestamp,
          createdAt: savedMessage.createdAt,
        },
        conversation: {
          id: conversation._id || conversation.id,
          name: conversation.name,
          type: conversation.type,
          participants: conversation.participants,
        },
      };

      console.log(`✅ Message traité avec succès: ${result.message.id}`);

      // Après la sauvegarde du message, incrémenter les compteurs non-lus
      const otherParticipants = conversation.participants.filter(
        (p) => p !== messageData.senderId,
      );

      // Incrémenter le compteur pour chaque participant sauf l'expéditeur
      const updatePromises = otherParticipants.map((participantId) =>
        this.conversationRepository.incrementUnreadCountInUserMetadata(
          conversation._id || conversation.id,
          participantId,
          1,
        ),
      );

      await Promise.all(updatePromises);

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
        _id: conversationId,
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
