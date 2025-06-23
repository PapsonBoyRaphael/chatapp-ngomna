const Message = require("../mongodb/models/MessageModel");

class MongoMessageRepository {
  constructor(redisClient = null, kafkaProducer = null) {
    this.redisClient = redisClient;
    this.kafkaProducer = kafkaProducer;
    this.cachePrefix = "msg:";
    this.defaultTTL = 3600; // 1 heure
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
      if (this.redisClient) {
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
      if (this.redisClient && useCache) {
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
      if (this.redisClient && useCache) {
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
    const {
      page = 1,
      limit = 50,
      useCache = true,
      sortBy = "createdAt",
      sortOrder = -1,
    } = options;

    const startTime = Date.now();
    const cacheKey = `${this.cachePrefix}conv:${conversationId}:p${page}:l${limit}:s${sortBy}${sortOrder}`;

    try {
      // 🚀 VÉRIFIER LE CACHE REDIS
      if (this.redisClient && useCache) {
        try {
          const cached = await this.redisClient.get(cacheKey);
          if (cached) {
            const data = JSON.parse(cached);
            console.log(
              `📦 Messages conversation depuis cache: ${conversationId} (${
                Date.now() - startTime
              }ms)`
            );
            return {
              ...data,
              fromCache: true,
            };
          }
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur lecture cache conversation:",
            cacheError.message
          );
        }
      }

      // Récupération depuis MongoDB avec pagination
      const skip = (page - 1) * limit;
      const sortObj = { [sortBy]: sortOrder };

      const [messages, totalCount] = await Promise.all([
        Message.find({ conversationId })
          .sort(sortObj)
          .skip(skip)
          .limit(limit)
          .lean(),
        Message.countDocuments({ conversationId }),
      ]);

      const result = {
        messages,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNext: page * limit < totalCount,
          hasPrevious: page > 1,
        },
        fromCache: false,
      };

      const processingTime = Date.now() - startTime;

      // Mettre en cache si Redis disponible
      if (this.redisClient && useCache && messages.length > 0) {
        try {
          await this.redisClient.setex(
            cacheKey,
            this.defaultTTL,
            JSON.stringify(result)
          );
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur mise en cache conversation:",
            cacheError.message
          );
        }
      }

      console.log(
        `🔍 Messages conversation: ${conversationId} (${messages.length} msg, ${processingTime}ms)`
      );
      return result;
    } catch (error) {
      console.error(
        `❌ Erreur recherche messages conversation ${conversationId}:`,
        error
      );
      throw error;
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
      const filter = {
        conversationId,
        receiverId,
        status: { $ne: status }, // Ne pas mettre à jour si déjà au bon statut
      };

      // Si des IDs spécifiques sont fournis
      if (messageIds.length > 0) {
        filter._id = { $in: messageIds };
      }

      const updateResult = await Message.updateMany(filter, {
        $set: {
          status,
          updatedAt: new Date(),
        },
      });

      const processingTime = Date.now() - startTime;

      // 🗑️ INVALIDER LES CACHES LIÉS
      if (this.redisClient && updateResult.modifiedCount > 0) {
        try {
          await this._invalidateConversationCaches(conversationId);
          await this._invalidateUserCaches(receiverId);
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur invalidation cache statut:",
            cacheError.message
          );
        }
      }

      // 🚀 PUBLIER ÉVÉNEMENT KAFKA
      if (this.kafkaProducer && updateResult.modifiedCount > 0) {
        try {
          await this._publishMessageEvent("MESSAGE_STATUS_UPDATED", null, {
            conversationId,
            receiverId,
            status,
            modifiedCount: updateResult.modifiedCount,
            processingTime,
          });
        } catch (kafkaError) {
          console.warn("⚠️ Erreur publication statut:", kafkaError.message);
        }
      }

      console.log(
        `📝 Statut mis à jour: ${updateResult.modifiedCount} messages (${processingTime}ms)`
      );
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
      if (this.redisClient) {
        try {
          await this._invalidateMessageCache(messageId);
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
      if (this.redisClient) {
        try {
          const cached = await this.redisClient.get(cacheKey);
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
      if (this.redisClient) {
        try {
          await this.redisClient.setex(cacheKey, 300, count.toString()); // 5 minutes
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
    } = options;

    const startTime = Date.now();
    const cacheKey = `${this.cachePrefix}search:${JSON.stringify({
      query,
      options,
    })}`;

    try {
      // Vérifier le cache
      if (this.redisClient && useCache) {
        try {
          const cached = await this.redisClient.get(cacheKey);
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

      // Construire le filtre de recherche
      const filter = {
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

      const messages = await Message.find(filter)
        .sort({ score: { $meta: "textScore" }, createdAt: -1 })
        .limit(limit)
        .lean();

      const result = {
        messages,
        totalFound: messages.length,
        query,
        searchTime: Date.now() - startTime,
      };

      // Mettre en cache
      if (this.redisClient && useCache) {
        try {
          await this.redisClient.setex(cacheKey, 600, JSON.stringify(result)); // 10 minutes
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
      if (this.redisClient) {
        try {
          const cached = await this.redisClient.get(cacheKey);
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
      if (this.redisClient) {
        try {
          await this.redisClient.setex(cacheKey, 1800, JSON.stringify(result)); // 30 minutes
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
    if (!this.redisClient) return false;

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
      if (typeof this.redisClient.setex === "function") {
        // Redis classique
        await this.redisClient.setex(cacheKey, this.defaultTTL, messageData);
      } else if (typeof this.redisClient.setEx === "function") {
        // Redis v4+ (méthode avec majuscule)
        await this.redisClient.setEx(cacheKey, this.defaultTTL, messageData);
      } else if (typeof this.redisClient.set === "function") {
        // ✅ FALLBACK avec set + expire séparé
        await this.redisClient.set(cacheKey, messageData);

        if (typeof this.redisClient.expire === "function") {
          await this.redisClient.expire(cacheKey, this.defaultTTL);
        } else if (typeof this.redisClient.expireAt === "function") {
          const expireTime = Math.floor(Date.now() / 1000) + this.defaultTTL;
          await this.redisClient.expireAt(cacheKey, expireTime);
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
      const cached = await this.redisClient.get(cacheKey);

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
          const keys = await this.redisClient.keys(pattern);
          if (keys.length > 0) {
            await this.redisClient.del(keys);
          }
        } else {
          await this.redisClient.del(pattern);
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
    if (!this.redisClient) return false;

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
              typeof this.redisClient.keys === "function" &&
              typeof this.redisClient.del === "function"
            ) {
              const keys = await this.redisClient.keys(keyPattern);
              if (keys.length > 0) {
                await this.redisClient.del(...keys);
              }
            } else if (typeof this.redisClient.scanStream === "function") {
              // Scanner et supprimer avec stream
              const keys = [];
              const stream = this.redisClient.scanStream({
                match: keyPattern,
                count: 100,
              });

              stream.on("data", (resultKeys) => {
                keys.push(...resultKeys);
              });

              stream.on("end", async () => {
                if (
                  keys.length > 0 &&
                  typeof this.redisClient.del === "function"
                ) {
                  await this.redisClient.del(...keys);
                }
              });
            }
          } else {
            // Clé simple
            if (typeof this.redisClient.del === "function") {
              await this.redisClient.del(keyPattern);
            } else if (typeof this.redisClient.unlink === "function") {
              await this.redisClient.unlink(keyPattern);
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
    if (!this.redisClient) return;

    const patterns = [
      `${this.cachePrefix}conv:${conversationId}:*`,
      `${this.cachePrefix}stats:${conversationId}`,
    ];

    for (const pattern of patterns) {
      try {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
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
    if (!this.redisClient) return;

    const patterns = [`${this.cachePrefix}unread:${userId}:*`];

    for (const pattern of patterns) {
      try {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
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
      if (this.redisClient) {
        const redisStart = Date.now();
        try {
          await this.redisClient.ping();
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
    if (!this.redisClient) {
      return { cleared: 0, message: "Redis non disponible" };
    }

    try {
      const searchPattern = pattern || `${this.cachePrefix}*`;
      const keys = await this.redisClient.keys(searchPattern);

      if (keys.length > 0) {
        await this.redisClient.del(keys);
      }

      console.log(`🗑️ Cache nettoyé: ${keys.length} clés supprimées`);
      return { cleared: keys.length, pattern: searchPattern };
    } catch (error) {
      console.error("❌ Erreur nettoyage cache:", error);
      throw error;
    }
  }

  _testRedisAPI() {
    if (!this.redisClient) {
      console.log("❌ Pas de client Redis");
      return false;
    }

    const methods = {
      // Méthodes de base
      get: typeof this.redisClient.get === "function",
      set: typeof this.redisClient.set === "function",
      del: typeof this.redisClient.del === "function",

      // Méthodes avec expiration
      setex: typeof this.redisClient.setex === "function",
      setEx: typeof this.redisClient.setEx === "function", // Redis v4+
      expire: typeof this.redisClient.expire === "function",
      expireAt: typeof this.redisClient.expireAt === "function",

      // Méthodes de recherche
      keys: typeof this.redisClient.keys === "function",
      scan: typeof this.redisClient.scan === "function",
      scanStream: typeof this.redisClient.scanStream === "function",

      // Méthodes avancées
      unlink: typeof this.redisClient.unlink === "function",
      exists: typeof this.redisClient.exists === "function",
    };

    console.log("🔍 API Redis disponible:", methods);
    return methods;
  }
}

module.exports = MongoMessageRepository;
