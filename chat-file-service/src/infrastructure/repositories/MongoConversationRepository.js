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

  async save(conversationData) {
    const startTime = Date.now();

    try {
      console.log(`💾 Début sauvegarde conversation:`, {
        id: conversationData._id,
        name: conversationData.name,
        type: conversationData.type,
        participants: conversationData.participants,
        hasRequiredFields: !!(
          conversationData._id &&
          conversationData.name &&
          conversationData.participants
        ),
        hasMetadata: !!conversationData.metadata,
        hasAuditLog: !!conversationData.metadata?.auditLog,
      });

      // ✅ NETTOYAGE ET VALIDATION DES DONNÉES AVANT CRÉATION DU MODÈLE
      const cleanedData = this._sanitizeConversationData(conversationData);

      // ✅ VÉRIFIER SI LA CONVERSATION EXISTE DÉJÀ
      let existingConversation;
      try {
        existingConversation = await Conversation.findById(cleanedData._id);
        if (existingConversation) {
          console.log(`✅ Conversation existante trouvée: ${cleanedData._id}`);
          return existingConversation;
        }
      } catch (findError) {
        console.log(
          `🔍 Conversation ${cleanedData._id} non trouvée, création nécessaire`
        );
      }

      // ✅ CRÉER UNE NOUVELLE CONVERSATION AVEC DONNÉES NETTOYÉES
      let conversationModel;
      try {
        console.log(
          `🏗️ Création du modèle conversation avec données nettoyées`
        );
        conversationModel = new Conversation(cleanedData);

        // ✅ VALIDATION EXPLICITE AVEC GESTION D'ERREUR DÉTAILLÉE
        const validationError = conversationModel.validateSync();
        if (validationError) {
          console.error(`❌ Erreur validation conversation:`, {
            message: validationError.message,
            errors: validationError.errors,
            conversationId: cleanedData._id,
          });

          // ✅ GESTION SPÉCIFIQUE DES ERREURS D'ENUM
          if (validationError.message.includes("is not a valid enum value")) {
            console.error(
              `🔧 Erreur enum détectée - tentative de correction...`
            );

            // ✅ CORRIGER LES VALEURS D'ENUM INVALIDES
            const correctedData = this._fixEnumValues(cleanedData);
            conversationModel = new Conversation(correctedData);

            const retryValidation = conversationModel.validateSync();
            if (retryValidation) {
              throw new Error(
                `Données encore invalides après correction: ${retryValidation.message}`
              );
            }

            console.log(`✅ Données d'enum corrigées avec succès`);
          } else {
            throw new Error(
              `Données de conversation invalides: ${validationError.message}`
            );
          }
        }

        console.log(`✅ Modèle conversation créé et validé`);
      } catch (modelError) {
        console.error(`❌ Erreur création modèle conversation:`, {
          error: modelError.message,
          stack: modelError.stack,
          conversationId: cleanedData._id,
          hasMetadata: !!cleanedData.metadata,
          auditLogLength: cleanedData.metadata?.auditLog?.length || 0,
        });
        throw new Error(`Impossible de créer le modèle: ${modelError.message}`);
      }

      // ✅ SAUVEGARDER AVEC GESTION D'ERREUR ROBUSTE ET DEBUG
      let savedConversation;
      try {
        console.log(`💾 Tentative de sauvegarde en base de données...`);
        this.metrics.dbQueries++;

        // ✅ INITIALISATION MANUELLE DES COMPTEURS AVANT SAUVEGARDE
        try {
          if (typeof conversationModel.initializeUnreadCounts === "function") {
            conversationModel.initializeUnreadCounts();
          } else {
            console.warn(
              `⚠️ Méthode initializeUnreadCounts non disponible, initialisation manuelle`
            );
            if (!conversationModel.unreadCounts) {
              conversationModel.unreadCounts = {};
            }
            if (
              conversationModel.participants &&
              Array.isArray(conversationModel.participants)
            ) {
              conversationModel.participants.forEach((participantId) => {
                if (!(participantId in conversationModel.unreadCounts)) {
                  conversationModel.unreadCounts[participantId] = 0;
                }
              });
              conversationModel.markModified("unreadCounts");
            }
          }

          // ✅ VALIDATION FINALE AVANT SAUVEGARDE
          if (
            typeof conversationModel.validateAndCleanUnreadCounts === "function"
          ) {
            conversationModel.validateAndCleanUnreadCounts();
          }
        } catch (initError) {
          console.warn(
            `⚠️ Erreur initialisation compteurs:`,
            initError.message
          );
        }

        // ✅ SAUVEGARDE AVEC GESTION D'ERREUR SPÉCIFIQUE POUR LES HOOKS
        savedConversation = await conversationModel.save();

        if (!savedConversation || !savedConversation._id) {
          throw new Error(
            "Sauvegarde a échoué - conversation invalide retournée"
          );
        }

        console.log(`✅ Conversation sauvegardée en base:`, {
          id: savedConversation._id,
          name: savedConversation.name,
          participants: savedConversation.participants,
          auditLogCount: savedConversation.metadata?.auditLog?.length || 0,
          unreadCountsKeys: Object.keys(savedConversation.unreadCounts || {}),
        });
      } catch (saveError) {
        console.error(`❌ Erreur sauvegarde MongoDB:`, {
          error: saveError.message,
          code: saveError.code,
          keyPattern: saveError.keyPattern,
          conversationId: cleanedData._id,
          stack: saveError.stack,
        });

        // ✅ GESTION SPÉCIFIQUE DES ERREURS DE HOOKS
        if (
          saveError.message.includes("doc is not defined") ||
          saveError.message.includes("is not defined")
        ) {
          console.error(
            `❌ Erreur de référence dans les hooks détectée:`,
            saveError.message
          );
          throw new Error(
            `Erreur hook MongoDB: ${saveError.message} - Vérifiez les hooks pre/post du modèle`
          );
        }

        // ✅ GESTION SPÉCIFIQUE DES ERREURS MONGODB
        if (saveError.code === 11000) {
          console.log(`🔄 Conversation en doublon détectée, récupération...`);
          try {
            const existing = await Conversation.findById(cleanedData._id);
            if (existing) {
              console.log(
                `✅ Conversation récupérée après doublon: ${existing._id}`
              );
              return existing;
            }
          } catch (recoveryError) {
            console.error(
              `❌ Erreur récupération après doublon:`,
              recoveryError.message
            );
          }
        }

        // ✅ GESTION DES ERREURS DE MÉTHODES MANQUANTES
        if (saveError.message.includes("is not a function")) {
          console.error(
            `❌ Erreur de méthode manquante détectée:`,
            saveError.message
          );
          throw new Error(
            `Erreur méthode: ${saveError.message} - Vérifiez que toutes les méthodes du modèle sont définies`
          );
        }

        throw new Error(`Erreur MongoDB: ${saveError.message}`);
      }

      const processingTime = Date.now() - startTime;

      // ✅ CACHE REDIS AVEC GESTION D'ERREUR
      if (this.redisClient) {
        try {
          await this._cacheConversation(savedConversation);
          console.log(
            `💾 Conversation mise en cache: ${savedConversation._id}`
          );
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache conversation:", cacheError.message);
          // ✅ NE PAS FAIRE ÉCHOUER LA SAUVEGARDE SI LE CACHE ÉCHOUE
        }
      }

      // ✅ KAFKA AVEC GESTION D'ERREUR
      if (this.kafkaProducer) {
        try {
          await this._publishConversationEvent(
            "CONVERSATION_CREATED",
            savedConversation,
            { processingTime }
          );
          console.log(`📤 Événement Kafka publié: CONVERSATION_CREATED`);
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication conversation:",
            kafkaError.message
          );
          // ✅ NE PAS FAIRE ÉCHOUER LA SAUVEGARDE SI KAFKA ÉCHOUE
        }
      }

      console.log(
        `✅ Conversation complètement sauvegardée: ${savedConversation._id} (${processingTime}ms)`
      );
      return savedConversation;
    } catch (error) {
      this.metrics.errors++;
      const processingTime = Date.now() - startTime;

      console.error(`❌ Erreur complète sauvegarde conversation:`, {
        error: error.message,
        stack: error.stack,
        conversationId: conversationData._id,
        processingTime,
      });

      // ✅ PUBLIER L'ERREUR SUR KAFKA SI DISPONIBLE
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "CONVERSATION_SAVE_FAILED",
            conversationId: conversationData._id,
            error: error.message,
            processingTime,
            timestamp: new Date().toISOString(),
            source: "MongoConversationRepository",
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
    if (!this.redisClient) return false;

    try {
      const cacheKey = `conversation:${conversation._id}`;
      const conversationData = JSON.stringify({
        id: conversation._id,
        name: conversation.name,
        type: conversation.type,
        participants: conversation.participants,
        lastMessage: conversation.lastMessage,
        lastMessageAt: conversation.lastMessageAt,
        unreadCounts: conversation.unreadCounts,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      });

      // ✅ GÉRER LES DIFFÉRENTES API REDIS (MÊME LOGIQUE QUE POUR LES MESSAGES)
      if (typeof this.redisClient.setex === "function") {
        await this.redisClient.setex(
          cacheKey,
          this.defaultTTL,
          conversationData
        );
      } else if (typeof this.redisClient.setEx === "function") {
        await this.redisClient.setEx(
          cacheKey,
          this.defaultTTL,
          conversationData
        );
      } else if (typeof this.redisClient.set === "function") {
        await this.redisClient.set(cacheKey, conversationData);

        if (typeof this.redisClient.expire === "function") {
          await this.redisClient.expire(cacheKey, this.defaultTTL);
        }
      } else {
        console.warn(
          "⚠️ Aucune méthode Redis compatible pour le cache conversation"
        );
        return false;
      }

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
      if (!this.kafkaProducer) {
        console.warn("⚠️ Pas de producer Kafka disponible");
        return false;
      }

      const eventData = {
        eventType,
        conversationId:
          conversation?._id?.toString() || conversation?.id?.toString(),
        type: conversation?.type,
        participantCount: conversation?.participants?.length || 0,
        lastMessageAt: conversation?.lastMessageAt,
        timestamp: new Date().toISOString(),
        serverId: process.env.SERVER_ID || "default",
        source: "MongoConversationRepository",
        ...additionalData,
      };

      // ✅ VÉRIFIER LE TYPE DE PRODUCER ET UTILISER LA BONNE API
      if (typeof this.kafkaProducer.publishMessage === "function") {
        // ✅ UTILISER L'API WRAPPER MessageProducer
        const result = await this.kafkaProducer.publishMessage(eventData);

        if (result) {
          this.metrics.kafkaEvents++;
          console.log(`📤 Événement Kafka publié: ${eventType}`);
          return true;
        } else {
          console.warn(`⚠️ Échec publication Kafka: ${eventType}`);
          return false;
        }
      } else if (typeof this.kafkaProducer.send === "function") {
        // ✅ UTILISER L'API KAFKAJS NATIVE
        const result = await this.kafkaProducer.send({
          topic: "chat.conversations",
          messages: [
            {
              key: eventData.conversationId,
              value: JSON.stringify(eventData),
              timestamp: Date.now(),
              headers: {
                "content-type": "application/json",
                "event-type": eventType,
                source: "MongoConversationRepository",
              },
            },
          ],
          acks: 1,
          timeout: 30000,
        });

        this.metrics.kafkaEvents++;
        console.log(`📤 Événement Kafka publié: ${eventType}`, {
          partition: result[0]?.partition,
          offset: result[0]?.offset,
        });
        return true;
      } else {
        // ✅ TYPE DE PRODUCER NON RECONNU
        console.error("❌ Type de producer Kafka non reconnu:", {
          hasPublishMessage:
            typeof this.kafkaProducer.publishMessage === "function",
          hasSend: typeof this.kafkaProducer.send === "function",
          availableMethods: Object.getOwnPropertyNames(
            this.kafkaProducer
          ).filter((prop) => typeof this.kafkaProducer[prop] === "function"),
          producerType: this.kafkaProducer.constructor?.name || "unknown",
        });

        throw new Error(
          "Producer Kafka incompatible - aucune méthode de publication trouvée"
        );
      }
    } catch (error) {
      this.metrics.kafkaErrors++;
      console.error(`❌ Erreur publication Kafka ${eventType}:`, {
        error: error.message,
        stack: error.stack,
        conversationId: conversation?._id || conversation?.id,
        producerAvailable: !!this.kafkaProducer,
        producerType: this.kafkaProducer?.constructor?.name,
      });

      // ✅ NE PAS FAIRE ÉCHOUER L'OPÉRATION PRINCIPALE
      return false;
    }
  }

  // ✅ AJOUTER UNE MÉTHODE POUR TESTER L'API KAFKA
  _testKafkaAPI() {
    if (!this.kafkaProducer) {
      console.log("❌ Pas de producer Kafka");
      return false;
    }

    const methods = {
      // API MessageProducer (wrapper)
      publishMessage: typeof this.kafkaProducer.publishMessage === "function",
      healthCheck: typeof this.kafkaProducer.healthCheck === "function",
      ensureConnected: typeof this.kafkaProducer.ensureConnected === "function",

      // API KafkaJS native
      send: typeof this.kafkaProducer.send === "function",
      connect: typeof this.kafkaProducer.connect === "function",
      disconnect: typeof this.kafkaProducer.disconnect === "function",

      // Propriétés
      isConnected: this.kafkaProducer.isConnected,
      isEnabled: this.kafkaProducer.isEnabled,
      topicName: this.kafkaProducer.topicName,

      // Informations
      constructorName: this.kafkaProducer.constructor?.name || "unknown",
    };

    console.log("🔍 API Kafka disponible:", methods);
    return methods;
  }

  async findById(conversationId) {
    try {
      const conversation = await Conversation.findById(conversationId).lean();
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

  // ✅ MÉTHODE POUR NETTOYER LES DONNÉES DE CONVERSATION
  _sanitizeConversationData(data) {
    const sanitized = { ...data };

    // ✅ VALIDATION ET NETTOYAGE DE BASE
    if (!sanitized._id) {
      throw new Error("ID de conversation requis pour la sanitisation");
    }

    if (!sanitized.name || typeof sanitized.name !== "string") {
      sanitized.name = `Conversation ${Date.now()}`;
    }

    if (!sanitized.participants || !Array.isArray(sanitized.participants)) {
      throw new Error("Participants requis et doivent être un array");
    }

    // ✅ NETTOYER LES MÉTADONNÉES
    if (sanitized.metadata) {
      // ✅ NETTOYER L'AUDIT LOG
      if (
        sanitized.metadata.auditLog &&
        Array.isArray(sanitized.metadata.auditLog)
      ) {
        sanitized.metadata.auditLog = sanitized.metadata.auditLog.map(
          (entry) => ({
            action: this._validateAction(entry.action),
            userId: String(entry.userId),
            timestamp:
              entry.timestamp instanceof Date
                ? entry.timestamp
                : new Date(entry.timestamp || Date.now()),
            details: entry.details || {},
            metadata: entry.metadata || {},
          })
        );
      }

      // ✅ ASSURER LES STATISTIQUES
      if (!sanitized.metadata.stats) {
        sanitized.metadata.stats = {
          totalMessages: 0,
          totalFiles: 0,
          totalParticipants: sanitized.participants?.length || 0,
          lastActivity: new Date(),
        };
      }
    } else {
      // ✅ CRÉER DES MÉTADONNÉES DE BASE SI MANQUANTES
      sanitized.metadata = {
        autoCreated: true,
        createdFrom: "Repository",
        version: 1,
        stats: {
          totalMessages: 0,
          totalFiles: 0,
          totalParticipants: sanitized.participants?.length || 0,
          lastActivity: new Date(),
        },
      };
    }

    // ✅ NETTOYER USER METADATA
    if (sanitized.userMetadata && Array.isArray(sanitized.userMetadata)) {
      sanitized.userMetadata = sanitized.userMetadata.map((meta) => ({
        userId: String(meta.userId),
        unreadCount: Math.max(0, parseInt(meta.unreadCount) || 0),
        lastReadAt:
          meta.lastReadAt instanceof Date
            ? meta.lastReadAt
            : meta.lastReadAt
            ? new Date(meta.lastReadAt)
            : null,
        isMuted: Boolean(meta.isMuted),
        isPinned: Boolean(meta.isPinned),
        customName: meta.customName ? String(meta.customName) : null,
        notificationSettings: {
          enabled: Boolean(meta.notificationSettings?.enabled ?? true),
          sound: Boolean(meta.notificationSettings?.sound ?? true),
          vibration: Boolean(meta.notificationSettings?.vibration ?? true),
        },
      }));
    } else {
      // ✅ CRÉER USER METADATA POUR TOUS LES PARTICIPANTS
      sanitized.userMetadata = sanitized.participants.map((participantId) => ({
        userId: String(participantId),
        unreadCount: 0,
        lastReadAt: null,
        isMuted: false,
        isPinned: false,
        notificationSettings: {
          enabled: true,
          sound: true,
          vibration: true,
        },
      }));
    }

    // ✅ NETTOYER ET VALIDER UNREADCOUNTS AVEC VALIDATION RENFORCÉE
    if (sanitized.unreadCounts) {
      const cleanedUnreadCounts = {};

      // ✅ SI C'EST UNE MAP, CONVERTIR EN OBJET
      if (sanitized.unreadCounts instanceof Map) {
        for (const [key, value] of sanitized.unreadCounts.entries()) {
          cleanedUnreadCounts[String(key)] = Math.max(0, parseInt(value) || 0);
        }
      }
      // ✅ SI C'EST UN OBJET, NETTOYER LES VALEURS
      else if (
        typeof sanitized.unreadCounts === "object" &&
        sanitized.unreadCounts !== null
      ) {
        for (const [key, value] of Object.entries(sanitized.unreadCounts)) {
          if (key && key !== "undefined" && key !== "null") {
            cleanedUnreadCounts[String(key)] = Math.max(
              0,
              parseInt(value) || 0
            );
          }
        }
      }

      sanitized.unreadCounts = cleanedUnreadCounts;
    } else {
      // ✅ INITIALISER SI ABSENT
      sanitized.unreadCounts = {};
    }

    // ✅ VALIDER ET NETTOYER LES PARTICIPANTS
    if (sanitized.participants && Array.isArray(sanitized.participants)) {
      sanitized.participants = sanitized.participants
        .map((p) => String(p))
        .filter((p) => p && p !== "undefined" && p !== "null");

      // ✅ ASSURER QUE TOUS LES PARTICIPANTS ONT UN COMPTEUR NON-LU
      sanitized.participants.forEach((participantId) => {
        if (!(participantId in sanitized.unreadCounts)) {
          sanitized.unreadCounts[participantId] = 0;
        }
      });
    }

    // ✅ NETTOYER LES PARAMÈTRES
    if (!sanitized.settings) {
      sanitized.settings = {
        allowInvites: true,
        isPublic: false,
        maxParticipants: sanitized.type === "PRIVATE" ? 2 : 200,
        messageRetention: 0,
        autoDeleteAfter: 0,
      };
    }

    // ✅ VALIDATION FINALE
    console.log(`🧹 Données sanitisées:`, {
      id: sanitized._id,
      participantsCount: sanitized.participants.length,
      unreadCountsKeys: Object.keys(sanitized.unreadCounts),
      hasMetadata: !!sanitized.metadata,
      hasUserMetadata: !!sanitized.userMetadata,
    });

    return sanitized;
  }

  // ✅ MÉTHODE POUR VALIDER ET CORRIGER LES ACTIONS D'AUDIT
  _validateAction(action) {
    const validActions = [
      "CREATED",
      "UPDATED",
      "DELETED",
      "PARTICIPANT_ADDED",
      "PARTICIPANT_REMOVED",
      "PARTICIPANT_INVITED",
      "PARTICIPANT_LEFT",
      "ARCHIVED",
      "UNARCHIVED",
      "MUTED",
      "UNMUTED",
      "PINNED",
      "UNPINNED",
      "AUTO_CREATED",
      "AUTO_ARCHIVED",
      "AUTO_DELETED",
      "AUTO_PARTICIPANT_REMOVED",
      "MESSAGE_SENT",
      "MESSAGE_DELETED",
      "MESSAGE_EDITED",
      "STATUS_CHANGED",
      "SETTINGS_UPDATED",
      "PERMISSIONS_CHANGED",
    ];

    if (!action || typeof action !== "string") {
      return "CREATED"; // Valeur par défaut
    }

    const upperAction = action.toUpperCase();

    // ✅ MAPPINGS POUR CORRIGER LES ACTIONS COURANTES
    const actionMappings = {
      AUTO_CREATED: "CREATED", // ✅ MAPPER AUTO_CREATED → CREATED SI PAS DANS L'ENUM
      CREATION: "CREATED",
      CREATE: "CREATED",
      UPDATE: "UPDATED",
      DELETE: "DELETED",
      REMOVE: "DELETED",
    };

    // Vérifier si l'action est valide
    if (validActions.includes(upperAction)) {
      return upperAction;
    }

    // Appliquer les mappings
    if (actionMappings[upperAction]) {
      console.log(
        `🔧 Action mappée: ${upperAction} → ${actionMappings[upperAction]}`
      );
      return actionMappings[upperAction];
    }

    // Valeur par défaut
    console.warn(`⚠️ Action inconnue "${action}", utilisation de "CREATED"`);
    return "CREATED";
  }

  // ✅ MÉTHODE POUR CORRIGER LES VALEURS D'ENUM
  _fixEnumValues(data) {
    const fixed = { ...data };

    if (fixed.metadata?.auditLog) {
      fixed.metadata.auditLog = fixed.metadata.auditLog.map((entry) => ({
        ...entry,
        action: this._validateAction(entry.action),
      }));
    }

    return fixed;
  }
}

module.exports = MongoConversationRepository;
