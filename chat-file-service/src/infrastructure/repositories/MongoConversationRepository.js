const Conversation = require("../mongodb/models/ConversationModel");

class MongoConversationRepository {
  constructor(redisClient = null, kafkaProducer = null) {
    this.redisClient = redisClient;
    this.kafkaProducer = kafkaProducer;
    this.cachePrefix = "conv:";
    this.defaultTTL = 1800; // 30 minutes
  }

  async save(conversation) {
    const startTime = Date.now();

    try {
      conversation.validate();

      const savedConversation = await Conversation.findByIdAndUpdate(
        conversation._id,
        conversation.toObject(),
        {
          new: true,
          upsert: true,
          runValidators: true,
        }
      );

      const processingTime = Date.now() - startTime;

      // 🚀 MISE EN CACHE ET INVALIDATION
      if (this.redisClient) {
        try {
          await this._cacheConversation(savedConversation);
          await this._invalidateUserConversationLists(
            savedConversation.participants
          );
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache conversation:", cacheError.message);
        }
      }

      // 🚀 PUBLICATION KAFKA
      if (this.kafkaProducer) {
        try {
          await this._publishConversationEvent(
            "CONVERSATION_SAVED",
            savedConversation,
            {
              processingTime,
              isNew: !conversation._id,
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
      console.error("❌ Erreur sauvegarde conversation:", error);
      throw error;
    }
  }

  async findById(conversationId, useCache = true) {
    const startTime = Date.now();

    try {
      // 🚀 CACHE REDIS
      if (this.redisClient && useCache) {
        try {
          const cached = await this._getCachedConversation(conversationId);
          if (cached) {
            console.log(
              `📦 Conversation depuis cache: ${conversationId} (${
                Date.now() - startTime
              }ms)`
            );
            return cached;
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur lecture cache:", cacheError.message);
        }
      }

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
          console.warn("⚠️ Erreur mise en cache:", cacheError.message);
        }
      }

      console.log(
        `🔍 Conversation trouvée: ${conversationId} (${processingTime}ms)`
      );
      return conversation;
    } catch (error) {
      console.error(
        `❌ Erreur recherche conversation ${conversationId}:`,
        error
      );
      throw error;
    }
  }

  async findByParticipants(participants, useCache = true) {
    const startTime = Date.now();
    const sortedParticipants = [...participants].sort();
    const cacheKey = `${this.cachePrefix}participants:${sortedParticipants.join(
      ":"
    )}`;

    try {
      // 🚀 CACHE REDIS
      if (this.redisClient && useCache) {
        try {
          const cached = await this.redisClient.get(cacheKey);
          if (cached) {
            const conversationId = cached;
            console.log(
              `📦 Conversation par participants depuis cache (${
                Date.now() - startTime
              }ms)`
            );
            return await this.findById(conversationId, true);
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache participants:", cacheError.message);
        }
      }

      const conversation = await Conversation.findOne({
        participants: { $all: participants, $size: participants.length },
      }).lean();

      const processingTime = Date.now() - startTime;

      // Mettre en cache
      if (this.redisClient && useCache && conversation) {
        try {
          await this.redisClient.setex(
            cacheKey,
            this.defaultTTL,
            conversation._id.toString()
          );
          await this._cacheConversation(conversation);
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache participants:", cacheError.message);
        }
      }

      console.log(
        `🔍 Conversation par participants: ${participants.join(
          ","
        )} (${processingTime}ms)`
      );
      return conversation;
    } catch (error) {
      console.error("❌ Erreur recherche par participants:", error);
      throw error;
    }
  }

  async findByUserId(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      useCache = true,
      includeArchived = false,
    } = options;

    const startTime = Date.now();
    const cacheKey = `${this.cachePrefix}user:${userId}:p${page}:l${limit}:a${includeArchived}`;

    try {
      // 🚀 CACHE REDIS
      if (this.redisClient && useCache) {
        try {
          const cached = await this.redisClient.get(cacheKey);
          if (cached) {
            const data = JSON.parse(cached);
            console.log(
              `📦 Conversations utilisateur depuis cache: ${userId} (${
                Date.now() - startTime
              }ms)`
            );
            return {
              ...data,
              fromCache: true,
            };
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache utilisateur:", cacheError.message);
        }
      }

      // Construire le filtre
      const filter = { participants: userId };

      if (!includeArchived) {
        filter.archivedBy = { $ne: userId };
      }

      const skip = (page - 1) * limit;

      const [conversations, totalCount] = await Promise.all([
        Conversation.find(filter)
          .sort({ lastMessageAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Conversation.countDocuments(filter),
      ]);

      // Enrichir avec les métadonnées utilisateur
      const enrichedConversations = conversations.map((conv) => ({
        ...conv,
        userMetadata: {
          unreadCount: conv.unreadCounts?.get?.(userId) || 0,
          isArchived: conv.archivedBy?.includes(userId) || false,
          isMuted: conv.mutedBy?.includes(userId) || false,
          isPinned: conv.pinnedBy?.includes(userId) || false,
        },
      }));

      const result = {
        conversations: enrichedConversations,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNext: page * limit < totalCount,
          hasPrevious: page > 1,
        },
        totalUnreadMessages: enrichedConversations.reduce(
          (sum, conv) => sum + (conv.userMetadata.unreadCount || 0),
          0
        ),
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
          console.warn(
            "⚠️ Erreur cache conversations utilisateur:",
            cacheError.message
          );
        }
      }

      console.log(
        `🔍 Conversations utilisateur: ${userId} (${conversations.length} conv, ${processingTime}ms)`
      );
      return result;
    } catch (error) {
      console.error(`❌ Erreur conversations utilisateur ${userId}:`, error);
      throw error;
    }
  }

  async updateLastMessage(conversationId, messageId, content, type, senderId) {
    const startTime = Date.now();

    try {
      const updateData = {
        lastMessage: {
          _id: messageId,
          content: content.substring(0, 100),
          type,
          senderId,
          timestamp: new Date(),
        },
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      };

      const conversation = await Conversation.findByIdAndUpdate(
        conversationId,
        { $set: updateData },
        { new: true }
      );

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} non trouvée`);
      }

      const processingTime = Date.now() - startTime;

      // 🗑️ INVALIDATION CACHE
      if (this.redisClient) {
        try {
          await this._invalidateConversationCache(conversationId);
          await this._invalidateUserConversationLists(
            conversation.participants
          );
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur invalidation last message:",
            cacheError.message
          );
        }
      }

      // 🚀 KAFKA
      if (this.kafkaProducer) {
        try {
          await this._publishConversationEvent(
            "CONVERSATION_LAST_MESSAGE_UPDATED",
            conversation,
            {
              messageId,
              content: content.substring(0, 50),
              type,
              senderId,
              processingTime,
            }
          );
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication last message:",
            kafkaError.message
          );
        }
      }

      console.log(
        `📝 Dernier message mis à jour: ${conversationId} (${processingTime}ms)`
      );
      return conversation;
    } catch (error) {
      console.error(
        `❌ Erreur mise à jour dernier message ${conversationId}:`,
        error
      );
      throw error;
    }
  }

  async markAsRead(conversationId, userId) {
    const startTime = Date.now();

    try {
      const conversation = await Conversation.findByIdAndUpdate(
        conversationId,
        {
          $set: {
            [`unreadCounts.${userId}`]: 0,
            updatedAt: new Date(),
          },
        },
        { new: true }
      );

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} non trouvée`);
      }

      const processingTime = Date.now() - startTime;

      // 🗑️ INVALIDATION CACHE
      if (this.redisClient) {
        try {
          await this._invalidateConversationCache(conversationId);
          await this._invalidateUserConversationLists([userId]);
        } catch (cacheError) {
          console.warn("⚠️ Erreur invalidation mark read:", cacheError.message);
        }
      }

      // 🚀 KAFKA
      if (this.kafkaProducer) {
        try {
          await this._publishConversationEvent(
            "CONVERSATION_MARKED_READ",
            conversation,
            {
              userId,
              processingTime,
            }
          );
        } catch (kafkaError) {
          console.warn("⚠️ Erreur publication mark read:", kafkaError.message);
        }
      }

      console.log(
        `📖 Conversation marquée comme lue: ${conversationId} par ${userId} (${processingTime}ms)`
      );
      return conversation;
    } catch (error) {
      console.error(`❌ Erreur mark as read ${conversationId}:`, error);
      throw error;
    }
  }

  async addParticipant(conversationId, userId, addedBy = null) {
    const startTime = Date.now();

    try {
      const conversation = await Conversation.findByIdAndUpdate(
        conversationId,
        {
          $addToSet: { participants: userId },
          $set: {
            [`unreadCounts.${userId}`]: 0,
            updatedAt: new Date(),
          },
          $push: {
            "metadata.auditLog": {
              action: "PARTICIPANT_ADDED",
              userId,
              details: { addedBy },
              timestamp: new Date(),
            },
          },
        },
        { new: true }
      );

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} non trouvée`);
      }

      const processingTime = Date.now() - startTime;

      // 🗑️ INVALIDATION
      if (this.redisClient) {
        try {
          await this._invalidateConversationCache(conversationId);
          await this._invalidateUserConversationLists([
            userId,
            ...(addedBy ? [addedBy] : []),
          ]);
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur invalidation add participant:",
            cacheError.message
          );
        }
      }

      // 🚀 KAFKA
      if (this.kafkaProducer) {
        try {
          await this._publishConversationEvent(
            "PARTICIPANT_ADDED",
            conversation,
            {
              userId,
              addedBy,
              processingTime,
            }
          );
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication add participant:",
            kafkaError.message
          );
        }
      }

      console.log(
        `👥 Participant ajouté: ${userId} à ${conversationId} (${processingTime}ms)`
      );
      return conversation;
    } catch (error) {
      console.error(`❌ Erreur ajout participant ${conversationId}:`, error);
      throw error;
    }
  }

  async removeParticipant(conversationId, userId, removedBy = null) {
    const startTime = Date.now();

    try {
      const conversation = await Conversation.findByIdAndUpdate(
        conversationId,
        {
          $pull: {
            participants: userId,
            archivedBy: userId,
            mutedBy: userId,
            pinnedBy: userId,
          },
          $unset: { [`unreadCounts.${userId}`]: 1 },
          $set: { updatedAt: new Date() },
          $push: {
            "metadata.auditLog": {
              action: "PARTICIPANT_REMOVED",
              userId,
              details: { removedBy },
              timestamp: new Date(),
            },
          },
        },
        { new: true }
      );

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} non trouvée`);
      }

      const processingTime = Date.now() - startTime;

      // 🗑️ INVALIDATION
      if (this.redisClient) {
        try {
          await this._invalidateConversationCache(conversationId);
          await this._invalidateUserConversationLists([
            userId,
            ...(removedBy ? [removedBy] : []),
          ]);
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur invalidation remove participant:",
            cacheError.message
          );
        }
      }

      // 🚀 KAFKA
      if (this.kafkaProducer) {
        try {
          await this._publishConversationEvent(
            "PARTICIPANT_REMOVED",
            conversation,
            {
              userId,
              removedBy,
              processingTime,
            }
          );
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication remove participant:",
            kafkaError.message
          );
        }
      }

      console.log(
        `👥 Participant retiré: ${userId} de ${conversationId} (${processingTime}ms)`
      );
      return conversation;
    } catch (error) {
      console.error(`❌ Erreur retrait participant ${conversationId}:`, error);
      throw error;
    }
  }

  // ===============================
  // MÉTHODES PRIVÉES - CACHE
  // ===============================

  async _cacheConversation(conversation) {
    if (!this.redisClient) return;

    const cacheKey = `${this.cachePrefix}${conversation._id}`;
    await this.redisClient.setex(
      cacheKey,
      this.defaultTTL,
      JSON.stringify(conversation)
    );
  }

  async _getCachedConversation(conversationId) {
    if (!this.redisClient) return null;

    const cacheKey = `${this.cachePrefix}${conversationId}`;
    const cached = await this.redisClient.get(cacheKey);

    return cached ? JSON.parse(cached) : null;
  }

  async _invalidateConversationCache(conversationId) {
    if (!this.redisClient) return;

    const cacheKey = `${this.cachePrefix}${conversationId}`;
    await this.redisClient.del(cacheKey);
  }

  async _invalidateUserConversationLists(userIds) {
    if (!this.redisClient) return;

    for (const userId of userIds) {
      try {
        const pattern = `${this.cachePrefix}user:${userId}:*`;
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
      } catch (error) {
        console.warn(
          `⚠️ Erreur invalidation utilisateur ${userId}:`,
          error.message
        );
      }
    }
  }

  // ===============================
  // MÉTHODES PRIVÉES - KAFKA
  // ===============================

  async _publishConversationEvent(
    eventType,
    conversation,
    additionalData = {}
  ) {
    if (!this.kafkaProducer) return;

    const eventData = {
      eventType,
      conversationId: conversation._id,
      participants: conversation.participants,
      type: conversation.type,
      name: conversation.name,
      lastMessage: conversation.lastMessage,
      timestamp: new Date().toISOString(),
      service: "conversation-repository",
      ...additionalData,
    };

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
}

module.exports = MongoConversationRepository;
