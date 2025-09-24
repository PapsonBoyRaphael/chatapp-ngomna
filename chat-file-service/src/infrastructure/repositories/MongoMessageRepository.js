const Message = require("../mongodb/models/MessageModel");
const mongoose = require("mongoose");

class MongoMessageRepository {
  constructor(cacheService = null, kafkaProducer = null) {
    this.cacheService = cacheService;
    this.kafkaProducer = kafkaProducer;
    this.cachePrefix = "msg:";
    this.defaultTTL = 3600;
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
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
            validationError.message
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
              validationError.message
            );
            throw new Error(
              `Données de message invalides: ${validationError.message}`
            );
          }
        } catch (modelError) {
          console.error(
            `❌ Erreur création modèle message:`,
            modelError.message
          );
          throw new Error(
            `Impossible de créer le modèle message: ${modelError.message}`
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
          }
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
            `ID de conversation invalide: ${message.conversationId}`
          );
        }

        throw new Error(`Erreur MongoDB: ${saveError.message}`);
      }

      const processingTime = Date.now() - startTime;

      // ✅ CACHE ET KAFKA AVEC GESTION D'ERREUR
      if (this.cacheService) {
        try {
          await this._cacheMessage(savedMessage);
          await this._invalidateRelatedCaches(savedMessage);
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache message:", cacheError.message);
        }
      }

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
        `✅ Message complètement sauvegardé: ${savedMessage._id} (${processingTime}ms)`
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
            }
          );
        } catch (kafkaError) {
          console.warn("⚠️ Erreur publication échec:", kafkaError.message);
        }
      }

      throw error;
    }
  }

  async findById(messageId, useCache = true) {
    const startTime = Date.now();

    try {
      // Cache Redis
      if (this.cacheService && useCache) {
        try {
          const cached = await this._getCachedMessage(messageId);
          if (cached) {
            this.metrics.cacheHits++;
            console.log(
              `📦 Message depuis cache: ${messageId} (${
                Date.now() - startTime
              }ms)`
            );
            return cached;
          } else {
            this.metrics.cacheMisses++;
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur lecture cache message:", cacheError.message);
        }
      }

      this.metrics.dbQueries++;
      const message = await Message.findById(messageId).lean();

      if (!message) {
        throw new Error(`Message ${messageId} non trouvé`);
      }

      const processingTime = Date.now() - startTime;

      // Mettre en cache
      if (this.cacheService && useCache) {
        try {
          await this._cacheMessage(message);
        } catch (cacheError) {
          console.warn("⚠️ Erreur mise en cache message:", cacheError.message);
        }
      }

      console.log(`🔍 Message trouvé: ${messageId} (${processingTime}ms)`);
      return message;
    } catch (error) {
      this.metrics.errors++;
      console.error(`❌ Erreur recherche message ${messageId}:`, error);
      throw error;
    }
  }

  async findByConversation(conversationId, options = {}) {
    const { page = 1, limit = 50 } = options;

    try {
      // Corriger la création de l'ObjectId avec new
      const objectId = new mongoose.Types.ObjectId(conversationId);

      const filter = {
        conversationId: objectId,
        deletedAt: null,
      };

      console.log("🔍 Filtre MongoDB:", filter);

      const messages = await Message.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

      console.log("🔍 Messages trouvés:", messages.length);

      return messages;
    } catch (error) {
      console.error("❌ Erreur findByConversation:", error);
      return [];
    }
  }

  async updateMessageStatus(
    conversationId,
    receiverId,
    status,
    messageIds = []
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

      const validStatuses = ["SENT", "DELIVERED", "READ", "FAILED"];
      if (!validStatuses.includes(status)) {
        throw new Error(
          `Status invalide. Valeurs acceptées: ${validStatuses.join(", ")}`
        );
      }

      // ✅ CONSTRUIRE LE FILTRE
      let filter = {
        status: { $ne: status },
      };

      if (conversationId) {
        filter.conversationId = conversationId;
      }

      // Pour DELIVERED/READ, on veut les messages reçus par l'utilisateur
      if (status === "DELIVERED" || status === "READ") {
        filter.senderId = { $ne: receiverId };
      }

      if (messageIds && messageIds.length > 0) {
        filter._id = { $in: messageIds };
      }

      // ✅ EFFECTUER LA MISE À JOUR EN MASSE
      const updateResult = await Message.updateMany(filter, {
        $set: {
          status: status,
          updatedAt: new Date(),
          // ✅ AJOUTER LES MÉTADONNÉES DE LIVRAISON
          ...(status === "DELIVERED" && {
            "metadata.deliveryMetadata.deliveredAt": new Date().toISOString(),
            "metadata.deliveryMetadata.deliveredBy": receiverId,
          }),
          ...(status === "READ" && {
            "metadata.deliveryMetadata.readAt": new Date().toISOString(),
            "metadata.deliveryMetadata.readBy": receiverId,
          }),
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

      // ✅ INVALIDER LES CACHES LIÉS SI DES MESSAGES ONT ÉTÉ MODIFIÉS
      if (this.cacheService && updateResult.modifiedCount > 0) {
        try {
          // Invalider toutes les variantes de cache pour cette conversation
          const patterns = [
            `msg:conv:${conversationId}:*`,
            `messages:${conversationId}:*`,
            `conversation:${conversationId}:*`,
            `conversation:${conversationId}`,
            `conversations:*`,
          ];
          for (const pattern of patterns) {
            if (
              pattern.includes("*") &&
              typeof this.cacheService.keys === "function"
            ) {
              const keys = await this.cacheService.keys(pattern);
              if (keys.length > 0) {
                await this.cacheService.del(keys);
              }
            } else {
              await this.cacheService.del(pattern);
            }
          }
          console.log(
            `🗑️ Caches invalidés pour conversation ${conversationId || "[all]"}`
          );
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur invalidation cache statut:",
            cacheError.message
          );
        }
      }

      // ✅ PUBLIER ÉVÉNEMENT KAFKA
      if (this.kafkaProducer && updateResult.modifiedCount > 0) {
        try {
          await this._publishMessageEvent("MESSAGE_STATUS_UPDATED", null, {
            conversationId,
            receiverId,
            status,
            modifiedCount: updateResult.modifiedCount,
            processingTime,
          });
          console.log(
            `📤 Événement Kafka publié: ${updateResult.modifiedCount} messages mis à jour`
          );
        } catch (kafkaError) {
          console.warn("⚠️ Erreur publication statut:", kafkaError.message);
        }
      }

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
        { new: true }
      );

      const processingTime = Date.now() - startTime;

      // 🗑️ INVALIDER LES CACHES
      if (this.cacheService) {
        try {
          await this._invalidateMessageCaches(messageId);
          await this._invalidateConversationCaches(message.conversationId);
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur invalidation cache suppression:",
            cacheError.message
          );
        }
      }

      // 🚀 PUBLIER ÉVÉNEMENT KAFKA
      if (this.kafkaProducer) {
        try {
          await this._publishMessageEvent("MESSAGE_DELETED", deletedMessage, {
            processingTime,
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication suppression:",
            kafkaError.message
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
      const cacheKey = conversationId
        ? `${this.cachePrefix}unread:${userId}:${conversationId}`
        : `${this.cachePrefix}unread:${userId}:total`;

      // 🚀 VÉRIFIER LE CACHE
      if (this.cacheService) {
        try {
          const cached = await this.cacheService.get(cacheKey);
          if (cached !== null) {
            console.log(
              `📦 Compteur non-lus depuis cache: ${userId} (${
                Date.now() - startTime
              }ms)`
            );
            return parseInt(cached);
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur lecture cache compteur:", cacheError.message);
        }
      }

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

      // Mettre en cache
      if (this.cacheService) {
        try {
          await this.cacheService.setex(cacheKey, 300, count.toString()); // 5 minutes
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache compteur:", cacheError.message);
        }
      }

      console.log(
        `🔢 Compteur non-lus: ${userId} = ${count} (${processingTime}ms)`
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
      useCache = true,
      useLike = true, // Ajout d'une option pour activer %like%
    } = options;

    const startTime = Date.now();
    const cacheKey = `${this.cachePrefix}search:${JSON.stringify({
      query,
      options,
    })}`;

    try {
      if (this.cacheService && useCache) {
        try {
          const cached = await this.cacheService.get(cacheKey);
          if (cached) {
            console.log(
              `📦 Recherche depuis cache (${Date.now() - startTime}ms)`
            );
            return JSON.parse(cached);
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache recherche:", cacheError.message);
        }
      }

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

      if (this.cacheService && useCache) {
        try {
          await this.cacheService.setex(cacheKey, 600, JSON.stringify(result));
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache recherche:", cacheError.message);
        }
      }

      console.log(
        `🔍 Recherche: "${query}" = ${messages.length} résultats (${result.searchTime}ms)`
      );
      return result;
    } catch (error) {
      console.error("❌ Erreur recherche messages:", error);
      throw error;
    }
  }

  async getStatistics(conversationId) {
    const startTime = Date.now();
    const cacheKey = `${this.cachePrefix}stats:${conversationId}`;

    try {
      // Vérifier le cache
      if (this.cacheService) {
        try {
          const cached = await this.cacheService.get(cacheKey);
          if (cached) {
            console.log(
              `📦 Statistiques depuis cache: ${conversationId} (${
                Date.now() - startTime
              }ms)`
            );
            return JSON.parse(cached);
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache statistiques:", cacheError.message);
        }
      }

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

      // Mettre en cache
      if (this.cacheService) {
        try {
          await this.cacheService.setex(cacheKey, 1800, JSON.stringify(result)); // 30 minutes
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache statistiques:", cacheError.message);
        }
      }

      console.log(
        `📊 Statistiques calculées: ${conversationId} (${processingTime}ms)`
      );
      return result;
    } catch (error) {
      console.error(`❌ Erreur statistiques ${conversationId}:`, error);
      throw error;
    }
  }

  // ===============================
  // MÉTHODES PRIVÉES - CACHE
  // ===============================

  async _cacheMessage(message) {
    if (!this.cacheService) return false;

    try {
      const cacheKey = `message:${message._id}`;
      const messageData = JSON.stringify({
        id: message._id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        content: message.content,
        type: message.type,
        status: message.status,
        timestamp: message.timestamp,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      });

      // ✅ GÉRER LES DIFFÉRENTES API REDIS
      if (typeof this.cacheService.setex === "function") {
        // Redis classique
        await this.cacheService.setex(cacheKey, this.defaultTTL, messageData);
      } else if (typeof this.cacheService.setEx === "function") {
        // Redis v4+ (méthode avec majuscule)
        await this.cacheService.setEx(cacheKey, this.defaultTTL, messageData);
      } else if (typeof this.cacheService.set === "function") {
        // ✅ FALLBACK avec set + expire séparé
        await this.cacheService.set(cacheKey, messageData);

        if (typeof this.cacheService.expire === "function") {
          await this.cacheService.expire(cacheKey, this.defaultTTL);
        } else if (typeof this.cacheService.expireAt === "function") {
          const expireTime = Math.floor(Date.now() / 1000) + this.defaultTTL;
          await this.cacheService.expireAt(cacheKey, expireTime);
        }
      } else {
        console.warn(
          "⚠️ Aucune méthode Redis compatible trouvée pour la mise en cache"
        );
        return false;
      }

      console.log(`💾 Message mis en cache: ${message._id}`);
      return true;
    } catch (error) {
      console.warn(`⚠️ Erreur cache message ${message._id}:`, error.message);
      return false;
    }
  }

  async _getCachedMessage(messageId) {
    try {
      const cacheKey = `${this.cachePrefix}${messageId}`;
      const cached = await this.cacheService.get(cacheKey);

      if (!cached) {
        return null;
      }

      const data = JSON.parse(cached);
      return data;
    } catch (error) {
      console.warn(`⚠️ Erreur lecture cache ${messageId}:`, error.message);
      return null;
    }
  }

  async _invalidateMessageCaches(messageId, conversationId) {
    try {
      const patterns = [
        `${this.cachePrefix}${messageId}`,
        `${this.cachePrefix}conv:${conversationId}:*`,
        `conversations:*`,
      ];

      for (const pattern of patterns) {
        if (pattern.includes("*")) {
          const keys = await this.cacheService.keys(pattern);
          if (keys.length > 0) {
            await this.cacheService.del(keys);
          }
        } else {
          await this.cacheService.del(pattern);
        }
      }

      console.log(`🗑️ Cache message invalidé: ${messageId}`);
      return true;
    } catch (error) {
      console.warn(`⚠️ Erreur invalidation ${messageId}:`, error.message);
      return false;
    }
  }

  async _invalidateRelatedCaches(message) {
    if (!this.cacheService) return false;

    try {
      const keysToInvalidate = [
        `messages:${message.conversationId}:*`,
        `conversation:${message.conversationId}`,
        `unread:${message.receiverId || "unknown"}:*`,
        `user:messages:${message.senderId}:*`,
      ];

      for (const keyPattern of keysToInvalidate) {
        try {
          // ✅ GÉRER LES DIFFÉRENTES API REDIS POUR LA SUPPRESSION
          if (keyPattern.includes("*")) {
            // Pattern avec wildcard
            if (
              typeof this.cacheService.keys === "function" &&
              typeof this.cacheService.del === "function"
            ) {
              const keys = await this.cacheService.keys(keyPattern);
              if (keys.length > 0) {
                await this.cacheService.del(...keys);
              }
            } else if (typeof this.cacheService.scanStream === "function") {
              // Scanner et supprimer avec stream
              const keys = [];
              const stream = this.cacheService.scanStream({
                match: keyPattern,
                count: 100,
              });

              stream.on("data", (resultKeys) => {
                keys.push(...resultKeys);
              });

              stream.on("end", async () => {
                if (
                  keys.length > 0 &&
                  typeof this.cacheService.del === "function"
                ) {
                  await this.cacheService.del(...keys);
                }
              });
            }
          } else {
            // Clé simple
            if (typeof this.cacheService.del === "function") {
              await this.cacheService.del(keyPattern);
            } else if (typeof this.cacheService.unlink === "function") {
              await this.cacheService.unlink(keyPattern);
            }
          }
        } catch (keyError) {
          console.warn(
            `⚠️ Erreur invalidation clé ${keyPattern}:`,
            keyError.message
          );
        }
      }

      console.log(`🗑️ Caches invalidés pour message: ${message._id}`);
      return true;
    } catch (error) {
      console.warn(`⚠️ Erreur invalidation caches:`, error.message);
      return false;
    }
  }

  async _invalidateConversationCaches(conversationId) {
    if (!this.cacheService) return;

    const patterns = [
      `${this.cachePrefix}conv:${conversationId}:*`,
      `${this.cachePrefix}stats:${conversationId}`,
    ];

    for (const pattern of patterns) {
      try {
        const keys = await this.cacheService.keys(pattern);
        if (keys.length > 0) {
          await this.cacheService.del(keys);
        }
      } catch (error) {
        console.warn(
          `⚠️ Erreur invalidation conversation ${pattern}:`,
          error.message
        );
      }
    }
  }

  async _invalidateUserCaches(userId) {
    if (!this.cacheService) return;

    const patterns = [`${this.cachePrefix}unread:${userId}:*`];

    for (const pattern of patterns) {
      try {
        const keys = await this.cacheService.keys(pattern);
        if (keys.length > 0) {
          await this.cacheService.del(keys);
        }
      } catch (error) {
        console.warn(
          `⚠️ Erreur invalidation utilisateur ${pattern}:`,
          error.message
        );
      }
    }
  }

  _calculateTTL(message) {
    // TTL selon le type de message
    const ttlMap = {
      TEXT: 3600, // 1 heure
      IMAGE: 7200, // 2 heures
      VIDEO: 1800, // 30 minutes (plus lourd)
      AUDIO: 3600, // 1 heure
      FILE: 7200, // 2 heures
      SYSTEM: 300, // 5 minutes (moins important)
    };

    return ttlMap[message.type] || this.defaultTTL;
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

      // Test Redis
      if (this.cacheService) {
        const redisStart = Date.now();
        try {
          await this.cacheService.ping();
          healthData.redis = {
            status: "connected",
            responseTime: Date.now() - redisStart,
          };
        } catch (error) {
          healthData.redis = {
            status: "disconnected",
            error: error.message,
          };
        }
      } else {
        healthData.redis.status = "disabled";
      }

      // Kafka status
      healthData.kafka.status = this.kafkaProducer ? "enabled" : "disabled";

      return healthData;
    } catch (error) {
      console.error("❌ Erreur health check repository:", error);
      throw error;
    }
  }

  async clearCache(pattern = null) {
    if (!this.cacheService) {
      return { cleared: 0, message: "Redis non disponible" };
    }

    try {
      const searchPattern = pattern || `${this.cachePrefix}*`;
      const keys = await this.cacheService.keys(searchPattern);

      if (keys.length > 0) {
        await this.cacheService.del(keys);
      }

      console.log(`🗑️ Cache nettoyé: ${keys.length} clés supprimées`);
      return { cleared: keys.length, pattern: searchPattern };
    } catch (error) {
      console.error("❌ Erreur nettoyage cache:", error);
      throw error;
    }
  }

  _testRedisAPI() {
    if (!this.cacheService) {
      console.log("❌ Pas de client Redis");
      return false;
    }

    const methods = {
      // Méthodes de base
      get: typeof this.cacheService.get === "function",
      set: typeof this.cacheService.set === "function",
      del: typeof this.cacheService.del === "function",

      // Méthodes avec expiration
      setex: typeof this.cacheService.setex === "function",
      setEx: typeof this.cacheService.setEx === "function", // Redis v4+
      expire: typeof this.cacheService.expire === "function",
      expireAt: typeof this.cacheService.expireAt === "function",

      // Méthodes de recherche
      keys: typeof this.cacheService.keys === "function",
      scan: typeof this.cacheService.scan === "function",
      scanStream: typeof this.cacheService.scanStream === "function",

      // Méthodes avancées
      unlink: typeof this.cacheService.unlink === "function",
      exists: typeof this.cacheService.exists === "function",
    };

    console.log("🔍 API Redis disponible:", methods);
    return methods;
  }

  /**
   * Mettre à jour le statut d'un message spécifique
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
      const validStatuses = ["SENT", "DELIVERED", "READ", "FAILED"];
      if (!validStatuses.includes(status)) {
        throw new Error(
          `Status invalide. Valeurs acceptées: ${validStatuses.join(", ")}`
        );
      }

      // ✅ CONSTRUIRE LE FILTRE POUR LE MESSAGE SPÉCIFIQUE
      const filter = {
        _id: messageId,
        status: { $ne: status }, // Ne pas mettre à jour si déjà au bon statut
      };

      // ✅ POUR LES STATUTS DELIVERED ET READ, VÉRIFIER QUE L'UTILISATEUR EST LE DESTINATAIRE
      if (status === "DELIVERED" || status === "READ") {
        // Option 1: Le receiverId doit correspondre à un participant
        // (on ne vérifie pas forcément que c'est exactement le receiverId du message)
        // Car pour les conversations de groupe, plusieurs utilisateurs peuvent marquer comme lu

        // Récupérer d'abord le message pour vérifier
        var existingMessage = await Message.findById(messageId);
        if (!existingMessage) {
          throw new Error(`Message ${messageId} introuvable`);
        }

        console.log(`✅ Message trouvé pour mise à jour statut:`, {
          messageId: existingMessage._id,
          senderId: existingMessage.senderId,
          conversationId: existingMessage.conversationId,
          currentStatus: existingMessage.status,
        });
      }

      // ✅ EMPÊCHER LA RÉGRESSION DE STATUT
      if (existingMessage) {
        const statusOrder = { SENT: 1, DELIVERED: 2, READ: 3 };
        if (statusOrder[existingMessage.status] > statusOrder[status]) {
          console.log(
            `⚠️ Impossible de rétrograder le statut de ${existingMessage.status} à ${status}`
          );
          return {
            modifiedCount: 0,
            matchedCount: 1,
            message: `Impossible de rétrograder le statut de ${existingMessage.status} à ${status}`,
            processingTime: Date.now() - startTime,
          };
        }
      }

      // ✅ EFFECTUER LA MISE À JOUR
      const updateResult = await Message.findOneAndUpdate(
        filter,
        {
          $set: {
            status: status,
            updatedAt: new Date(),

            // ✅ AJOUTER LES MÉTADONNÉES DE LIVRAISON
            ...(status === "DELIVERED" && {
              "metadata.deliveryMetadata.deliveredAt": new Date().toISOString(),
              receivedAt: new Date(),
              "metadata.deliveryMetadata.deliveredBy": receiverId,
            }),
            ...(status === "READ" && {
              "metadata.deliveryMetadata.readAt": new Date().toISOString(),
              readAt: new Date(),
              "metadata.deliveryMetadata.readBy": receiverId,
            }),
          },
        },
        {
          new: true, // Retourner le document mis à jour
          runValidators: true,
        }
      );

      const processingTime = Date.now() - startTime;

      // ✅ VÉRIFIER SI LA MISE À JOUR A RÉUSSI
      if (!updateResult) {
        console.log(
          `ℹ️ Aucune mise à jour nécessaire pour message ${messageId} (déjà ${status})`
        );
        return {
          modifiedCount: 0,
          matchedCount: 0,
          message: `Message déjà au statut ${status}`,
          processingTime,
        };
      }

      console.log(`✅ Statut message mis à jour:`, {
        messageId: updateResult._id,
        oldStatus: filter.status,
        newStatus: updateResult.status,
        updatedAt: updateResult.updatedAt,
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
              `🔍 Message supprimé était le lastMessage de ${conversation._id}`
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
                    200
                  ),
                  "lastMessage.type": previousMessage.type,
                  "lastMessage.senderId": previousMessage.senderId,
                  "lastMessage.timestamp": previousMessage.createdAt,
                  lastMessageAt: previousMessage.createdAt,
                  updatedAt: new Date(),
                },
              });
              console.log(
                `✅ Conversation mise à jour avec message précédent: ${previousMessage._id}`
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

            // 4. Invalider le cache de la conversation
            if (this.cacheService) {
              try {
                await this.cacheService.del(`conversation:${conversation._id}`);
                await this.cacheService.del(`conversations:*`);
              } catch (cacheError) {
                console.warn(
                  "⚠️ Erreur invalidation cache conversation:",
                  cacheError.message
                );
              }
            }
          }
        } catch (convError) {
          console.warn(
            "⚠️ Erreur mise à jour lastMessage après suppression:",
            convError.message
          );
          // Ne pas faire échouer la suppression du message pour autant
        }
      }

      // ✅ INVALIDER LES CACHES LIÉS
      if (this.cacheService) {
        try {
          await this._invalidateMessageCaches(messageId);
          await this._invalidateConversationCaches(updateResult.conversationId);
          await this._invalidateUserCaches(receiverId);
          console.log(`🗑️ Caches invalidés pour message ${messageId}`);
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur invalidation cache statut:",
            cacheError.message
          );
        }
      }

      // ✅ PUBLIER ÉVÉNEMENT KAFKA
      if (
        this.kafkaProducer &&
        typeof this.kafkaProducer.publishMessage === "function"
      ) {
        try {
          await this._publishMessageEvent(
            "SINGLE_MESSAGE_STATUS_UPDATED",
            updateResult,
            {
              messageId,
              receiverId,
              status,
              processingTime,
              previousStatus: existingMessage
                ? existingMessage.status
                : "unknown",
            }
          );
          console.log(`📤 Événement Kafka publié pour message ${messageId}`);
        } catch (kafkaError) {
          console.warn("⚠️ Erreur publication Kafka:", kafkaError.message);
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
        `Impossible de mettre à jour le statut: ${error.message}`
      );
    }
  }
}

module.exports = MongoMessageRepository;
