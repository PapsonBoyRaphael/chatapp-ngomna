const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: String,
        required: true,
      },
    ],
    type: {
      type: String,
      enum: ["PRIVATE", "GROUP", "CHANNEL"],
      default: "PRIVATE",
      index: true,
    },
    name: {
      type: String,
      maxlength: 100,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 500,
      trim: true,
    },
    avatar: {
      type: String,
      default: null,
    },

    // Message le plus récent
    lastMessage: {
      _id: mongoose.Schema.Types.ObjectId,
      content: String,
      type: String,
      senderId: String,
      timestamp: Date,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    // Compteurs de messages non lus par utilisateur
    unreadCounts: {
      type: Map,
      of: Number,
      default: new Map(),
    },

    // Paramètres de conversation
    settings: {
      notifications: {
        enabled: {
          type: Boolean,
          default: true,
        },
        sound: {
          type: Boolean,
          default: true,
        },
        vibration: {
          type: Boolean,
          default: true,
        },
      },
      privacy: {
        readReceipts: {
          type: Boolean,
          default: true,
        },
        lastSeen: {
          type: Boolean,
          default: true,
        },
      },
      group: {
        allowMembersToAddOthers: {
          type: Boolean,
          default: true,
        },
        allowMembersToEditInfo: {
          type: Boolean,
          default: false,
        },
        admins: [String],
      },
      retention: {
        autoDeleteAfterDays: {
          type: Number,
          default: null,
        },
        backupEnabled: {
          type: Boolean,
          default: true,
        },
      },
    },

    // Métadonnées enrichies
    metadata: {
      // Métadonnées Kafka
      kafkaMetadata: {
        topic: {
          type: String,
          default: "chat.conversations",
        },
        lastEventOffset: Number,
        lastEventTimestamp: Date,
        events: [
          {
            type: String,
            timestamp: Date,
            success: Boolean,
            error: String,
          },
        ],
      },

      // Métadonnées Redis
      redisMetadata: {
        cacheKey: String,
        ttl: {
          type: Number,
          default: 1800, // 30 minutes
        },
        lastCached: Date,
        cacheHits: {
          type: Number,
          default: 0,
        },
      },

      // Statistiques
      statistics: {
        totalMessages: {
          type: Number,
          default: 0,
        },
        totalFiles: {
          type: Number,
          default: 0,
        },
        totalImages: {
          type: Number,
          default: 0,
        },
        totalVideos: {
          type: Number,
          default: 0,
        },
        lastActivity: Date,
        mostActiveUser: String,
        averageResponseTime: Number,
        peakConcurrentUsers: {
          type: Number,
          default: 0,
        },
      },

      // Audit trail
      auditLog: [
        {
          action: {
            type: String,
            enum: [
              "CREATED",
              "PARTICIPANT_ADDED",
              "PARTICIPANT_REMOVED",
              "SETTINGS_CHANGED",
              "INFO_UPDATED",
            ],
          },
          userId: String,
          timestamp: {
            type: Date,
            default: Date.now,
          },
          details: mongoose.Schema.Types.Mixed,
          ip: String,
          userAgent: String,
        },
      ],
    },

    // Gestion des participants
    archivedBy: [String], // Utilisateurs ayant archivé la conversation
    mutedBy: [String], // Utilisateurs ayant mis en sourdine
    pinnedBy: [String], // Utilisateurs ayant épinglé

    // Dates importantes
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "conversations",
    versionKey: false,
  }
);

// ===============================
// INDEXATION
// ===============================

conversationSchema.index({ participants: 1 }); // Recherche par participant
conversationSchema.index({ type: 1, lastMessageAt: -1 }); // Tri par activité
conversationSchema.index({ "settings.group.admins": 1 }); // Admins de groupe
conversationSchema.index({ lastMessageAt: -1 }); // Conversations récentes
conversationSchema.index({ createdAt: -1 }); // Nouvelles conversations

// Index composé pour recherche avancée
conversationSchema.index({
  participants: 1,
  type: 1,
  lastMessageAt: -1,
});

// Index de recherche textuelle
conversationSchema.index({
  name: "text",
  description: "text",
});

// ===============================
// MÉTHODES D'INSTANCE
// ===============================

// Générer clé de cache
conversationSchema.methods.generateCacheKey = function () {
  return `conversation:${this._id}`;
};

// Ajouter un participant
conversationSchema.methods.addParticipant = async function (
  userId,
  addedBy = null
) {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
    this.unreadCounts.set(userId, 0);

    // Ajouter à l'audit log
    this.metadata.auditLog.push({
      action: "PARTICIPANT_ADDED",
      userId,
      details: { addedBy },
      timestamp: new Date(),
    });

    await this.publishKafkaEvent("PARTICIPANT_ADDED", { userId, addedBy });
  }

  return this.save();
};

// Supprimer un participant
conversationSchema.methods.removeParticipant = async function (
  userId,
  removedBy = null
) {
  this.participants = this.participants.filter((id) => id !== userId);
  this.unreadCounts.delete(userId);
  this.archivedBy = this.archivedBy.filter((id) => id !== userId);
  this.mutedBy = this.mutedBy.filter((id) => id !== userId);
  this.pinnedBy = this.pinnedBy.filter((id) => id !== userId);

  // Ajouter à l'audit log
  this.metadata.auditLog.push({
    action: "PARTICIPANT_REMOVED",
    userId,
    details: { removedBy },
    timestamp: new Date(),
  });

  await this.publishKafkaEvent("PARTICIPANT_REMOVED", { userId, removedBy });

  return this.save();
};

// Mettre à jour le dernier message
conversationSchema.methods.updateLastMessage = async function (
  messageId,
  content,
  type,
  senderId
) {
  this.lastMessage = {
    _id: messageId,
    content: content.substring(0, 100), // Truncate pour performance
    type,
    senderId,
    timestamp: new Date(),
  };
  this.lastMessageAt = new Date();

  // Incrémenter les compteurs non lus (sauf pour l'expéditeur)
  this.participants.forEach((participantId) => {
    if (participantId !== senderId) {
      const currentCount = this.unreadCounts.get(participantId) || 0;
      this.unreadCounts.set(participantId, currentCount + 1);
    }
  });

  // Mettre à jour les statistiques
  this.metadata.statistics.totalMessages++;
  this.metadata.statistics.lastActivity = new Date();

  if (["IMAGE", "VIDEO", "AUDIO", "FILE"].includes(type)) {
    this.metadata.statistics.totalFiles++;

    if (type === "IMAGE") this.metadata.statistics.totalImages++;
    if (type === "VIDEO") this.metadata.statistics.totalVideos++;
  }

  await this.publishKafkaEvent("LAST_MESSAGE_UPDATED", {
    messageId,
    content: content.substring(0, 50),
    type,
    senderId,
  });

  return this.save();
};

// Marquer comme lu pour un utilisateur
conversationSchema.methods.markAsRead = async function (userId) {
  const previousCount = this.unreadCounts.get(userId) || 0;
  this.unreadCounts.set(userId, 0);

  if (previousCount > 0) {
    await this.publishKafkaEvent("CONVERSATION_READ", {
      userId,
      previousUnreadCount: previousCount,
    });
  }

  return this.save();
};

// Publier événement Kafka
conversationSchema.methods.publishKafkaEvent = async function (
  eventType,
  additionalData = {}
) {
  try {
    const kafkaProducers = require("../../../index").kafkaProducers;

    if (!kafkaProducers?.messageProducer) {
      console.warn("⚠️ Kafka producer non disponible pour", eventType);
      return false;
    }

    const eventData = {
      eventType,
      conversationId: this._id,
      participants: this.participants,
      type: this.type,
      name: this.name,
      lastMessage: this.lastMessage,
      timestamp: new Date().toISOString(),
      ...additionalData,
    };

    await kafkaProducers.messageProducer.publishMessage(eventData);

    // Enregistrer l'événement
    this.metadata.kafkaMetadata.events.push({
      type: eventType,
      timestamp: new Date(),
      success: true,
    });

    console.log(
      `📤 Événement Kafka publié: ${eventType} pour conversation ${this._id}`
    );
    return true;
  } catch (error) {
    console.error(`❌ Erreur publication Kafka ${eventType}:`, error.message);

    this.metadata.kafkaMetadata.events.push({
      type: eventType,
      timestamp: new Date(),
      success: false,
      error: error.message,
    });

    return false;
  }
};

// Invalider cache Redis
conversationSchema.methods.invalidateCache = async function () {
  try {
    const redisClient = require("../../../index").redisClient;

    if (!redisClient) return false;

    const cachePatterns = [
      this.generateCacheKey(),
      ...this.participants.map((userId) => `conversations:${userId}`),
      `messages:${this._id}:*`,
    ];

    for (const pattern of cachePatterns) {
      if (pattern.includes("*")) {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
          await redisClient.del(keys);
        }
      } else {
        await redisClient.del(pattern);
      }
    }

    console.log(`🗑️ Cache invalidé pour conversation ${this._id}`);
    return true;
  } catch (error) {
    console.warn("⚠️ Erreur invalidation cache:", error.message);
    return false;
  }
};

// ===============================
// MÉTHODES STATIQUES
// ===============================

// Recherche avec cache
conversationSchema.statics.findWithCache = async function (
  query,
  options = {}
) {
  const redisClient = require("../../../index").redisClient;
  const cacheKey = `conv_query:${JSON.stringify(query)}`;

  if (redisClient) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn("⚠️ Erreur lecture cache conversation:", error.message);
    }
  }

  const results = await this.find(query, null, options).lean();

  if (redisClient && results.length > 0) {
    try {
      await redisClient.setex(cacheKey, 900, JSON.stringify(results)); // 15 minutes
    } catch (error) {
      console.warn("⚠️ Erreur mise en cache conversation:", error.message);
    }
  }

  return results;
};

// Créer une conversation privée
conversationSchema.statics.createPrivateConversation = async function (
  userId1,
  userId2
) {
  const conversation = new this({
    participants: [userId1, userId2],
    type: "PRIVATE",
    unreadCounts: new Map([
      [userId1, 0],
      [userId2, 0],
    ]),
  });

  return conversation.save();
};

// ===============================
// MIDDLEWARE (HOOKS)
// ===============================

// Avant sauvegarde
conversationSchema.pre("save", function (next) {
  if (this.isNew) {
    this.metadata.redisMetadata.cacheKey = this.generateCacheKey();
  }

  this.updatedAt = new Date();
  next();
});

// Après sauvegarde
conversationSchema.post("save", async function (doc, next) {
  try {
    if (doc.isNew) {
      await doc.publishKafkaEvent("CONVERSATION_CREATED");
    } else {
      await doc.publishKafkaEvent("CONVERSATION_UPDATED");
    }

    await doc.invalidateCache();
  } catch (error) {
    console.warn("⚠️ Erreur post-save conversation:", error.message);
  }

  next();
});

// ===============================
// MÉTHODES VIRTUELLES
// ===============================

// Nombre total de messages non lus
conversationSchema.virtual("totalUnreadCount").get(function () {
  let total = 0;
  for (const count of this.unreadCounts.values()) {
    total += count;
  }
  return total;
});

// Indicateur d'activité récente
conversationSchema.virtual("isActive").get(function () {
  if (!this.lastMessageAt) return false;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.lastMessageAt > oneDayAgo;
});

// Configuration JSON
conversationSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    delete ret.__v;
    // Convertir Map en objet pour JSON
    if (ret.unreadCounts instanceof Map) {
      ret.unreadCounts = Object.fromEntries(ret.unreadCounts);
    }
    return ret;
  },
});

const Conversation = mongoose.model("Conversation", conversationSchema);

module.exports = Conversation;
