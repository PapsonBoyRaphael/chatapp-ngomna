const Message = require("../mongodb/models/MessageModel");
const mongoose = require("mongoose");

class MongoMessageRepository {
  constructor(kafkaProducer = null) {
    this.kafkaProducer = kafkaProducer;
    this.metrics = {
      dbQueries: 0,
      errors: 0,
      kafkaEvents: 0,
      kafkaErrors: 0,
    };
  }

  // ===============================
  // MÉTHODES PRINCIPALES
  // ===============================

  async save(messageOrData) {
    const startTime = Date.now();

    try {
      console.log(`💾 Début sauvegarde message:`, {
        senderId: messageOrData.senderId,
        conversationId: messageOrData.conversationId,
        type: messageOrData.type,
        contentLength: messageOrData.content ? messageOrData.content.length : 0,
      });

      let message;

      // ✅ GÉRER LES DONNÉES BRUTES ET LES ENTITÉS
      if (
        messageOrData.validate &&
        typeof messageOrData.validate === "function"
      ) {
        // C'est déjà une entité Message
        message = messageOrData;

        try {
          message.validate();
        } catch (validationError) {
          console.error(
            `❌ Erreur validation entité message:`,
            validationError.message,
          );
          throw new Error(`Message invalide: ${validationError.message}`);
        }
      } else {
        // ✅ CRÉER UNE NOUVELLE INSTANCE À PARTIR DES DONNÉES
        try {
          message = new Message(messageOrData);

          // ✅ VALIDATION AVANT SAUVEGARDE
          const validationError = message.validateSync();
          if (validationError) {
            console.error(
              `❌ Erreur validation nouveau message:`,
              validationError.message,
            );
            throw new Error(
              `Données de message invalides: ${validationError.message}`,
            );
          }
        } catch (modelError) {
          console.error(
            `❌ Erreur création modèle message:`,
            modelError.message,
          );
          throw new Error(
            `Impossible de créer le modèle message: ${modelError.message}`,
          );
        }
      }

      // ✅ SAUVEGARDER AVEC GESTION D'ERREUR ROBUSTE
      let savedMessage;
      try {
        savedMessage = await Message.findByIdAndUpdate(
          message._id,
          message.toObject ? message.toObject() : message,
          {
            new: true,
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          },
        );

        if (!savedMessage || !savedMessage._id) {
          throw new Error("Sauvegarde a échoué - message invalide retourné");
        }

        console.log(`✅ Message sauvegardé en base: ${savedMessage._id}`);
      } catch (saveError) {
        console.error(`❌ Erreur sauvegarde MongoDB message:`, {
          error: saveError.message,
          code: saveError.code,
          messageId: message._id,
          conversationId: message.conversationId,
        });

        // ✅ GESTION SPÉCIFIQUE DES ERREURS MONGODB
        if (saveError.name === "ValidationError") {
          throw new Error(`Données de message invalides: ${saveError.message}`);
        }

        if (saveError.code === 11000) {
          throw new Error(`Message en doublon détecté`);
        }

        if (saveError.message.includes("Cast to ObjectId failed")) {
          throw new Error(
            `ID de conversation invalide: ${message.conversationId}`,
          );
        }

        throw new Error(`Erreur MongoDB: ${saveError.message}`);
      }

      const processingTime = Date.now() - startTime;

      if (this.kafkaProducer) {
        try {
          await this._publishMessageEvent("MESSAGE_SAVED", savedMessage, {
            processingTime,
            isNew: !messageOrData._id,
          });
        } catch (kafkaError) {
          console.warn("⚠️ Erreur publication message:", kafkaError.message);
        }
      }

      console.log(
        `✅ Message complètement sauvegardé: ${savedMessage._id} (${processingTime}ms)`,
      );
      return savedMessage;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur complète sauvegarde message:", {
        error: error.message,
        stack: error.stack,
        messageData: messageOrData.conversationId
          ? {
              conversationId: messageOrData.conversationId,
              senderId: messageOrData.senderId,
              type: messageOrData.type,
            }
          : "données invalides",
        processingTime,
      });

      // Publier l'erreur dans Kafka
      if (this.kafkaProducer) {
        try {
          await this._publishMessageEvent(
            "MESSAGE_SAVE_FAILED",
            messageOrData,
            {
              error: error.message,
              processingTime,
            },
          );
        } catch (kafkaError) {
          console.warn("⚠️ Erreur publication échec:", kafkaError.message);
        }
      }

      throw error;
    }
  }

  async findById(messageId) {
    const startTime = Date.now();

    try {
      this.metrics.dbQueries++;
      const message = await Message.findById(messageId).lean();

      if (!message) {
        throw new Error(`Message ${messageId} non trouvé`);
      }

      const processingTime = Date.now() - startTime;

      console.log(`🔍 Message trouvé: ${messageId} (${processingTime}ms)`);
      return message;
    } catch (error) {
      this.metrics.errors++;
      console.error(`❌ Erreur recherche message ${messageId}:`, error);
      throw error;
    }
  }

  async findByConversation(conversationId, options = {}) {
    const { page = 1, limit = 50, userId } = options;

    try {
      const objectId = new mongoose.Types.ObjectId(conversationId);

      const filter = {
        conversationId: objectId,
        deletedAt: null,
      };

      console.log("🔍 Filtre MongoDB (page-based):", filter);

      const messages = await Message.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      console.log("🔍 Messages trouvés (page-based):", messages.length);

      return messages;
    } catch (error) {
      console.error("❌ Erreur findByConversation:", error);
      return [];
    }
  }

  // ===== AJOUTER SUPPORT CURSOR-BASED PAGINATION =====

  /**
   * ✅ PAGINATION AVEC CURSOR pour performances optimales
   */
  async findByConversationWithCursor(conversationId, options = {}) {
    const { cursor = null, limit = 50, direction = "older", userId } = options;

    try {
      const objectId = new mongoose.Types.ObjectId(conversationId);

      let filter = {
        conversationId: objectId,
        deletedAt: null,
      };

      // ✅ APPLIQUER LE CURSOR
      if (cursor) {
        if (direction === "older") {
          filter.createdAt = { $lt: new Date(cursor) };
        } else {
          filter.createdAt = { $gt: new Date(cursor) };
        }
      }

      console.log("🔍 Filtre MongoDB avec cursor:", {
        conversationId: objectId,
        cursor,
        direction,
        limit,
      });

      const messages = await Message.find(filter)
        .sort({ createdAt: direction === "older" ? -1 : 1 })
        .limit(limit + 1) // +1 pour détecter hasMore
        .lean();

      // ✅ DÉTERMINER hasMore ET nextCursor
      const hasMore = messages.length > limit;
      const resultMessages = hasMore ? messages.slice(0, limit) : messages;

      let nextCursor = null;
      if (hasMore && resultMessages.length > 0) {
        const lastMessage = resultMessages[resultMessages.length - 1];
        nextCursor = lastMessage.createdAt.toISOString();
      }

      console.log("✅ Messages trouvés avec cursor:", {
        count: resultMessages.length,
        hasMore,
        nextCursor: nextCursor ? nextCursor.substring(0, 19) : null,
      });

      return {
        messages: resultMessages,
        nextCursor,
        hasMore,
      };
    } catch (error) {
      console.error("❌ Erreur findByConversationWithCursor:", error);
      return {
        messages: [],
        nextCursor: null,
        hasMore: false,
      };
    }
  }

  async updateMessageStatus(
    conversationId,
    receiverId,
    status,
    messageIds = [],
  ) {
    const startTime = Date.now();

    try {
      console.log(`📝 Mise à jour statut messages:`, {
        conversationId,
        receiverId,
        status,
        messageIdsCount: messageIds.length,
      });

      // ✅ NOUVELLE VALIDATION : receiverId et status sont obligatoires
      if (!receiverId || !status) {
        throw new Error("receiverId et status sont requis");
      }

      const validStatuses = [
        "SENT",
        "DELIVERED",
        "READ",
        "FAILED",
        "DELETED",
        "EDITED",
      ];
      if (!validStatuses.includes(status)) {
        throw new Error(
          `Status invalide. Valeurs acceptées: ${validStatuses.join(", ")}`,
        );
      }

      // ✅ POUR DELIVERED/READ : UTILISER LA LOGIQUE AVEC COMPTEURS
      // On doit traiter chaque message individuellement pour gérer les compteurs
      if (status === "DELIVERED" || status === "READ") {
        let totalModified = 0;
        let totalMatched = 0;

        // Récupérer les messages à mettre à jour
        const filter = {};
        if (conversationId) {
          filter.conversationId = conversationId;
        }
        if (messageIds && messageIds.length > 0) {
          filter._id = { $in: messageIds };
        }
        // Exclure les messages déjà au statut voulu ou envoyés par l'utilisateur
        filter.senderId = { $ne: receiverId };

        const messages = await Message.find(filter).lean();
        console.log(`🔍 ${messages.length} messages à traiter pour ${status}`);

        for (const msg of messages) {
          try {
            const result = await this.updateSingleMessageStatus(
              msg._id.toString(),
              receiverId,
              status,
            );
            if (result.modifiedCount > 0) {
              totalModified++;
            }
            totalMatched++;
          } catch (err) {
            console.warn(
              `⚠️ Erreur mise à jour message ${msg._id}: ${err.message}`,
            );
          }
        }

        const processingTime = Date.now() - startTime;
        console.log(`✅ Mise à jour statut terminée (avec compteurs):`, {
          conversationId,
          status,
          modifiedCount: totalModified,
          matchedCount: totalMatched,
          processingTime: `${processingTime}ms`,
        });

        return { modifiedCount: totalModified, matchedCount: totalMatched };
      }

      // ✅ POUR LES AUTRES STATUTS (DELETED, EDITED, etc.) : MISE À JOUR DIRECTE
      let filter = {
        status: { $ne: status },
      };

      if (conversationId) {
        filter.conversationId = conversationId;
      }

      if (messageIds && messageIds.length > 0) {
        filter._id = { $in: messageIds };
      }

      const updateResult = await Message.updateMany(filter, {
        $set: {
          status: status,
          updatedAt: new Date(),
        },
      });

      const processingTime = Date.now() - startTime;

      console.log(`✅ Mise à jour statut terminée:`, {
        conversationId,
        status,
        modifiedCount: updateResult.modifiedCount,
        matchedCount: updateResult.matchedCount,
        processingTime: `${processingTime}ms`,
      });

      return updateResult;
    } catch (error) {
      console.error("❌ Erreur mise à jour statut:", error);
      throw error;
    }
  }

  async deleteById(messageId) {
    const startTime = Date.now();

    try {
      // Récupérer le message avant suppression
      const message = await Message.findById(messageId);
      if (!message) {
        throw new Error(`Message ${messageId} non trouvé`);
      }

      // Soft delete
      const deletedMessage = await Message.findByIdAndUpdate(
        messageId,
        {
          deletedAt: new Date(),
          updatedAt: new Date(),
        },
        { new: true },
      );

      const processingTime = Date.now() - startTime;

      // 🚀 PUBLIER ÉVÉNEMENT KAFKA
      if (this.kafkaProducer) {
        try {
          await this._publishMessageEvent("MESSAGE_DELETED", deletedMessage, {
            processingTime,
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication suppression:",
            kafkaError.message,
          );
        }
      }

      console.log(`🗑️ Message supprimé: ${messageId} (${processingTime}ms)`);
      return deletedMessage;
    } catch (error) {
      console.error(`❌ Erreur suppression message ${messageId}:`, error);
      throw error;
    }
  }

  async getUnreadCount(userId, conversationId = null) {
    const startTime = Date.now();

    try {
      // Compter depuis MongoDB
      const filter = {
        receiverId: userId,
        status: { $ne: "read" },
      };

      if (conversationId) {
        filter.conversationId = conversationId;
      }

      const count = await Message.countDocuments(filter);
      const processingTime = Date.now() - startTime;

      console.log(
        `🔢 Compteur non-lus: ${userId} = ${count} (${processingTime}ms)`,
      );
      return count;
    } catch (error) {
      console.error(`❌ Erreur compteur non-lus ${userId}:`, error);
      throw error;
    }
  }

  // ===============================
  // MÉTHODES DE RECHERCHE AVANCÉE
  // ===============================

  async searchMessages(query, options = {}) {
    const {
      conversationId,
      userId,
      type,
      dateFrom,
      dateTo,
      limit = 20,
      useLike = true, // Ajout d'une option pour activer %like%
    } = options;

    const startTime = Date.now();

    try {
      // Filtre principal
      let filter = {
        $text: { $search: query },
      };
      if (conversationId) filter.conversationId = conversationId;
      if (userId) filter.$or = [{ senderId: userId }, { receiverId: userId }];
      if (type) filter.type = type;
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
        if (dateTo) filter.createdAt.$lte = new Date(dateTo);
      }

      let messages = await Message.find(filter)
        .sort({ score: { $meta: "textScore" }, createdAt: -1 })
        .limit(limit)
        .lean();

      // Si aucun résultat et option %like% activée, faire une recherche regex
      if (useLike && messages.length === 0 && query.length >= 2) {
        filter = {};
        if (conversationId) filter.conversationId = conversationId;
        if (userId) filter.$or = [{ senderId: userId }, { receiverId: userId }];
        if (type) filter.type = type;
        if (dateFrom || dateTo) {
          filter.createdAt = {};
          if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
          if (dateTo) filter.createdAt.$lte = new Date(dateTo);
        }
        // Ajout du filtre regex sur le contenu et les hashtags/mentions
        filter.$or = [
          { content: { $regex: query, $options: "i" } },
          {
            "metadata.contentMetadata.mentions": {
              $regex: query,
              $options: "i",
            },
          },
          {
            "metadata.contentMetadata.hashtags": {
              $regex: query,
              $options: "i",
            },
          },
        ];

        messages = await Message.find(filter)
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean();
      }

      const result = {
        messages,
        totalFound: messages.length,
        query,
        searchTime: Date.now() - startTime,
      };

      console.log(
        `🔍 Recherche: "${query}" = ${messages.length} résultats (${result.searchTime}ms)`,
      );
      return result;
    } catch (error) {
      console.error("❌ Erreur recherche messages:", error);
      throw error;
    }
  }

  async getStatistics(conversationId) {
    const startTime = Date.now();

    try {
      // Calculer les statistiques
      const stats = await Message.aggregate([
        { $match: { conversationId } },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            messagesByType: {
              $push: {
                k: "$type",
                v: 1,
              },
            },
            messagesByUser: {
              $push: {
                k: "$senderId",
                v: 1,
              },
            },
            lastMessage: { $max: "$createdAt" },
            firstMessage: { $min: "$createdAt" },
            averageLength: { $avg: { $strLenCP: "$content" } },
          },
        },
        {
          $project: {
            _id: 0,
            totalMessages: 1,
            messagesByType: { $arrayToObject: "$messagesByType" },
            messagesByUser: { $arrayToObject: "$messagesByUser" },
            lastMessage: 1,
            firstMessage: 1,
            averageLength: { $round: ["$averageLength", 2] },
          },
        },
      ]);

      const result = stats[0] || {
        totalMessages: 0,
        messagesByType: {},
        messagesByUser: {},
        lastMessage: null,
        firstMessage: null,
        averageLength: 0,
      };

      const processingTime = Date.now() - startTime;
      result.calculatedAt = new Date().toISOString();
      result.processingTime = processingTime;

      console.log(
        `📊 Statistiques calculées: ${conversationId} (${processingTime}ms)`,
      );
      return result;
    } catch (error) {
      console.error(`❌ Erreur statistiques ${conversationId}:`, error);
      throw error;
    }
  }

  // ===============================
  // MÉTHODES PRIVÉES - KAFKA
  // ===============================

  async _publishMessageEvent(eventType, message, additionalData = {}) {
    if (!this.kafkaProducer) return;

    const eventData = {
      eventType,
      timestamp: new Date().toISOString(),
      service: "message-repository",
      ...additionalData,
    };

    if (message) {
      eventData.messageId = message._id;
      eventData.conversationId = message.conversationId;
      eventData.senderId = message.senderId;
      eventData.receiverId = message.receiverId;
      eventData.type = message.type;
      eventData.status = message.status;
    }

    await this.kafkaProducer.publishMessage(eventData);
  }

  // ===============================
  // MÉTHODES UTILITAIRES
  // ===============================

  async getHealthStatus() {
    try {
      const healthData = {
        mongodb: { status: "unknown", responseTime: null },
        redis: { status: "unknown", responseTime: null },
        kafka: { status: "unknown" },
      };

      // Test MongoDB
      const mongoStart = Date.now();
      try {
        await Message.findOne().lean();
        healthData.mongodb = {
          status: "connected",
          responseTime: Date.now() - mongoStart,
        };
      } catch (error) {
        healthData.mongodb = {
          status: "disconnected",
          error: error.message,
        };
      }

      // Kafka status
      healthData.kafka.status = this.kafkaProducer ? "enabled" : "disabled";

      return healthData;
    } catch (error) {
      console.error("❌ Erreur health check repository:", error);
      throw error;
    }
  }

  /**
   * Mettre à jour le statut d'un message spécifique
   * ✅ GESTION DES COMPTEURS POUR GROUPES ET BROADCASTS
   */
  async updateSingleMessageStatus(messageId, receiverId, status) {
    const startTime = Date.now();

    try {
      console.log(`📝 Mise à jour statut message unique:`, {
        messageId,
        receiverId,
        status,
      });

      // ✅ VALIDATION DES PARAMÈTRES
      if (!messageId || !receiverId || !status) {
        throw new Error("messageId, receiverId et status sont requis");
      }

      // ✅ VALIDATION DU STATUT
      const validStatuses = [
        "SENT",
        "DELIVERED",
        "READ",
        "EDITED",
        "FAILED",
        "DELETED",
      ];
      if (!validStatuses.includes(status)) {
        throw new Error(
          `Status invalide. Valeurs acceptées: ${validStatuses.join(", ")}`,
        );
      }

      // ✅ RÉCUPÉRER LE MESSAGE POUR VÉRIFICATION ET COMPTEURS
      const existingMessage = await Message.findById(messageId);
      if (!existingMessage) {
        throw new Error(`Message ${messageId} introuvable`);
      }

      console.log(`✅ Message trouvé pour mise à jour statut:`, {
        messageId: existingMessage._id,
        senderId: existingMessage.senderId,
        conversationId: existingMessage.conversationId,
        currentStatus: existingMessage.status,
        totalRecipients: existingMessage.totalRecipients || 1,
        deliveredCount: existingMessage.deliveredCount || 0,
        readCount: existingMessage.readCount || 0,
      });

      // ✅ VÉRIFIER SI L'UTILISATEUR A DÉJÀ MARQUÉ CE MESSAGE
      const deliveredBy = existingMessage.deliveredBy || [];
      const readBy = existingMessage.readBy || [];

      if (status === "DELIVERED" && deliveredBy.includes(receiverId)) {
        console.log(
          `ℹ️ User ${receiverId} a déjà marqué le message comme DELIVERED`,
        );
        return {
          modifiedCount: 0,
          matchedCount: 1,
          message: `User ${receiverId} a déjà marqué comme DELIVERED`,
          processingTime: Date.now() - startTime,
        };
      }

      if (status === "READ" && readBy.includes(receiverId)) {
        console.log(
          `ℹ️ User ${receiverId} a déjà marqué le message comme READ`,
        );
        return {
          modifiedCount: 0,
          matchedCount: 1,
          message: `User ${receiverId} a déjà marqué comme READ`,
          processingTime: Date.now() - startTime,
        };
      }

      // ✅ CONSTRUIRE LA MISE À JOUR SELON LE STATUT
      const updateOps = {
        $set: {
          updatedAt: new Date(),
        },
      };

      const totalRecipients = existingMessage.totalRecipients || 1;
      let newDeliveredCount = existingMessage.deliveredCount || 0;
      let newReadCount = existingMessage.readCount || 0;

      if (status === "DELIVERED") {
        // ✅ AJOUTER L'UTILISATEUR À deliveredBy ET INCRÉMENTER deliveredCount
        updateOps.$addToSet = { deliveredBy: receiverId };
        updateOps.$inc = { deliveredCount: 1 };
        updateOps.$set["metadata.deliveryMetadata.deliveredAt"] =
          new Date().toISOString();
        updateOps.$set.receivedAt = updateOps.$set.receivedAt || new Date();

        newDeliveredCount++;

        // ✅ SI TOUS ONT REÇU → status = "DELIVERED"
        if (newDeliveredCount >= totalRecipients) {
          updateOps.$set.status = "DELIVERED";
          console.log(
            `✅ Tous les destinataires ont reçu (${newDeliveredCount}/${totalRecipients}) → status=DELIVERED`,
          );
        }
      } else if (status === "READ") {
        // ✅ SI L'UTILISATEUR N'A PAS ENCORE REÇU, AJOUTER AUSSI À deliveredBy
        if (!deliveredBy.includes(receiverId)) {
          updateOps.$addToSet = {
            deliveredBy: receiverId,
            readBy: receiverId,
          };
          updateOps.$inc = {
            deliveredCount: 1,
            readCount: 1,
          };
          newDeliveredCount++;
        } else {
          updateOps.$addToSet = { readBy: receiverId };
          updateOps.$inc = { readCount: 1 };
        }

        updateOps.$set["metadata.deliveryMetadata.readAt"] =
          new Date().toISOString();
        updateOps.$set.readAt = updateOps.$set.readAt || new Date();

        newReadCount++;

        // ✅ SI TOUS ONT LU → status = "READ"
        if (newReadCount >= totalRecipients) {
          updateOps.$set.status = "READ";
          console.log(
            `✅ Tous les destinataires ont lu (${newReadCount}/${totalRecipients}) → status=READ`,
          );
        } else if (
          newDeliveredCount >= totalRecipients &&
          existingMessage.status === "SENT"
        ) {
          // Si tous ont reçu mais pas encore lu → status = "DELIVERED"
          updateOps.$set.status = "DELIVERED";
        }
      } else if (status === "DELETED" || status === "EDITED") {
        updateOps.$set.status = status;
      }

      // ✅ EFFECTUER LA MISE À JOUR
      const updateResult = await Message.findByIdAndUpdate(
        messageId,
        updateOps,
        {
          new: true,
          runValidators: true,
        },
      );

      const processingTime = Date.now() - startTime;

      if (!updateResult) {
        console.log(`ℹ️ Aucune mise à jour pour message ${messageId}`);
        return {
          modifiedCount: 0,
          matchedCount: 0,
          message: `Erreur mise à jour`,
          processingTime,
        };
      }

      console.log(`✅ Statut message mis à jour:`, {
        messageId: updateResult._id,
        newStatus: updateResult.status,
        deliveredCount: updateResult.deliveredCount,
        readCount: updateResult.readCount,
        totalRecipients: updateResult.totalRecipients,
        processingTime: `${processingTime}ms`,
      });

      // ✅ GESTION SPÉCIALE POUR LA SUPPRESSION
      if (status === "DELETED" && updateResult) {
        try {
          // 1. Récupérer la conversation pour vérifier si c'était le lastMessage
          const Conversation = require("../mongodb/models/ConversationModel");
          const conversation = await Conversation.findOne({
            "lastMessage._id": messageId,
          });

          if (conversation) {
            console.log(
              `🔍 Message supprimé était le lastMessage de ${conversation._id}`,
            );

            // 2. Récupérer le message précédent non supprimé
            const previousMessage = await Message.findOne({
              conversationId: conversation._id,
              status: { $ne: "DELETED" },
              deletedAt: null,
            })
              .sort({ createdAt: -1 })
              .lean();

            // 3. Mettre à jour la conversation
            if (previousMessage) {
              await Conversation.findByIdAndUpdate(conversation._id, {
                $set: {
                  "lastMessage._id": previousMessage._id,
                  "lastMessage.content": previousMessage.content.substring(
                    0,
                    200,
                  ),
                  "lastMessage.type": previousMessage.type,
                  "lastMessage.senderId": previousMessage.senderId,
                  "lastMessage.timestamp": previousMessage.createdAt,
                  lastMessageAt: previousMessage.createdAt,
                  updatedAt: new Date(),
                },
              });
              console.log(
                `✅ Conversation mise à jour avec message précédent: ${previousMessage._id}`,
              );
            } else {
              // Aucun message restant - vider lastMessage
              await Conversation.findByIdAndUpdate(conversation._id, {
                $set: {
                  lastMessage: null,
                  lastMessageAt: null,
                  updatedAt: new Date(),
                },
              });
              console.log(`✅ Conversation vidée - aucun message restant`);
            }
          }
        } catch (convError) {
          console.warn(
            "⚠️ Erreur mise à jour lastMessage après suppression:",
            convError.message,
          );
          // Ne pas faire échouer la suppression du message pour autant
        }
      }

      // ✅ RETOURNER LE RÉSULTAT DANS LE FORMAT ATTENDU
      return {
        modifiedCount: 1,
        matchedCount: 1,
        message: updateResult,
        processingTime,
        status: "success",
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ Erreur mise à jour statut message ${messageId}:`, {
        error: error.message,
        messageId,
        receiverId,
        status,
        processingTime: `${processingTime}ms`,
      });
      throw new Error(
        `Impossible de mettre à jour le statut: ${error.message}`,
      );
    }
  }

  // ===============================
  // MÉTHODES MANQUANTES
  // ===============================

  /**
   * ✅ Compter les messages non-lus par conversation pour un utilisateur
   * Utilisé par CachedMessageRepository.getUnreadCount()
   */
  async countUnreadMessages(conversationId, userId) {
    try {
      const count = await Message.countDocuments({
        conversationId,
        receiverId: userId,
        status: { $ne: "READ" },
      });
      console.log(`📊 Unread par conv: ${conversationId}/${userId} = ${count}`);
      return count;
    } catch (error) {
      console.error("❌ Erreur countUnreadMessages:", error.message);
      throw error;
    }
  }

  /**
   * ✅ Compter TOUS les messages non-lus pour un utilisateur (toutes conversations)
   * Utilisé par UnreadMessageManager.getTotalUnreadCount()
   */
  async countAllUnreadMessages(userId) {
    try {
      const count = await Message.countDocuments({
        receiverId: userId,
        status: { $ne: "READ" },
      });
      console.log(`📊 Total unread pour ${userId}: ${count}`);
      return count;
    } catch (error) {
      console.error("❌ Erreur countAllUnreadMessages:", error.message);
      throw error;
    }
  }

  // Ajouter ces méthodes manquantes
  async getLastMessage(conversationId) {
    return await Message.findOne({ conversationId })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getMessageCount(conversationId) {
    return await Message.countDocuments({ conversationId });
  }
}

module.exports = MongoMessageRepository;
