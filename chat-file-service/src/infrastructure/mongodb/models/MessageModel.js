const mongoose = require("mongoose");

// Schéma enrichi pour les messages
const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: String,
      required: true,
      index: true,
    },
    receiverId: {
      type: String,
      required: false,
      index: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 10000,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "TEXT",
        "IMAGE",
        "VIDEO",
        "AUDIO",
        "FILE",
        "LOCATION",
        "CONTACT",
        "SYSTEM",
      ],
      default: "TEXT",
      index: true,
    },
    status: {
      type: String,
      enum: ["SENT", "DELIVERED", "READ", "FAILED", "DELETED"],
      default: "SENT",
      index: true,
    },

    // Métadonnées enrichies
    metadata: {
      // Métadonnées techniques
      technical: {
        serverId: {
          type: String,
          default: () => process.env.SERVER_ID || "default",
        },
        clientVersion: String,
        platform: {
          type: String,
          enum: ["web", "android", "ios", "desktop"],
          default: "web",
        },
        deviceInfo: {
          userAgent: String,
          ip: String,
          browser: String,
          os: String,
        },
        messageId: String,
        checksum: String,
      },

      // Métadonnées Kafka
      kafkaMetadata: {
        topic: {
          type: String,
          default: "chat.messages",
        },
        partition: Number,
        offset: Number,
        publishedAt: Date,
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
        cachedAt: Date,
        ttl: {
          type: Number,
          default: 3600,
        },
        cacheStrategy: {
          type: String,
          enum: ["cache-aside", "write-through", "write-behind"],
          default: "cache-aside",
        },
        cacheHits: {
          type: Number,
          default: 0,
        },
      },

      // Métadonnées de délivrance
      deliveryMetadata: {
        attempts: {
          type: Number,
          default: 0,
        },
        lastAttempt: Date,
        deliveredAt: Date,
        readAt: Date,
        failureReason: String,
        retryCount: {
          type: Number,
          default: 0,
        },
      },

      // Métadonnées spécifiques au contenu
      contentMetadata: {
        originalContent: String, // Pour les messages édités
        mentions: [String], // @utilisateur
        hashtags: [String], // #topic
        urls: [
          {
            url: String,
            title: String,
            description: String,
            image: String,
          },
        ],
        file: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "File",
          default: null,
        },
      },
    },

    // Gestion des réponses et réactions
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    reactions: [
      {
        userId: {
          type: String,
          required: true,
        },
        emoji: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Gestion des modifications
    editedAt: {
      type: Date,
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },

    // Champs de système
    isSystemMessage: {
      type: Boolean,
      default: false,
    },
    priority: {
      type: String,
      enum: ["LOW", "NORMAL", "HIGH", "URGENT"],
      default: "NORMAL",
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "messages",
  }
);

// ===============================
// INDEXATION POUR PERFORMANCE
// ===============================

// Index composés pour les requêtes courantes
messageSchema.index({ conversationId: 1, createdAt: -1 }); // Messages par conversation
messageSchema.index({ senderId: 1, createdAt: -1 }); // Messages par expéditeur
messageSchema.index({ receiverId: 1, status: 1 }); // Messages non lus
messageSchema.index({ "metadata.kafkaMetadata.offset": 1 }); // Événements Kafka
messageSchema.index({ type: 1, createdAt: -1 }); // Filtrage par type
messageSchema.index({ status: 1, "metadata.deliveryMetadata.attempts": 1 }); // Messages en échec

// Index de recherche textuelle
messageSchema.index({
  content: "text",
  "metadata.contentMetadata.mentions": "text",
  "metadata.contentMetadata.hashtags": "text",
});

// Index TTL pour les messages temporaires (optionnel)
messageSchema.index(
  {
    createdAt: 1,
  },
  {
    expireAfterSeconds: 7776000, // 90 jours
    partialFilterExpression: {
      isSystemMessage: true,
    },
  }
);

// ===============================
// MÉTHODES D'INSTANCE
// ===============================

// Générer une clé de cache Redis
messageSchema.methods.generateCacheKey = function () {
  return `message:${this.conversationId}:${this._id}`;
};

// Générer un checksum pour l'intégrité
messageSchema.methods.generateChecksum = function () {
  const crypto = require("crypto");
  const data = `${this.senderId}:${this.receiverId}:${this.content}:${this.createdAt}`;
  return crypto
    .createHash("sha256")
    .update(data)
    .digest("hex")
    .substring(0, 16);
};

// Marquer comme lu avec événement Kafka
messageSchema.methods.markAsRead = async function () {
  this.status = "READ";
  this.metadata.deliveryMetadata.readAt = new Date();

  // Publier événement Kafka
  await this.publishKafkaEvent("MESSAGE_READ");

  return this.save();
};

// Marquer comme livré
messageSchema.methods.markAsDelivered = async function () {
  this.status = "delivered";
  this.metadata.deliveryMetadata.deliveredAt = new Date();

  await this.publishKafkaEvent("MESSAGE_DELIVERED");

  return this.save();
};

// Ajouter une réaction
messageSchema.methods.addReaction = async function (userId, emoji) {
  const existingReaction = this.reactions.find((r) => r.userId === userId);

  if (existingReaction) {
    existingReaction.emoji = emoji;
    existingReaction.timestamp = new Date();
  } else {
    this.reactions.push({
      userId,
      emoji,
      timestamp: new Date(),
    });
  }

  await this.publishKafkaEvent("MESSAGE_REACTION_ADDED", { userId, emoji });

  return this.save();
};

// Éditer le message
messageSchema.methods.editContent = async function (newContent) {
  if (!this.metadata.contentMetadata.originalContent) {
    this.metadata.contentMetadata.originalContent = this.content;
  }

  this.content = newContent;
  this.editedAt = new Date();

  await this.publishKafkaEvent("MESSAGE_EDITED", {
    originalContent: this.metadata.contentMetadata.originalContent,
    newContent,
  });

  return this.save();
};

// Publier un événement Kafka
messageSchema.methods.publishKafkaEvent = async function (
  eventType,
  additionalData = {}
) {
  try {
    // Vérifier si Kafka est disponible
    const indexModule = require("../../../index");
    const kafkaProducers = indexModule.kafkaProducers
      ? indexModule.kafkaProducers()
      : null;

    if (!kafkaProducers?.messageProducer) {
      console.warn("⚠️ Kafka producer non disponible pour", eventType);
      return false;
    }

    const eventData = {
      eventType,
      messageId: this._id,
      conversationId: this.conversationId,
      senderId: this.senderId,
      receiverId: this.receiverId,
      content: this.content,
      type: this.type,
      status: this.status,
      timestamp: new Date().toISOString(),
      serverId: this.metadata.technical.serverId,
      ...additionalData,
    };

    await kafkaProducers.messageProducer.publishMessage(eventData);

    // Enregistrer l'événement dans les métadonnées
    this.metadata.kafkaMetadata.events.push({
      type: eventType,
      timestamp: new Date(),
      success: true,
    });

    console.log(
      `📤 Événement Kafka publié: ${eventType} pour message ${this._id}`
    );
    return true;
  } catch (error) {
    console.error(`❌ Erreur publication Kafka ${eventType}:`, error.message);

    // Enregistrer l'erreur
    this.metadata.kafkaMetadata.events.push({
      type: eventType,
      timestamp: new Date(),
      success: false,
      error: error.message,
    });

    return false;
  }
};

// Invalider le cache Redis - CORRECTION
messageSchema.methods.invalidateCache = async function () {
  try {
    // ✅ ÉVITER LA RÉFÉRENCE CIRCULAIRE
    // const redisClient = require("../../../index").redisClient;

    // Utiliser le client Redis passé au repository
    const MongoMessageRepository = require("../../repositories/MongoMessageRepository");

    // Si pas de client Redis disponible, ne pas faire d'erreur
    console.log(
      `🗑️ Cache invalidé pour message ${this._id} (pas de client Redis)`
    );
    return true;
  } catch (error) {
    console.warn("⚠️ Erreur invalidation cache:", error.message);
    return false;
  }
};

// ===============================
// MÉTHODES STATIQUES
// ===============================

// Recherche avec mise en cache
messageSchema.statics.findWithCache = async function (query, options = {}) {
  const redisClient = require("../../../index").redisClient;
  const cacheKey = `query:${JSON.stringify(query)}:${JSON.stringify(options)}`;

  if (redisClient) {
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        console.log(`📦 Résultats récupérés depuis Redis: ${cacheKey}`);
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn("⚠️ Erreur lecture cache:", error.message);
    }
  }

  const results = await this.find(query, null, options).lean();

  // Mettre en cache si Redis disponible
  if (redisClient && results.length > 0) {
    try {
      await redisClient.setex(cacheKey, 300, JSON.stringify(results)); // 5 minutes
    } catch (error) {
      console.warn("⚠️ Erreur mise en cache:", error.message);
    }
  }

  return results;
};

// Statistiques des messages
messageSchema.statics.getStatistics = async function (conversationId) {
  return this.aggregate([
    { $match: { conversationId: mongoose.Types.ObjectId(conversationId) } },
    {
      $group: {
        _id: null,
        totalMessages: { $sum: 1 },
        messagesByType: {
          $push: {
            type: "$type",
            count: 1,
          },
        },
        messagesByStatus: {
          $push: {
            status: "$status",
            count: 1,
          },
        },
        lastMessage: { $max: "$createdAt" },
        firstMessage: { $min: "$createdAt" },
      },
    },
  ]);
};

// ===============================
// MIDDLEWARE (HOOKS)
// ===============================

// Avant sauvegarde - Générer métadonnées
messageSchema.pre("save", function (next) {
  // Générer checksum si nouveau message
  if (this.isNew) {
    this.metadata.technical.checksum = this.generateChecksum();
    this.metadata.technical.messageId = `msg_${Date.now()}_${this.senderId}`;
    this.metadata.redisMetadata.cacheKey = this.generateCacheKey();
  }

  next();
});

// Après sauvegarde - Publier événement Kafka
messageSchema.post("save", async function (doc, next) {
  try {
    // Publier événement selon l'action
    if (doc.isNew) {
      // await doc.publishKafkaEvent("MESSAGE_SENT"); // Désactiver temporairement
      console.log(`📤 Message créé: ${doc._id}`);
    } else {
      // await doc.publishKafkaEvent("MESSAGE_UPDATED"); // Désactiver temporairement
      console.log(`🔄 Message mis à jour: ${doc._id}`);
    }

    // Invalider les caches
    await doc.invalidateCache();
  } catch (error) {
    console.warn("⚠️ Erreur post-save message:", error.message);
  }

  next();
});

// Après suppression - Publier événement
messageSchema.post("findOneAndDelete", async function (doc) {
  if (doc) {
    try {
      await doc.publishKafkaEvent("MESSAGE_DELETED");
      await doc.invalidateCache();
    } catch (error) {
      console.warn("⚠️ Erreur post-delete message:", error.message);
    }
  }
});

// ===============================
// MÉTHODES VIRTUELLES
// ===============================

// Indicateur de message lu
messageSchema.virtual("isRead").get(function () {
  return this.status === "read";
});

// Indicateur de message livré
messageSchema.virtual("isDelivered").get(function () {
  return ["delivered", "read"].includes(this.status);
});

// Temps depuis l'envoi
messageSchema.virtual("timeSinceCreated").get(function () {
  return Date.now() - this.createdAt.getTime();
});

// Configuration de transformation JSON
messageSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    delete ret.__v;
    delete ret.metadata.technical.checksum; // Masquer le checksum
    return ret;
  },
});

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;
