const Conversation = require("../mongodb/models/ConversationModel");

class MongoConversationRepository {
  constructor(redisClient = null, kafkaProducer = null) {
    this.redisClient = redisClient;
    this.kafkaProducer = kafkaProducer;
    this.cachePrefix = "conversation:";
    this.defaultTTL = 600; // 10 minutes
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      dbQueries: 0,
      errors: 0,
      kafkaEvents: 0,
      kafkaErrors: 0,
    };
  }

  async save(conversation) {
    const startTime = Date.now();

    try {
      const conversationModel = new Conversation(conversation);
      this.metrics.dbQueries++;
      const savedConversation = await conversationModel.save();

      const processingTime = Date.now() - startTime;

      // Cache Redis
      if (this.redisClient) {
        try {
          await this._cacheConversation(savedConversation);
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache conversation:", cacheError.message);
        }
      }

      // Kafka
      if (this.kafkaProducer) {
        try {
          await this._publishConversationEvent(
            "CONVERSATION_CREATED",
            savedConversation,
            {
              processingTime,
            }
          );
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication conversation:",
            kafkaError.message
          );
        }
      }

      console.log(
        `💾 Conversation sauvegardée: ${savedConversation._id} (${processingTime}ms)`
      );
      return savedConversation;
    } catch (error) {
      this.metrics.errors++;
      console.error("❌ Erreur sauvegarde conversation:", error);
      throw error;
    }
  }

  async findById(conversationId, useCache = true) {
    const startTime = Date.now();

    try {
      // Cache Redis
      if (this.redisClient && useCache) {
        try {
          const cached = await this._getCachedConversation(conversationId);
          if (cached) {
            this.metrics.cacheHits++;
            console.log(
              `📦 Conversation depuis cache: ${conversationId} (${
                Date.now() - startTime
              }ms)`
            );
            return cached;
          } else {
            this.metrics.cacheMisses++;
          }
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur lecture cache conversation:",
            cacheError.message
          );
        }
      }

      this.metrics.dbQueries++;
      const conversation = await Conversation.findById(conversationId).lean();

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} non trouvée`);
      }

      const processingTime = Date.now() - startTime;

      // Mettre en cache
      if (this.redisClient && useCache) {
        try {
          await this._cacheConversation(conversation);
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur mise en cache conversation:",
            cacheError.message
          );
        }
      }

      console.log(
        `🔍 Conversation trouvée: ${conversationId} (${processingTime}ms)`
      );
      return conversation;
    } catch (error) {
      this.metrics.errors++;
      console.error(
        `❌ Erreur recherche conversation ${conversationId}:`,
        error
      );
      throw error;
    }
  }

  async findByParticipant(userId, options = {}) {
    const { page = 1, limit = 20, useCache = true } = options;
    const startTime = Date.now();
    const cacheKey = `${this.cachePrefix}participant:${userId}:p${page}:l${limit}`;

    try {
      // Cache Redis
      if (this.redisClient && useCache) {
        try {
          const cached = await this.redisClient.get(cacheKey);
          if (cached) {
            this.metrics.cacheHits++;
            const data = JSON.parse(cached);
            console.log(
              `📦 Conversations depuis cache: ${userId} (${
                Date.now() - startTime
              }ms)`
            );
            return { ...data, fromCache: true };
          } else {
            this.metrics.cacheMisses++;
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache conversations:", cacheError.message);
        }
      }

      const filter = {
        participants: userId,
      };

      const skip = (page - 1) * limit;

      this.metrics.dbQueries += 2;
      const [conversations, totalCount] = await Promise.all([
        Conversation.find(filter)
          .sort({ lastMessageAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Conversation.countDocuments(filter),
      ]);

      const result = {
        conversations: conversations.map((conv) => ({
          ...conv,
          unreadCount: conv.unreadCounts?.[userId] || 0,
          isArchived: conv.archivedBy?.includes(userId) || false,
          isMuted: conv.mutedBy?.includes(userId) || false,
          isPinned: conv.pinnedBy?.includes(userId) || false,
        })),
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

      // Mettre en cache
      if (this.redisClient && useCache) {
        try {
          await this.redisClient.setex(
            cacheKey,
            this.defaultTTL,
            JSON.stringify(result)
          );
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache conversations:", cacheError.message);
        }
      }

      console.log(
        `🔍 Conversations participant: ${userId} (${conversations.length} conversations, ${processingTime}ms)`
      );
      return result;
    } catch (error) {
      this.metrics.errors++;
      console.error(`❌ Erreur conversations participant ${userId}:`, error);
      throw error;
    }
  }

  async updateLastMessage(conversationId, messageData) {
    const startTime = Date.now();

    try {
      const updateData = {
        lastMessage: {
          _id: messageData._id,
          content: messageData.content.substring(0, 100),
          type: messageData.type,
          senderId: messageData.senderId,
          timestamp: new Date(),
        },
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      };

      this.metrics.dbQueries++;
      const conversation = await Conversation.findByIdAndUpdate(
        conversationId,
        { $set: updateData },
        { new: true }
      );

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} non trouvée`);
      }

      const processingTime = Date.now() - startTime;

      // Invalider cache
      if (this.redisClient) {
        try {
          await this._invalidateConversationCaches(conversationId);
        } catch (cacheError) {
          console.warn("⚠️ Erreur invalidation cache:", cacheError.message);
        }
      }

      // Kafka
      if (this.kafkaProducer) {
        try {
          await this._publishConversationEvent(
            "CONVERSATION_UPDATED",
            conversation,
            {
              lastMessage: messageData,
              processingTime,
            }
          );
        } catch (kafkaError) {
          console.warn("⚠️ Erreur publication update:", kafkaError.message);
        }
      }

      console.log(
        `🔄 Last message mis à jour: ${conversationId} (${processingTime}ms)`
      );
      return conversation;
    } catch (error) {
      this.metrics.errors++;
      console.error(`❌ Erreur update last message ${conversationId}:`, error);
      throw error;
    }
  }

  // ===============================
  // MÉTHODES PRIVÉES - CACHE
  // ===============================

  async _cacheConversation(conversation) {
    try {
      const cacheKey = `${this.cachePrefix}${conversation._id}`;
      const cacheData = {
        ...conversation,
        cached: true,
        cachedAt: new Date().toISOString(),
      };

      await this.redisClient.setex(
        cacheKey,
        this.defaultTTL,
        JSON.stringify(cacheData)
      );
      console.log(`💾 Conversation mise en cache: ${conversation._id}`);
      return true;
    } catch (error) {
      console.warn(
        `⚠️ Erreur cache conversation ${conversation._id}:`,
        error.message
      );
      return false;
    }
  }

  async _getCachedConversation(conversationId) {
    try {
      const cacheKey = `${this.cachePrefix}${conversationId}`;
      const cached = await this.redisClient.get(cacheKey);

      if (!cached) {
        return null;
      }

      const data = JSON.parse(cached);
      return data;
    } catch (error) {
      console.warn(`⚠️ Erreur lecture cache ${conversationId}:`, error.message);
      return null;
    }
  }

  async _publishConversationEvent(
    eventType,
    conversation,
    additionalData = {}
  ) {
    try {
      const eventData = {
        eventType,
        conversationId: conversation?._id,
        type: conversation?.type,
        participantCount: conversation?.participants?.length || 0,
        lastMessageAt: conversation?.lastMessageAt,
        timestamp: new Date().toISOString(),
        serverId: process.env.SERVER_ID || "default",
        ...additionalData,
      };

      // Utiliser le même producer que les messages
      await this.kafkaProducer.send({
        topic: "chat.conversations",
        messages: [
          {
            key: conversation._id.toString(),
            value: JSON.stringify(eventData),
          },
        ],
      });

      this.metrics.kafkaEvents++;
      console.log(`📤 Événement Kafka publié: ${eventType}`);
      return true;
    } catch (error) {
      this.metrics.kafkaErrors++;
      console.error(`❌ Erreur publication Kafka ${eventType}:`, error.message);
      return false;
    }
  }

  async _invalidateConversationCaches(conversationId) {
    try {
      const patterns = [
        `${this.cachePrefix}${conversationId}`,
        `${this.cachePrefix}participant:*`,
        `messages:${conversationId}:*`,
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

      console.log(`🗑️ Cache conversation invalidé: ${conversationId}`);
      return true;
    } catch (error) {
      console.warn(`⚠️ Erreur invalidation ${conversationId}:`, error.message);
      return false;
    }
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
        await Conversation.findOne().lean();
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

      healthData.kafka.status = this.kafkaProducer ? "enabled" : "disabled";

      return healthData;
    } catch (error) {
      console.error("❌ Erreur health check conversation repository:", error);
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

      console.log(
        `🗑️ Cache conversations nettoyé: ${keys.length} clés supprimées`
      );
      return { cleared: keys.length, pattern: searchPattern };
    } catch (error) {
      console.error("❌ Erreur nettoyage cache conversations:", error);
      throw error;
    }
  }

  // Méthodes de monitoring
  getMetrics() {
    return {
      ...this.metrics,
      timestamp: new Date().toISOString(),
    };
  }

  resetMetrics() {
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      dbQueries: 0,
      errors: 0,
      kafkaEvents: 0,
      kafkaErrors: 0,
    };
  }

  // ✅ AJOUTER LA MÉTHODE MANQUANTE
  async findByUserId(userId, options = {}) {
    const startTime = Date.now();
    const {
      page = 1,
      limit = 50,
      useCache = true,
      includeArchived = false,
      sortBy = "lastMessageAt",
      sortOrder = -1,
      publishKafkaEvent = true, // ✅ NOUVEAU PARAMÈTRE
    } = options;

    const cacheKey = `${this.cachePrefix}user:${userId}:page:${page}:limit:${limit}:archived:${includeArchived}`;

    try {
      // ✅ AMÉLIORER LA VÉRIFICATION DU CACHE REDIS
      if (useCache && this.redisClient) {
        try {
          // ✅ VÉRIFIER QUE LA MÉTHODE GET EXISTE
          if (typeof this.redisClient.get === "function") {
            const cached = await this.redisClient.get(cacheKey);
            if (cached) {
              this.metrics.cacheHits++;
              const result = JSON.parse(cached);

              console.log(
                `📦 Conversations depuis cache: ${userId} (${
                  Date.now() - startTime
                }ms)`
              );
              return {
                ...result,
                fromCache: true,
                processingTime: Date.now() - startTime,
              };
            } else {
              this.metrics.cacheMisses++;
            }
          } else {
            console.warn("⚠️ Redis client get method not available");
            this.metrics.cacheMisses++;
          }
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur lecture cache conversations:",
            cacheError.message
          );
          this.metrics.cacheMisses++;
        }
      }

      // Construire la requête MongoDB
      const query = {
        participants: userId,
        ...(includeArchived
          ? {}
          : {
              $or: [
                { isArchived: { $ne: true } },
                { isArchived: { $exists: false } },
              ],
            }),
      };

      // Calculer pagination
      const skip = (page - 1) * limit;
      const sortObj = { [sortBy]: sortOrder };

      this.metrics.dbQueries++;

      // Exécuter les requêtes en parallèle
      const [conversations, totalCount] = await Promise.all([
        Conversation.find(query)
          .sort(sortObj)
          .skip(skip)
          .limit(limit)
          .populate("lastMessage", "content createdAt senderId")
          .lean(),
        Conversation.countDocuments(query),
      ]);

      // Enrichir les conversations avec métadonnées utilisateur
      const enrichedConversations = await Promise.all(
        conversations.map(async (conv) => {
          try {
            // Trouver les métadonnées spécifiques à l'utilisateur
            const userMetadata = conv.userMetadata?.find(
              (meta) => meta.userId.toString() === userId
            ) || {
              unreadCount: 0,
              lastReadAt: null,
              isMuted: false,
              isPinned: false,
            };

            // Calculer le nom d'affichage de la conversation
            let displayName = conv.name;
            if (!displayName && conv.type === "PRIVATE") {
              // Pour les conversations privées, afficher le nom de l'autre participant
              const otherParticipant = conv.participants.find(
                (p) => p.toString() !== userId
              );
              displayName = `Conversation avec ${otherParticipant}`;
            }

            return {
              ...conv,
              displayName,
              userMetadata,
              // Ajouter des informations pratiques
              hasUnreadMessages: userMetadata.unreadCount > 0,
              lastActivity: conv.lastMessageAt || conv.updatedAt,
              participantCount: conv.participants.length,
            };
          } catch (enrichError) {
            console.warn(
              `⚠️ Erreur enrichissement conversation ${conv._id}:`,
              enrichError.message
            );
            return conv;
          }
        })
      );

      const result = {
        conversations: enrichedConversations,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNext: page * limit < totalCount,
          hasPrevious: page > 1,
          limit,
        },
        fromCache: false,
        processingTime: Date.now() - startTime,
      };

      // ✅ AMÉLIORER LA MISE EN CACHE AVEC VÉRIFICATION DES MÉTHODES
      if (useCache && this.redisClient) {
        try {
          const cacheData = JSON.stringify({
            conversations: result.conversations,
            pagination: result.pagination,
            cachedAt: new Date().toISOString(),
          });

          // ✅ VÉRIFIER QUE setex EXISTE
          if (typeof this.redisClient.setex === "function") {
            await this.redisClient.setex(cacheKey, this.defaultTTL, cacheData);
          } else if (typeof this.redisClient.set === "function") {
            // ✅ FALLBACK AVEC set + expire
            await this.redisClient.set(cacheKey, cacheData);
            if (typeof this.redisClient.expire === "function") {
              await this.redisClient.expire(cacheKey, this.defaultTTL);
            }
          } else {
            console.warn(
              "⚠️ Méthodes Redis non disponibles pour la mise en cache"
            );
          }
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur mise en cache conversations:",
            cacheError.message
          );
        }
      }

      // ✅ PUBLIER ÉVÉNEMENT KAFKA SEULEMENT SI DEMANDÉ
      if (publishKafkaEvent && this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "CONVERSATIONS_RETRIEVED",
            userId,
            conversationsCount: enrichedConversations.length,
            totalCount,
            page,
            processingTime: result.processingTime,
            fromCache: false,
            source: "MongoConversationRepository",
          });
          this.metrics.kafkaEvents++;
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication Kafka conversations:",
            kafkaError.message
          );
          this.metrics.kafkaErrors++;
        }
      }

      console.log(
        `✅ Conversations trouvées: ${enrichedConversations.length}/${totalCount} pour ${userId} (${result.processingTime}ms)`
      );
      return result;
    } catch (error) {
      this.metrics.errors++;
      const processingTime = Date.now() - startTime;

      console.error(
        `❌ Erreur findByUserId conversations: ${error.message} (${processingTime}ms)`
      );

      // Publier erreur Kafka si disponible et demandé
      if (publishKafkaEvent && this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "CONVERSATIONS_RETRIEVAL_ERROR",
            userId,
            error: error.message,
            processingTime,
            source: "MongoConversationRepository",
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication erreur Kafka:",
            kafkaError.message
          );
        }
      }

      throw error;
    }
  }

  async findByUserIdSimple(userId) {
    try {
      const conversations = await Conversation.find({
        participants: userId,
        $or: [
          { isArchived: { $ne: true } },
          { isArchived: { $exists: false } },
        ],
      })
        .sort({ lastMessageAt: -1 })
        .limit(50)
        .lean();

      return conversations;
    } catch (error) {
      console.error("❌ Erreur findByUserIdSimple:", error);
      return [];
    }
  }

  async getUserConversationsCount(userId) {
    try {
      const count = await Conversation.countDocuments({
        participants: userId,
        $or: [
          { isArchived: { $ne: true } },
          { isArchived: { $exists: false } },
        ],
      });
      return count;
    } catch (error) {
      console.error("❌ Erreur count conversations:", error);
      return 0;
    }
  }

  // ✅ MÉTHODES EXISTANTES (findById, findAll, create, update, delete, etc.)
  async findById(id) {
    try {
      const conversation = await Conversation.findById(id).lean();
      return conversation;
    } catch (error) {
      console.error("❌ Erreur findById conversation:", error);
      throw error;
    }
  }

  async findAll(options = {}) {
    try {
      const { page = 1, limit = 50 } = options;
      const skip = (page - 1) * limit;

      const conversations = await Conversation.find()
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      return conversations;
    } catch (error) {
      console.error("❌ Erreur findAll conversations:", error);
      throw error;
    }
  }

  async create(conversationData) {
    try {
      const conversation = new Conversation(conversationData);
      const saved = await conversation.save();
      return saved.toObject();
    } catch (error) {
      console.error("❌ Erreur create conversation:", error);
      throw error;
    }
  }

  async update(id, updateData) {
    try {
      const updated = await Conversation.findByIdAndUpdate(
        id,
        { ...updateData, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).lean();

      return updated;
    } catch (error) {
      console.error("❌ Erreur update conversation:", error);
      throw error;
    }
  }

  async delete(id) {
    try {
      const deleted = await Conversation.findByIdAndDelete(id);
      return !!deleted;
    } catch (error) {
      console.error("❌ Erreur delete conversation:", error);
      throw error;
    }
  }

  // ✅ MÉTHODES DE STATISTIQUES
  getMetrics() {
    return {
      ...this.metrics,
      cacheHitRate:
        this.metrics.cacheHits + this.metrics.cacheMisses > 0
          ? (
              (this.metrics.cacheHits /
                (this.metrics.cacheHits + this.metrics.cacheMisses)) *
              100
            ).toFixed(2) + "%"
          : "0%",
      timestamp: new Date().toISOString(),
    };
  }

  resetMetrics() {
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      dbQueries: 0,
      errors: 0,
      kafkaEvents: 0,
      kafkaErrors: 0,
    };
  }
}

module.exports = MongoConversationRepository;
