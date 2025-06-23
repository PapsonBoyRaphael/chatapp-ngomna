class SendMessage {
  constructor(
    messageRepository,
    conversationRepository,
    kafkaProducer = null,
    redisClient = null
  ) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
    this.kafkaProducer = kafkaProducer;
    this.redisClient = redisClient;
  }

  // ✅ AMÉLIORER LA LOGIQUE PRINCIPALE DANS execute()
  async execute(messageData) {
    try {
      const {
        content,
        senderId,
        conversationId,
        type = "TEXT",
        receiverId = null,
        conversationName = null,
      } = messageData;

      if (!content || !senderId || !conversationId) {
        throw new Error("Données de message incomplètes");
      }

      console.log(`💬 Traitement message: ${senderId} → ${conversationId}`, {
        hasReceiverId: !!receiverId,
        contentLength: content.length,
        type,
      });

      // ✅ VÉRIFIER OU CRÉER LA CONVERSATION AVEC VALIDATION RECEIVER ID
      let conversation = null;

      try {
        console.log(`🔍 Recherche conversation: ${conversationId}`);
        conversation = await this.conversationRepository.findById(
          conversationId
        );

        if (conversation && conversation._id) {
          console.log(`✅ Conversation existante trouvée: ${conversationId}`, {
            id: conversation._id,
            name: conversation.name,
            type: conversation.type,
            participants: conversation.participants,
            participantsCount: conversation.participants?.length,
          });

          // ✅ VÉRIFIER QUE L'EXPÉDITEUR EST PARTICIPANT
          if (!conversation.participants.includes(senderId)) {
            throw new Error(
              `L'utilisateur ${senderId} n'est pas participant de cette conversation`
            );
          }
        } else {
          console.log(`⚠️ Conversation ${conversationId} introuvable`);
          conversation = null;
        }
      } catch (findError) {
        console.log(
          `⚠️ Erreur lors de la recherche conversation ${conversationId}:`,
          findError.message
        );
        conversation = null;
      }

      // ✅ CRÉER LA CONVERSATION SI ELLE N'EXISTE PAS - AVEC VALIDATION RECEIVER ID
      if (!conversation) {
        if (!receiverId) {
          throw new Error(
            "receiverId est requis pour créer une nouvelle conversation"
          );
        }

        if (receiverId === senderId) {
          throw new Error("receiverId doit être différent du senderId");
        }

        console.log(
          `🆕 Création automatique conversation privée: ${conversationId}`
        );

        try {
          conversation = await this.createConversationIfNotExists(
            conversationId,
            senderId,
            receiverId,
            conversationName
          );

          if (conversation && conversation._id) {
            console.log(`✅ Conversation privée créée: ${conversation._id}`, {
              participants: conversation.participants,
              participantsCount: conversation.participants?.length,
            });
          } else {
            throw new Error(
              "Échec de la création automatique de la conversation"
            );
          }
        } catch (createError) {
          console.error(
            `❌ Erreur création conversation ${conversationId}:`,
            createError.message
          );
          throw new Error(
            `Impossible de créer la conversation: ${createError.message}`
          );
        }
      }

      // ✅ VÉRIFICATION FINALE
      if (!conversation || !conversation._id) {
        throw new Error(
          "Conversation finale invalide après vérification/création"
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
          `Conversation privée doit avoir exactement 2 participants (actuel: ${conversation.participants.length})`
        );
      }

      console.log(`✅ Conversation validée pour traitement:`, {
        id: conversation._id,
        type: conversation.type,
        participants: conversation.participants,
        isValid: true,
      });

      // ✅ CRÉER LE MESSAGE
      const message = {
        content: String(content).trim(),
        senderId: String(senderId),
        conversationId: String(conversationId),
        type,
        status: "SENT",
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      console.log(`📝 Création message:`, {
        senderId: message.senderId,
        conversationId: message.conversationId,
        contentLength: message.content.length,
        type: message.type,
      });

      // ✅ SAUVEGARDER LE MESSAGE AVEC GESTION D'ERREUR
      let savedMessage;
      try {
        savedMessage = await this.messageRepository.save(message);
        console.log(
          `💾 Message sauvegardé: ${savedMessage._id || savedMessage.id}`
        );
      } catch (saveError) {
        console.error(`❌ Erreur sauvegarde message:`, saveError.message);
        throw new Error(
          `Impossible de sauvegarder le message: ${saveError.message}`
        );
      }

      // ✅ METTRE À JOUR LA CONVERSATION
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
          updateError.message
        );
        // ✅ NE PAS FAIRE ÉCHOUER LE MESSAGE SI LA MISE À JOUR ÉCHOUE
      }

      // ✅ PUBLIER SUR KAFKA
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "MESSAGE_SENT",
            messageId: String(savedMessage._id || savedMessage.id),
            conversationId: String(conversationId),
            senderId: String(senderId),
            content: String(content),
            type: type,
            timestamp: new Date().toISOString(),
            source: "SendMessage-UseCase",
          });
          console.log(`📤 Événement Kafka publié: MESSAGE_SENT`);
        } catch (kafkaError) {
          console.warn("⚠️ Erreur Kafka SendMessage:", kafkaError.message);
        }
      }

      // ✅ INVALIDER LE CACHE REDIS
      if (this.redisClient) {
        try {
          const cacheKeys = [
            `messages:${conversationId}`,
            `conversation:${conversationId}`,
            `conversations:user:${senderId}`,
            `unread:*:${conversationId}`,
          ];

          for (const key of cacheKeys) {
            if (key.includes("*")) {
              const keys = await this.redisClient.keys(key);
              if (keys.length > 0) {
                await this.redisClient.del(keys);
              }
            } else {
              await this.redisClient.del(key);
            }
          }
          console.log(`🗑️ Cache invalidé pour conversation: ${conversationId}`);
        } catch (redisError) {
          console.warn("⚠️ Erreur cache Redis:", redisError.message);
        }
      }

      // ✅ RETOURNER LE RÉSULTAT
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
      return result;
    } catch (error) {
      console.error("❌ Erreur SendMessage use case:", error);

      // ✅ PUBLIER L'ERREUR SUR KAFKA
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "MESSAGE_SEND_FAILED",
            conversationId: messageData.conversationId,
            senderId: messageData.senderId,
            error: error.message,
            timestamp: new Date().toISOString(),
            source: "SendMessage-UseCase",
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication échec Kafka:",
            kafkaError.message
          );
        }
      }

      throw error;
    }
  }

  // ✅ MÉTHODE CORRIGÉE POUR CRÉER LA CONVERSATION
  async createConversationIfNotExists(
    conversationId,
    senderId,
    receiverId = null,
    conversationName = null
  ) {
    try {
      console.log(`🆕 Début création conversation: ${conversationId}`, {
        senderId,
        receiverId,
        conversationName,
      });

      // ✅ VALIDATION STRICTE DU RECEIVER ID
      if (!receiverId || receiverId === senderId) {
        console.error("❌ ReceiverID manquant ou invalide:", {
          receiverId,
          senderId,
          isEqual: receiverId === senderId,
        });
        throw new Error(
          "receiverId est requis et doit être différent du senderId pour créer une conversation"
        );
      }

      // ✅ DÉTERMINER LES PARTICIPANTS - TOUJOURS 2 POUR UNE CONVERSATION PRIVÉE
      const participants = [senderId, receiverId];

      // Vérifier qu'on a bien 2 participants uniques
      const uniqueParticipants = [...new Set(participants)];
      if (uniqueParticipants.length !== 2) {
        throw new Error(
          "Une conversation privée doit avoir exactement 2 participants uniques"
        );
      }

      // ✅ DÉTERMINER LE NOM ET TYPE
      let name = conversationName;
      let type = "PRIVATE"; // Forcer PRIVATE pour 2 participants

      if (!name) {
        name = `Conversation privée`; // Nom générique pour conversation privée
      }

      console.log(`✅ Participants validés:`, {
        participants: uniqueParticipants,
        type,
        name,
      });

      // ✅ CRÉER LA CONVERSATION AVEC VALIDATION RENFORCÉE
      const conversationData = {
        _id: conversationId,
        name: name,
        type: type,
        participants: uniqueParticipants, // Utiliser les participants validés
        createdBy: senderId,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessage: null,
        isActive: true,

        // ✅ INITIALISER UNREADCOUNTS POUR LES 2 PARTICIPANTS
        unreadCounts: {
          [senderId]: 0,
          [receiverId]: 0,
        },

        // ✅ USER METADATA POUR LES 2 PARTICIPANTS
        userMetadata: uniqueParticipants.map((participantId) => ({
          userId: participantId,
          unreadCount: 0,
          lastReadAt: null,
          isMuted: false,
          isPinned: false,
          notificationSettings: {
            enabled: true,
            sound: true,
            vibration: true,
          },
        })),

        metadata: {
          autoCreated: true,
          createdFrom: "SendMessage",
          version: 1,
          tags: [],

          auditLog: [
            {
              action: "CREATED",
              userId: senderId,
              timestamp: new Date(),
              details: {
                trigger: "message_send",
                originalConversationId: conversationId,
                autoCreated: true,
                method: "auto_conversation_creation",
                receiverId: receiverId, // ✅ TRACER LE RECEIVER ID
              },
              metadata: {
                source: "SendMessage-UseCase",
                reason: "conversation_not_found",
              },
            },
          ],

          stats: {
            totalMessages: 0,
            totalFiles: 0,
            totalParticipants: uniqueParticipants.length,
            lastActivity: new Date(),
          },
        },

        settings: {
          allowInvites: true,
          isPublic: false,
          maxParticipants: 2, // ✅ LIMITER À 2 POUR PRIVATE
          messageRetention: 0,
          autoDeleteAfter: 0,
        },
      };

      // ✅ VALIDATION AVANT SAUVEGARDE
      this.validateConversationData(conversationData);

      // ✅ VALIDATION SPÉCIFIQUE POUR CONVERSATION PRIVÉE
      this.validatePrivateConversation(conversationData);

      console.log(`📝 Données conversation validées:`, {
        id: conversationData._id,
        name: conversationData.name,
        type: conversationData.type,
        participants: conversationData.participants,
        participantsCount: conversationData.participants.length,
        unreadCountsKeys: Object.keys(conversationData.unreadCounts),
      });

      // ✅ SAUVEGARDER VIA LE REPOSITORY
      let savedConversation;
      try {
        savedConversation = await this.conversationRepository.save(
          conversationData
        );

        if (!savedConversation || !savedConversation._id) {
          throw new Error("Repository a retourné une conversation invalide");
        }

        console.log(`✅ Conversation privée créée avec succès:`, {
          id: savedConversation._id,
          name: savedConversation.name,
          participants: savedConversation.participants,
          participantsCount: savedConversation.participants?.length,
        });
      } catch (saveError) {
        console.error(`❌ Erreur sauvegarde repository:`, saveError.message);
        throw new Error(`Erreur repository: ${saveError.message}`);
      }

      // ✅ PUBLIER L'ÉVÉNEMENT DE CRÉATION
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "PRIVATE_CONVERSATION_CREATED",
            conversationId: String(savedConversation._id),
            createdBy: senderId,
            participants: uniqueParticipants,
            receiverId: receiverId, // ✅ INCLURE LE RECEIVER ID
            name: name,
            type: type,
            trigger: "message_send",
            timestamp: new Date().toISOString(),
            source: "SendMessage-UseCase",
          });
          console.log(`📤 Événement PRIVATE_CONVERSATION_CREATED publié`);
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication création conversation:",
            kafkaError.message
          );
        }
      }

      return savedConversation;
    } catch (error) {
      console.error(`❌ Erreur création conversation ${conversationId}:`, {
        error: error.message,
        stack: error.stack,
        conversationId,
        senderId,
        receiverId,
      });
      throw new Error(`Impossible de créer la conversation: ${error.message}`);
    }
  }

  // ✅ AJOUTER UNE MÉTHODE DE VALIDATION SPÉCIFIQUE POUR CONVERSATIONS PRIVÉES
  validatePrivateConversation(conversationData) {
    const errors = [];

    if (conversationData.type === "PRIVATE") {
      // Vérifier qu'il y a exactement 2 participants
      if (
        !conversationData.participants ||
        conversationData.participants.length !== 2
      ) {
        errors.push(
          `Conversation privée doit avoir exactement 2 participants (actuel: ${
            conversationData.participants?.length || 0
          })`
        );
      }

      // Vérifier que les participants sont uniques
      const uniqueParticipants = [
        ...new Set(conversationData.participants || []),
      ];
      if (uniqueParticipants.length !== 2) {
        errors.push("Les 2 participants doivent être différents");
      }

      // Vérifier les compteurs non-lus pour les 2 participants
      const unreadCountsKeys = Object.keys(conversationData.unreadCounts || {});
      if (unreadCountsKeys.length !== 2) {
        errors.push(
          `Compteurs non-lus manquants pour tous les participants (actuel: ${unreadCountsKeys.length})`
        );
      }

      // Vérifier que chaque participant a ses métadonnées
      const userMetadataCount = conversationData.userMetadata?.length || 0;
      if (userMetadataCount !== 2) {
        errors.push(
          `Métadonnées utilisateur manquantes (actuel: ${userMetadataCount})`
        );
      }

      // Vérifier le maximum de participants
      if (conversationData.settings?.maxParticipants !== 2) {
        errors.push("maxParticipants doit être 2 pour une conversation privée");
      }
    }

    if (errors.length > 0) {
      console.error("❌ Erreurs validation conversation privée:", errors);
      throw new Error(
        `Validation conversation privée échouée: ${errors.join(", ")}`
      );
    }

    console.log("✅ Validation conversation privée réussie");
    return true;
  }

  // ✅ AMÉLIORER LA MÉTHODE validateConversationData EXISTANTE
  validateConversationData(conversationData) {
    const errors = [];

    // ✅ VÉRIFICATIONS DE BASE
    if (!conversationData._id) {
      errors.push("ID de conversation manquant");
    }

    if (!conversationData.name || typeof conversationData.name !== "string") {
      errors.push("Nom de conversation manquant ou invalide");
    }

    if (
      !conversationData.participants ||
      !Array.isArray(conversationData.participants)
    ) {
      errors.push("Participants manquants ou invalides");
    } else {
      // ✅ VÉRIFICATION SUPPLÉMENTAIRE : minimum 2 participants
      if (conversationData.participants.length < 2) {
        errors.push(
          `Minimum 2 participants requis (actuel: ${conversationData.participants.length})`
        );
      }
    }

    if (!conversationData.createdBy) {
      errors.push("Créateur de conversation manquant");
    }

    // ✅ VÉRIFIER UNREADCOUNTS
    if (conversationData.unreadCounts === undefined) {
      errors.push("unreadCounts manquant");
    } else if (
      typeof conversationData.unreadCounts !== "object" ||
      conversationData.unreadCounts === null
    ) {
      errors.push("unreadCounts doit être un objet");
    } else {
      // ✅ VÉRIFIER QUE CHAQUE PARTICIPANT A UN COMPTEUR
      const participantIds = conversationData.participants || [];
      const unreadCountsKeys = Object.keys(conversationData.unreadCounts);

      for (const participantId of participantIds) {
        if (!unreadCountsKeys.includes(participantId)) {
          errors.push(
            `Compteur non-lu manquant pour le participant: ${participantId}`
          );
        }
      }
    }

    // ✅ VÉRIFIER USERMETADATA
    if (
      conversationData.userMetadata &&
      !Array.isArray(conversationData.userMetadata)
    ) {
      errors.push("userMetadata doit être un array");
    } else if (conversationData.userMetadata) {
      // ✅ VÉRIFIER QUE CHAQUE PARTICIPANT A SES MÉTADONNÉES
      const participantIds = conversationData.participants || [];
      const userMetadataUserIds = conversationData.userMetadata.map(
        (meta) => meta.userId
      );

      for (const participantId of participantIds) {
        if (!userMetadataUserIds.includes(participantId)) {
          errors.push(
            `Métadonnées manquantes pour le participant: ${participantId}`
          );
        }
      }
    }

    // ✅ VÉRIFIER METADATA
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
        `Données de conversation invalides: ${errors.join(", ")}`
      );
    }

    console.log("✅ Validation conversation réussie");
    return true;
  }

  // ✅ MÉTHODE UTILITAIRE POUR EXTRAIRE RECEIVER ID
  extractReceiverIdFromConversation(conversationId, senderId) {
    try {
      // Pattern: privé entre 2 utilisateurs
      if (conversationId.includes("_")) {
        const parts = conversationId.split("_");
        return parts.find((part) => part !== senderId);
      }

      // Autres patterns possibles...
      return null;
    } catch (error) {
      return null;
    }
  }
}

module.exports = SendMessage;
