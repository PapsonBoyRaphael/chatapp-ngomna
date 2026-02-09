/**
 * ResilientMessageService - Service COMPLET de résilience + Multi-Streams
 * ✅ Écrit ET lit les streams
 * ✅ Gère les retries automatiques
 * ✅ Nettoie la mémoire
 * ✅ MULTI-STREAMS PAR TYPE (privé, groupe, typing, etc.)
 * ✅ Un seul point de vérité pour la logique résiliente
 * ✅ UTILISE SHARED MODULE pour CircuitBreaker, StreamManager, WorkerManager
 */

const {
  CircuitBreaker,
  StreamManager,
  WorkerManager,
} = require("../../../shared");

class ResilientMessageService {
  constructor(
    redisClient,
    messageRepository,
    mongoRepository = null,
    mongoConversationRepository = null,
    io = null,
  ) {
    this.redis = redisClient;
    this.messageRepository = messageRepository;
    this.mongoRepository = mongoRepository;
    this.mongoConversationRepository = mongoConversationRepository;
    this.io = io;

    // ✅ UTILISER CircuitBreaker du shared
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 30000,
      fallback: this.redisFallback.bind(this),
    });

    this.maxRetries = 5;

    // ✅ NOUVEAU : Instancier StreamManager (remplace les configs dupliquées)
    try {
      this.streamManager = new StreamManager(this.redis, {
        // Options personnalisées si besoin, sinon defaults du partagé
      });
      console.log("✅ StreamManager instancié avec succès");
    } catch (err) {
      console.error("❌ Erreur instanciation StreamManager:", err.message);
      throw err;
    }

    // ✅ Utiliser les configs de StreamManager au lieu de les dupliquer
    this.STREAMS = this.streamManager.STREAMS;
    this.MESSAGE_STREAMS = this.streamManager.MESSAGE_STREAMS;
    this.EVENT_STREAMS = this.streamManager.EVENT_STREAMS;
    this.STREAM_MAXLEN = this.streamManager.STREAM_MAXLEN;

    // ✅ MÉTRIQUES (garder les spécifiques au service)
    this.metrics = {
      totalMessages: 0,
      successfulSaves: 0,
      fallbackActivations: 0,
      retryCount: 0,
      dlqCount: 0,
      avgProcessingTime: 0,
      peakMemoryMB: 0,
      lastReportTime: Date.now(),
      // Multi-streams metrics
      privateMessagesPublished: 0,
      groupMessagesPublished: 0,
      typingEventsPublished: 0,
    };

    this.memoryLimitMB = parseInt(process.env.REDIS_MEMORY_LIMIT_MB) || 512;
    this.memoryWarningThreshold = 0.8;

    this.isRunning = false;
    this.batchSize = 10;
    this.processingDelayMs = 1000;
    this.consumerGroupsInitialized = false;

    // ✅ NOUVEAU : Instancier WorkerManager pour orchestrer les workers
    try {
      this.workerManager = new WorkerManager(this.streamManager, this.redis, {
        maxRetries: this.maxRetries,
        batchSize: this.batchSize,
      });
      console.log("✅ WorkerManager instancié avec succès");
    } catch (err) {
      console.error("❌ Erreur instanciation WorkerManager:", err.message);
      throw err;
    }

    // ✅ Les workers seront initialisés explicitement depuis index.js

    console.log(
      "✅ ResilientMessageService initialisé (Intégration shared + StreamManager + WorkerManager)",
    );
  }

  // ✅ INITIALISER LES WORKERS AVEC CALLBACKS PERSONNALISÉS
  initializeResilienceWorkers(customCallbacks = {}) {
    try {
      if (!this.workerManager) {
        throw new Error("WorkerManager n'est pas initialisé");
      }

      const defaultCallbacks = {
        save: this.saveMessage.bind(this),
        publish: this.publishMessage.bind(this),
        dlq: this.addToDLQ.bind(this),
        notify: this.notify.bind(this),
        findMessage: this.findMessageById.bind(this),
        alert: this.alertCallback.bind(this),
      };

      const callbacks = { ...defaultCallbacks, ...customCallbacks };

      // Vérifier que tous les callbacks sont des fonctions
      for (const [key, callback] of Object.entries(callbacks)) {
        if (typeof callback !== "function") {
          console.warn(
            `⚠️ Callback '${key}' n'est pas une fonction:`,
            typeof callback,
          );
        }
      }

      this.workerManager.initialize(callbacks);
      console.log("✅ Callbacks des workers de résilience initialisés");
    } catch (error) {
      console.error(
        "❌ Erreur initialisation callbacks workers:",
        error.message,
      );
      throw error;
    }
  }

  // ✅ DÉMARRER TOUS LES WORKERS VIA WORKERMANAGER
  startAllWorkers() {
    if (this.isRunning) {
      console.warn("⚠️ Workers déjà en cours");
      return;
    }

    try {
      this.workerManager.startAll();
      this.isRunning = true;
      console.log(
        "✅ Tous les workers de résilience démarrés via WorkerManager",
      );
    } catch (error) {
      console.error("❌ Erreur démarrage workers:", error.message);
      throw error;
    }
  }

  // ✅ OBTENIR LES MÉTRIQUES DES WORKERS
  getWorkerMetrics() {
    if (!this.workerManager) return null;
    return this.workerManager.getAllMetrics
      ? this.workerManager.getAllMetrics()
      : {};
  }

  // ✅ OBTENIR LE STATUT DE SANTÉ DES WORKERS
  getHealthStatus() {
    if (!this.workerManager) return null;
    return this.workerManager.getHealthStatus
      ? this.workerManager.getHealthStatus()
      : {};
  }

  // ✅ STUB METHODS POUR LES CALLBACKS (à adapter à votre logique)
  async saveMessage(messageData) {
    return this.messageRepository.save(messageData);
  }

  async publishMessage(messageData) {
    return this.publishToMessageStream(messageData);
  }

  async notify(message) {
    if (this.io) {
      this.io.emit("notification", message);
    }
  }

  async findMessageById(messageId) {
    return this.messageRepository.findById(messageId);
  }

  async alertCallback(alert) {
    console.warn("⚠️ Alert:", alert);
  }

  // ===== WRAPPER UNIVERSEL - DÉLÉGUÉ À STREAMMANAGER =====

  /**
   * ✅ AJOUTER À UN STREAM - DÉLÉGUÉ À STREAMMANAGER
   * StreamManager gère la normalisation, trimming et erreurs
   */
  async addToStream(streamName, fields) {
    return this.streamManager.addToStream(streamName, fields);
  }

  /**
   * ✅ LIRE DEPUIS UN STREAM - DÉLÉGUÉ À STREAMMANAGER
   */
  async readFromStream(streamName, options = {}) {
    const messages = await this.streamManager.readFromStream(
      streamName,
      options,
    );
    return messages.map((entry) =>
      this.streamManager.parseStreamMessage(entry),
    );
  }

  /**
   * ✅ SUPPRIMER DU STREAM - DÉLÉGUÉ À STREAMMANAGER
   */
  async deleteFromStream(streamName, messageId) {
    return this.streamManager.deleteFromStream(streamName, messageId);
  }

  /**
   * ✅ LONGUEUR DU STREAM - DÉLÉGUÉ À STREAMMANAGER
   */
  async getStreamLength(streamName) {
    return this.streamManager.getStreamLength(streamName);
  }

  /**
   * ✅ PLAGE DU STREAM - DÉLÉGUÉ À STREAMMANAGER
   */
  async getStreamRange(streamName, start, end, limit) {
    return this.streamManager.getStreamRange(streamName, start, end, limit);
  }

  // ===== INITIALISATION =====

  async initConsumerGroups() {
    if (this.consumerGroupsInitialized) {
      console.log("ℹ️ Consumer groups déjà initialisés");
      return;
    }
    this.consumerGroupsInitialized = true;

    try {
      const groupConfigs = {
        // Streams techniques
        [this.STREAMS.RETRY]: "retry-workers",
        [this.STREAMS.DLQ]: "dlq-processors",
        [this.STREAMS.FALLBACK]: "fallback-workers",
        [this.STREAMS.METRICS]: "metrics-processors",

        // Streams fonctionnels - contenu messages
        [this.MESSAGE_STREAMS.PRIVATE]: "delivery-private",
        [this.MESSAGE_STREAMS.GROUP]: "delivery-group",
        [this.MESSAGE_STREAMS.CHANNEL]: "delivery-channel",

        // Streams fonctionnels - métadonnées messages
        [this.MESSAGE_STREAMS.STATUS.DELIVERED]: "delivery-delivered",
        [this.MESSAGE_STREAMS.STATUS.READ]: "delivery-read",
        [this.MESSAGE_STREAMS.STATUS.EDITED]: "delivery-edited",
        [this.MESSAGE_STREAMS.STATUS.DELETED]: "delivery-deleted",

        // Streams fonctionnels - interactions
        [this.MESSAGE_STREAMS.TYPING]: "delivery-typing",
        [this.MESSAGE_STREAMS.REACTIONS]: "delivery-reactions",
        [this.MESSAGE_STREAMS.REPLIES]: "delivery-replies",

        // Streams événementiels
        [this.EVENT_STREAMS.CONVERSATIONS]: "events-conversations",

        [this.EVENT_STREAMS.FILES]: "events-files",
        [this.EVENT_STREAMS.NOTIFICATIONS]: "events-notifications",
        [this.EVENT_STREAMS.ANALYTICS]: "events-analytics",
      };

      for (const [stream, group] of Object.entries(groupConfigs)) {
        try {
          await this.redis.xGroupCreate(stream, group, "$", {
            MKSTREAM: true,
          });
          console.log(`✅ Stream ${stream} + Consumer group ${group} créés`);
        } catch (err) {
          if (err.message.includes("BUSYGROUP")) {
            console.log(`ℹ️ Consumer group ${group} existe déjà`);
          } else {
            console.warn(`⚠️ Erreur création groupe:`, err.message);
          }
        }
      }
    } catch (err) {
      console.warn("⚠️ Erreur init consumer groups:", err.message);
      this.consumerGroupsInitialized = false;
    }
  }

  // ===== LOGGING =====

  async logPreWrite(messageData) {
    if (!this.redis) return;

    try {
      const walEntry = await this.addToStream(this.STREAMS.WAL, {
        type: "pre_write",
        messageId: messageData._id?.toString() || "unknown",
        conversationId: messageData.conversationId?.toString() || "unknown",
        senderId: messageData.senderId?.toString() || "unknown",
        timestamp: Date.now().toString(),
        status: "pending",
      });

      console.log(`📝 WAL entry: ${walEntry}`);
      return walEntry;
    } catch (err) {
      console.warn("⚠️ Erreur WAL pre-write:", err.message);
    }
  }

  async logPostWrite(messageId, walId) {
    if (!this.redis || !walId) return;

    try {
      await this.addToStream(this.STREAMS.WAL, {
        type: "post_write",
        messageId: messageId?.toString() || "unknown",
        walId: walId,
        timestamp: Date.now().toString(),
        status: "completed",
      });

      await this.redis.xDel(this.STREAMS.WAL, walId);
      console.log(`✅ WAL cleanup: ${walId}`);
    } catch (err) {
      console.warn("⚠️ Erreur WAL post-write:", err.message);
    }
  }

  // ===== RETRY =====

  async addRetry(messageData, attempt, error) {
    if (!this.redis || !messageData) {
      console.warn("⚠️ addRetry: messageData est undefined ou Redis absent");
      return;
    }

    try {
      this.metrics.retryCount++;

      const dataStr = JSON.stringify(messageData);
      if (!dataStr || dataStr === "undefined" || dataStr.trim() === "") {
        console.error("❌ addRetry: impossible de stringifier messageData", {
          messageData,
        });
        return;
      }

      const retryEntry = await this.addToStream(this.STREAMS.RETRY, {
        messageId: messageData._id?.toString() || "unknown",
        conversationId: messageData.conversationId?.toString() || "unknown",
        attempt: attempt.toString(),
        error: (error.message || "unknown").substring(0, 300),
        timestamp: Date.now().toString(),
        nextRetryAt: (Date.now() + 100 * Math.pow(2, attempt - 1)).toString(),
        data: dataStr,
      });

      console.log(`🔄 Retry #${attempt}: ${retryEntry}`);
      return retryEntry;
    } catch (err) {
      console.warn("⚠️ Erreur addRetry:", err.message);
    }
  }

  // ===== DLQ =====

  async addToDLQ(messageData, error, attempts, context = {}) {
    if (!this.redis) return null;

    try {
      this.metrics.dlqCount++;

      const dlqId = await this.addToStream(this.STREAMS.DLQ, {
        messageId: messageData._id?.toString() || "unknown",
        conversationId: messageData.conversationId?.toString() || "unknown",
        error: (error.message || "Unknown error").substring(0, 500),
        attempts: attempts.toString(),
        timestamp: Date.now().toString(),
        operation: context.operation || "save",
        poison: (context.poison || false).toString(),
        walId: context.walId || "",
      });

      console.error(`❌ Message en DLQ: ${dlqId}`);
      return dlqId;
    } catch (err) {
      console.error("❌ Erreur addToDLQ:", err.message);
      return null;
    }
  }

  // ===== FALLBACK =====

  async redisFallback(messageData) {
    if (!this.redis) {
      throw new Error("Redis non disponible");
    }

    console.warn("⚠️ Fallback Redis activé");
    this.metrics.fallbackActivations++;

    const fallbackId = `fb_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      const hashKey = `fallback:${fallbackId}`;

      await this.redis.hSet(hashKey, {
        id: fallbackId,
        originalId: messageData._id?.toString() || "pending",
        conversationId: messageData.conversationId?.toString(),
        senderId: messageData.senderId?.toString(),
        content: messageData.content || "",
        type: messageData.type || "TEXT",
        status: "pending_fallback",
        createdAt: new Date().toISOString(),
        ts: Date.now().toString(),
      });

      await this.redis.expire(hashKey, 86400);

      const streamId = await this.addToStream(this.STREAMS.FALLBACK, {
        fallbackId,
        conversationId: messageData.conversationId?.toString(),
        action: "needs_replay",
        priority: "high",
        ts: Date.now().toString(),
      });

      await this.redis.zAdd("fallback:active", {
        score: Date.now(),
        value: fallbackId,
      });

      await this.redis.hIncrBy("fallback:stats", "total", 1);
      await this.redis.hIncrBy("fallback:stats", "active", 1);

      console.log(`✅ Fallback Redis: ${fallbackId}`);

      return {
        _id: fallbackId,
        ...messageData,
        status: "pending_fallback",
        fromFallback: true,
        fallbackStreamId: streamId,
      };
    } catch (error) {
      console.error("❌ Erreur redisFallback:", error.message);
      throw new Error(`Fallback échoué: ${error.message}`);
    }
  }

  // ===== WORKERS =====

  async startWorkers() {
    if (this.isRunning) {
      console.warn("⚠️ Workers déjà en cours");
      return;
    }

    this.isRunning = true;
    console.log("🚀 Démarrage des workers via WorkerManager...");

    try {
      this.workerManager.startAll();
      console.log("✅ Tous les workers démarrés via WorkerManager");
    } catch (error) {
      console.error("❌ Erreur démarrage workers:", error);
      this.isRunning = false;
    }
  }

  stopWorkers() {
    if (!this.isRunning) return;

    console.log("🛑 Arrêt des workers via WorkerManager...");
    this.workerManager.stopAll();
    this.isRunning = false;
    console.log("✅ Workers arrêtés");
  }

  // ===== PROCESS RETRIES =====

  async processRetries() {
    if (!this.redis) return;

    try {
      const retries = await this.redis.xRead(
        [{ key: this.STREAMS.RETRY, id: "0" }],
        { COUNT: this.batchSize },
      );

      if (!retries || retries.length === 0) return;

      const streamData = retries[0];
      if (!streamData || !streamData.messages) return;

      for (const { id, message } of streamData.messages) {
        try {
          const attempt = parseInt(message.attempt) || 1;
          const nextRetryAt = parseInt(message.nextRetryAt);
          const now = Date.now();

          if (nextRetryAt > now) continue;

          let messageData;
          try {
            if (
              !message.data ||
              message.data.trim() === "" ||
              message.data === "undefined"
            ) {
              console.error("❌ Erreur parsing: data est vide ou undefined");
              console.error("message.data : ", message);
              await this.redis.xDel(this.STREAMS.RETRY, id);
              continue;
            }
            messageData = JSON.parse(message.data);
          } catch (e) {
            console.error(
              "❌ Erreur parsing:",
              e.message,
              "Data reçu:",
              message.data?.substring(0, 50),
            );
            await this.redis.xDel(this.STREAMS.RETRY, id);
            continue;
          }

          console.log(`🔄 Retry #${attempt} pour ${message.messageId}...`);

          try {
            const savedMessage = await this.messageRepository.save(messageData);
            console.log(`✅ Retry réussi: ${message.messageId}`);

            await this.publishToMessageStream(savedMessage, {
              event: "NEW_MESSAGE",
              source: "retry",
            });

            await this.redis.xDel(this.STREAMS.RETRY, id);

            if (this.io) {
              this.io
                .to(`conv:${messageData.conversationId}`)
                .emit("messageRetried", {
                  messageId: savedMessage._id,
                  status: "DELIVERED",
                  attempt,
                });
            }
          } catch (saveError) {
            if (attempt >= this.maxRetries) {
              console.error(`❌ Max retries atteint`);
              await this.addToDLQ(messageData, saveError, attempt, {
                operation: "processRetries",
                poison: true,
              });
              await this.redis.xDel(this.STREAMS.RETRY, id);
            } else {
              const nextRetry = attempt + 1;
              console.warn(`⚠️ Retry échoué. Tentative ${nextRetry}...`);
              await this.addRetry(messageData, nextRetry, saveError);
              await this.redis.xDel(this.STREAMS.RETRY, id);
            }
          }
        } catch (error) {
          console.error("❌ Erreur traitement retry:", error.message);
        }
      }
    } catch (error) {
      console.error("❌ Erreur processRetries:", error.message);
    }
  }

  // ===== PROCESS FALLBACK =====

  async processFallback() {
    if (!this.redis) return;

    try {
      const fallbacks = await this.redis.xRead(
        [{ key: this.STREAMS.FALLBACK, id: "0" }],
        { COUNT: this.batchSize },
      );

      if (!fallbacks || fallbacks.length === 0) return;

      const streamData = fallbacks[0];
      if (!streamData || !streamData.messages) return;

      for (const { id, message } of streamData.messages) {
        try {
          const fallbackId = message.fallbackId;
          const conversationId = message.conversationId;

          const hashKey = `fallback:${fallbackId}`;
          const fallbackData = await this.redis.hGetAll(hashKey);

          if (!fallbackData || Object.keys(fallbackData).length === 0) {
            console.warn(`⚠️ Fallback data non trouvée: ${fallbackId}`);
            await this.redis.xDel(this.STREAMS.FALLBACK, id);
            continue;
          }

          console.log(`🔄 Replay fallback: ${fallbackId}...`);

          try {
            const mongoMessage = await this.messageRepository.save({
              _id:
                fallbackData.originalId === "pending"
                  ? undefined
                  : fallbackData.originalId,
              conversationId: fallbackData.conversationId,
              senderId: fallbackData.senderId,
              content: fallbackData.content,
              type: fallbackData.type || "TEXT",
              status: "DELIVERED",
              createdAt: new Date(fallbackData.createdAt),
              metadata: {
                fromFallback: true,
                fallbackId,
              },
            });

            console.log(
              `✅ Fallback rejoué: ${fallbackId} → ${mongoMessage._id}`,
            );

            await this.publishToMessageStream(mongoMessage, {
              event: "NEW_MESSAGE",
              source: "fallback_replay",
            });

            await this.redis.del(hashKey);
            await this.redis.zRem("fallback:active", fallbackId);
            await this.redis.xDel(this.STREAMS.FALLBACK, id);
            await this.redis.hIncrBy("fallback:stats", "active", -1);
            await this.redis.hIncrBy("fallback:stats", "replayed", 1);

            if (this.io) {
              this.io
                .to(`conv:${conversationId}`)
                .emit("messageFallbackReplayed", {
                  fallbackId,
                  messageId: mongoMessage._id,
                  status: "DELIVERED",
                });
            }
          } catch (saveError) {
            console.error(`❌ Erreur replay fallback:`, saveError.message);
            await this.addToDLQ(
              {
                _id: fallbackData.originalId,
                conversationId: fallbackData.conversationId,
                senderId: fallbackData.senderId,
                content: fallbackData.content,
              },
              saveError,
              1,
              { operation: "processFallback", fallbackId, poison: true },
            );
            await this.redis.del(hashKey);
            await this.redis.xDel(this.STREAMS.FALLBACK, id);
          }
        } catch (error) {
          console.error("❌ Erreur traitement fallback:", error.message);
        }
      }
    } catch (error) {
      console.error("❌ Erreur processFallback:", error.message);
    }
  }

  // ===== PROCESS WAL RECOVERY =====

  async processWALRecovery() {
    if (!this.redis) return;

    try {
      const walEntries = await this.redis.xRange(this.STREAMS.WAL, "-", "+");

      if (!walEntries || walEntries.length === 0) return;

      const incompleteWALs = new Map();

      for (const entry of walEntries) {
        const id = Array.isArray(entry) ? entry[0] : entry.id;
        const fields = Array.isArray(entry)
          ? Object.fromEntries(
              Array.from({ length: entry[1].length / 2 }, (_, i) => [
                entry[1][i * 2],
                entry[1][i * 2 + 1],
              ]),
            )
          : entry.message;

        if (fields.type === "pre_write") {
          const walId = fields.walId || id;
          incompleteWALs.set(walId, {
            id,
            walId,
            messageId: fields.messageId,
            conversationId: fields.conversationId,
            senderId: fields.senderId,
            timestamp: parseInt(fields.timestamp),
          });
        } else if (fields.type === "post_write") {
          incompleteWALs.delete(fields.walId);
        }
      }

      const now = Date.now();
      const walTimeout = 60000;

      for (const [walId, walData] of incompleteWALs.entries()) {
        try {
          const age = now - walData.timestamp;

          if (age > walTimeout) {
            console.warn(
              `⚠️ WAL incomplet: ${walId} (${(age / 1000).toFixed(2)}s)`,
            );

            const existingMessage = await this.messageRepository
              .findById(walData.messageId)
              .catch(() => null);

            if (existingMessage) {
              console.log(`✅ Message retrouvé: ${walData.messageId}`);
            } else {
              console.warn(`❌ Message PERDU: ${walData.messageId}`);
              await this.addToDLQ(
                {
                  _id: walData.messageId,
                  conversationId: walData.conversationId,
                  senderId: walData.senderId,
                },
                new Error("Message lost - incomplete WAL"),
                0,
                { operation: "processWALRecovery", walId, poison: true },
              );
            }

            await this.redis.xDel(this.STREAMS.WAL, walData.id);
          }
        } catch (error) {
          console.error("❌ Erreur WAL recovery:", error.message);
        }
      }
    } catch (error) {
      console.error("❌ Erreur processWALRecovery:", error.message);
    }
  }

  // ===== MONITOR DLQ =====

  async monitorDLQ() {
    if (!this.redis) return;

    try {
      const dlqLength = await this.redis.xLen(this.STREAMS.DLQ);

      if (dlqLength > 0) {
        console.error(`🚨 DLQ NON VIDE: ${dlqLength} messages`);

        const dlqMessages = await this.redis.xRevRange(
          this.STREAMS.DLQ,
          "+",
          "-",
          { COUNT: 5 },
        );

        dlqMessages.forEach((msg) => {
          const fields = Array.isArray(msg)
            ? Object.fromEntries(
                Array.from({ length: msg[1].length / 2 }, (_, i) => [
                  msg[1][i * 2],
                  msg[1][i * 2 + 1],
                ]),
              )
            : msg.message;

          console.error(`  ❌ ${fields.messageId}: ${fields.error}`);
        });

        if (this.io) {
          this.io.emit("dlqAlert", {
            count: dlqLength,
            severity: dlqLength > 100 ? "critical" : "warning",
            timestamp: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      console.error("❌ Erreur monitorDLQ:", error.message);
    }
  }

  // ===== PUBLISH MESSAGE =====

  /**
   * ✅ PUBLIER UN MESSAGE DANS LE BON STREAM (MULTI-STREAMS)
   * Détermine automatiquement le type : PRIVÉ / GROUPE
   */
  async publishToMessageStream(savedMessage, options = {}) {
    if (!this.redis) {
      console.warn("⚠️ Redis non disponible pour publish");
      return null;
    }

    try {
      const conversationId = savedMessage.conversationId?.toString();
      const senderId = savedMessage.senderId?.toString();
      let receiverId = savedMessage.receiverId?.toString();

      // ✅ DÉDUIRE receiverId SI ABSENT
      if (
        !receiverId ||
        receiverId === "null" ||
        receiverId === "undefined" ||
        receiverId === ""
      ) {
        if (
          options.conversationParticipants &&
          Array.isArray(options.conversationParticipants)
        ) {
          receiverId = options.conversationParticipants
            .map((p) => String(p.userId || p))
            .find((p) => p !== String(senderId));
        } else if (this.mongoRepository && conversationId) {
          try {
            const conversation =
              await this.mongoRepository.findById(conversationId);
            if (conversation?.participants) {
              receiverId = conversation.participants
                .map((p) => String(p.userId || p))
                .find((p) => p !== String(senderId));
            }
          } catch (err) {
            console.warn("⚠️ Erreur déduction receiverId:", err.message);
          }
        }
      }

      // ✅ CONSTRUIRE LES DONNÉES DU MESSAGE
      const streamData = {
        messageId: savedMessage._id?.toString() || savedMessage.id,
        conversationId: conversationId || "",
        senderId: senderId || "",
        receiverId: receiverId || "",
        content: (savedMessage.content || "").substring(0, 500),
        type: savedMessage.type || "TEXT",
        event: options.event || "NEW_MESSAGE",
        status: savedMessage.status || "SENT",
        timestamp: (
          savedMessage.timestamp || savedMessage.createdAt
        )?.toISOString(),
        source: options.source || "mongodb_write",
        publishedAt: Date.now().toString(),
      };

      // ✅ DÉTERMINER LE STREAM DE DESTINATION
      let streamName = this.STREAMS.MESSAGES;
      let streamDescription = "DÉFAUT";

      // Cas 1 : Message privé (1→1)
      if (
        receiverId &&
        receiverId !== "null" &&
        receiverId !== "" &&
        receiverId !== "undefined"
      ) {
        streamName = this.MESSAGE_STREAMS.PRIVATE;
        streamDescription = "PRIVÉ";
        this.metrics.privateMessagesPublished++;
      }
      // Cas 2 : Message de groupe (1→N avec conversationId)
      else if (
        conversationId &&
        conversationId !== "null" &&
        conversationId !== ""
      ) {
        streamName = this.MESSAGE_STREAMS.GROUP;
        streamDescription = "GROUPE";
        this.metrics.groupMessagesPublished++;
      }

      console.log(`📤 Publication [${streamDescription}] dans ${streamName}:`, {
        messageId: streamData.messageId,
        senderId: streamData.senderId,
        receiverId: streamData.receiverId,
        conversationId: streamData.conversationId,
      });

      const streamId = await this.addToStream(streamName, streamData);

      console.log(`✅ Message publié: ${streamId}`);
      return streamId;
    } catch (error) {
      console.error("❌ Erreur publication stream:", error.message);
      return null;
    }
  }

  /**
   * ✅ PUBLIER UN ÉVÉNEMENT TYPING
   */
  async publishTypingEvent(conversationId, userId, isTyping = true) {
    if (!this.redis) return null;

    try {
      const streamId = await this.addToStream(this.MESSAGE_STREAMS.TYPING, {
        conversationId: conversationId.toString(),
        userId: userId.toString(),
        isTyping: isTyping.toString(),
        event: isTyping ? "TYPING_STARTED" : "TYPING_STOPPED",
        timestamp: new Date().toISOString(),
        publishedAt: Date.now().toString(),
      });

      this.metrics.typingEventsPublished++;
      console.log(`⌨️ Typing event publié: ${streamId}`);
      return streamId;
    } catch (error) {
      console.error("❌ Erreur publication typing event:", error.message);
      return null;
    }
  }

  /**
   * ✅ PUBLIER UN STATUT DE MESSAGE
   */
  async publishMessageStatus(
    messageId,
    userId,
    status,
    timestamp = null,
    conversationParticipants = null,
    messageContent = null, // ✅ NOUVEAU: contenu du message (pour EDITED)
  ) {
    if (!this.redis) {
      console.log(`❌ publishMessageStatus: Redis non disponible`);
      return null;
    }

    try {
      const userIdStr = userId.toString();

      console.log(`📋 [publishMessageStatus] DÉBUT:`, {
        messageId: messageId?.toString(),
        userId: userIdStr,
        status,
        timestamp: timestamp?.toISOString(),
        participantsCount: conversationParticipants?.length || 0,
        hasContent: !!messageContent,
      });

      // ✅ VÉRIFIER SI L'UTILISATEUR EST CONNECTÉ
      const isUserOnline =
        this.messageDeliveryService &&
        this.messageDeliveryService.userSockets &&
        this.messageDeliveryService.userSockets.has(userIdStr);

      console.log(`🔍 Vérification online status:`, {
        messageDeliveryService: !!this.messageDeliveryService,
        userSockets: !!this.messageDeliveryService?.userSockets,
        userSocketsType: typeof this.messageDeliveryService?.userSockets,
        userInSockets:
          this.messageDeliveryService?.userSockets?.has?.(userIdStr),
        isUserOnline,
        userIdStr,
      });

      // Choisir le stream approprié selon le statut
      let streamName;
      let streamType;
      switch (status.toUpperCase()) {
        case "DELIVERED":
          streamName = this.MESSAGE_STREAMS.STATUS.DELIVERED;
          streamType = "statusDelivered";
          break;
        case "READ":
          streamName = this.MESSAGE_STREAMS.STATUS.READ;
          streamType = "statusRead";
          break;
        case "EDITED":
          streamName = this.MESSAGE_STREAMS.STATUS.EDITED;
          streamType = "statusEdited";
          break;
        case "DELETED":
          streamName = this.MESSAGE_STREAMS.STATUS.DELETED;
          streamType = "statusDeleted";
          break;
        default:
          console.warn(
            `⚠️ Statut inconnu: ${status}, utilisation DELIVERED par défaut`,
          );
          streamName = this.MESSAGE_STREAMS.STATUS.DELIVERED;
          streamType = "statusDelivered";
      }

      console.log(`📍 Stream selection:`, {
        status,
        streamName,
        streamType,
        streamNameExists: !!streamName,
      });

      const eventData = {
        messageId: messageId.toString(),
        userId: userIdStr,
        status: status,
        timestamp: (timestamp || new Date()).toISOString(),
        participants: conversationParticipants
          ? JSON.stringify(conversationParticipants)
          : "[]",
      };

      // ✅ AJOUTER LE CONTENU SI C'EST UN EDITED
      if (messageContent) {
        eventData.messageContent = messageContent.substring(0, 1000);
      }

      console.log(`📊 Event data:`, {
        ...eventData,
        participants: conversationParticipants?.length || 0,
      });

      const hasParticipants =
        Array.isArray(conversationParticipants) &&
        conversationParticipants.length > 0;

      // ✅ SI PARTICIPANTS DISPONIBLES, PUBLIER POUR LIVRAISON À TOUS
      if (hasParticipants) {
        console.log(
          `📡 [STATUS] Participants détectés → publication directe dans ${streamType}`,
        );
        try {
          const streamId = await this.addToStream(streamName, eventData);
          console.log(
            `✅ [PUBLISHED] Message status publié: ${streamId} (${status}) dans ${streamName}`,
            { streamId, status, streamName, eventData },
          );
          return streamId;
        } catch (addErr) {
          console.error(
            `❌ [STREAM ERROR] Erreur lors de l'ajout au stream ${streamName}:`,
            addErr.message,
          );
          throw addErr;
        }
      }

      // ✅ SI L'UTILISATEUR EST ONLINE
      if (isUserOnline) {
        console.log(
          `✅ [ONLINE] Utilisateur ${userIdStr} connecté → publication immédiate dans ${streamType}`,
        );
        try {
          const streamId = await this.addToStream(streamName, eventData);
          console.log(
            `✅ [PUBLISHED] Message status publié: ${streamId} (${status}) dans ${streamName}`,
            { streamId, status, streamName, eventData },
          );
          return streamId;
        } catch (addErr) {
          console.error(
            `❌ [STREAM ERROR] Erreur lors de l'ajout au stream ${streamName}:`,
            addErr.message,
          );
          throw addErr;
        }
      } else {
        // ✅ SI L'UTILISATEUR EST OFFLINE
        console.log(
          `⏳ [OFFLINE] Utilisateur ${userIdStr} déconnecté → mise en attente pour ${streamType}`,
        );

        // ✅ AJOUTER EN FILE D'ATTENTE DE MISE EN ATTENTE (pending:messages:userId:streamType)
        const pendingKey = `pending:messages:${userIdStr}:${streamType}`;
        console.log(`📤 Ajout à pending queue: ${pendingKey}`, { eventData });

        try {
          const pendingId = await this.redis.xAdd(
            pendingKey,
            "*",
            "event",
            JSON.stringify(eventData),
            "streamType",
            streamType,
            "addedAt",
            new Date().toISOString(),
          );

          console.log(
            `✅ [PENDING] Événement ${status} mis en attente pour ${userIdStr}: ${pendingId}`,
            { pendingKey, pendingId, streamType },
          );

          // ✅ DÉFINIR TTL DE 24H POUR L'ATTENTE
          await this.redis.expire(pendingKey, 86400);
          console.log(`⏰ TTL défini pour ${pendingKey}: 86400s`);

          return pendingId;
        } catch (pendingErr) {
          console.error(
            `❌ [PENDING ERROR] Erreur lors de l'ajout à la queue pending ${pendingKey}:`,
            pendingErr.message,
          );
          throw pendingErr;
        }
      }
    } catch (error) {
      console.error(
        "❌ [publishMessageStatus] Erreur publication message status:",
        error.message,
      );
      console.error("Stack trace:", error.stack);
      return null;
    }
  }

  /**
   * ✅ PUBLIER UN MESSAGE SUPPRIMÉ À TOUS LES PARTICIPANTS
   * Contrairement à DELIVERED/READ (juste l'expéditeur),
   * DELETED doit être envoyé à TOUS les participants de la conversation
   */
  async publishDeletedMessageToAllParticipants(
    messageId,
    conversationId,
    conversationParticipants = null,
  ) {
    if (!this.redis) {
      console.log(
        `❌ publishDeletedMessageToAllParticipants: Redis non disponible`,
      );
      return null;
    }

    try {
      console.log(`🗑️ [publishDeletedMessageToAllParticipants] DÉBUT:`, {
        messageId: messageId?.toString(),
        conversationId: conversationId?.toString(),
        participantsCount: conversationParticipants?.length || 0,
      });

      // ✅ RÉCUPÉRER LES PARTICIPANTS SI NON FOURNIS
      let participants = Array.isArray(conversationParticipants)
        ? conversationParticipants
        : [];

      if (participants.length === 0 && conversationId && this.mongoRepository) {
        try {
          const conversation =
            await this.mongoRepository.findById(conversationId);
          if (conversation) {
            participants = conversation.participants || [];
            console.log(
              `👥 [DELETED] Participants trouvés: ${participants
                .map((p) => p.userId || p)
                .join(", ")}`,
            );
          }
        } catch (convError) {
          console.warn(
            "⚠️ [DELETED] Erreur récupération participants:",
            convError.message,
          );
        }
      }

      // ✅ ENVOYER LE DELETED À CHAQUE PARTICIPANT
      if (participants.length === 0) {
        console.warn(
          `⚠️ [DELETED] Aucun participant trouvé pour ${conversationId}`,
        );
        return null;
      }

      const publishPromises = [];

      for (const participant of participants) {
        const participantId = String(participant.userId || participant);

        console.log(
          `📤 [DELETED] Envoi du statut DELETED au participant: ${participantId}`,
        );

        // ✅ APPELER publishMessageStatus POUR CHAQUE PARTICIPANT
        const promise = this.publishMessageStatus(
          messageId,
          participantId, // ✅ Envoyer à chaque participant
          "DELETED",
          null,
          participants, // ✅ Inclure les participants dans les données
        );

        publishPromises.push(promise);
      }

      // ✅ ATTENDRE QUE TOUS LES ENVOIS SOIENT TERMINÉS
      const results = await Promise.all(publishPromises);
      console.log(
        `✅ [DELETED] Message supprimé envoyé à ${results.length} participant(s)`,
      );

      return results;
    } catch (error) {
      console.error(
        "❌ [publishDeletedMessageToAllParticipants] Erreur:",
        error.message,
      );
      console.error("Stack trace:", error.stack);
      return null;
    }
  }

  /**
   * ✅ PUBLIER UN MESSAGE ÉDITÉ À TOUS LES PARTICIPANTS
   * EDITED doit être envoyé à TOUS les participants de la conversation
   * pour qu'ils voient la mise à jour du contenu
   */
  async publishEditedMessageToAllParticipants(
    messageId,
    conversationId,
    messageContent,
    conversationParticipants = null,
  ) {
    if (!this.redis) {
      console.log(
        `❌ publishEditedMessageToAllParticipants: Redis non disponible`,
      );
      return null;
    }

    try {
      console.log(`✏️ [publishEditedMessageToAllParticipants] DÉBUT:`, {
        messageId: messageId?.toString(),
        conversationId: conversationId?.toString(),
        contentLength: messageContent?.length || 0,
        participantsCount: conversationParticipants?.length || 0,
      });

      // ✅ RÉCUPÉRER LES PARTICIPANTS SI NON FOURNIS
      let participants = Array.isArray(conversationParticipants)
        ? conversationParticipants
        : [];

      if (participants.length === 0 && conversationId && this.mongoRepository) {
        try {
          const conversation =
            await this.mongoRepository.findById(conversationId);
          if (conversation) {
            participants = conversation.participants || [];
            console.log(
              `👥 [EDITED] Participants trouvés: ${participants
                .map((p) => p.userId || p)
                .join(", ")}`,
            );
          }
        } catch (convError) {
          console.warn(
            "⚠️ [EDITED] Erreur récupération participants:",
            convError.message,
          );
        }
      }

      // ✅ ENVOYER L'EDITED À CHAQUE PARTICIPANT
      if (participants.length === 0) {
        console.warn(
          `⚠️ [EDITED] Aucun participant trouvé pour ${conversationId}`,
        );
        return null;
      }

      const publishPromises = [];

      for (const participant of participants) {
        const participantId = String(participant.userId || participant);

        console.log(
          `📤 [EDITED] Envoi du statut EDITED au participant: ${participantId}`,
        );

        // ✅ APPELER publishMessageStatus POUR CHAQUE PARTICIPANT
        const promise = this.publishMessageStatus(
          messageId,
          participantId, // ✅ Envoyer à chaque participant
          "EDITED",
          null,
          participants, // ✅ Inclure les participants dans les données
          messageContent, // ✅ INCLURE LE NOUVEAU CONTENU
        );

        publishPromises.push(promise);
      }

      // ✅ ATTENDRE QUE TOUS LES ENVOIS SOIENT TERMINÉS
      const results = await Promise.all(publishPromises);
      console.log(
        `✅ [EDITED] Message édité envoyé à ${results.length} participant(s)`,
      );

      return results;
    } catch (error) {
      console.error(
        "❌ [publishEditedMessageToAllParticipants] Erreur:",
        error.message,
      );
      console.error("Stack trace:", error.stack);
      return null;
    }
  }

  /**
   * ✅ PUBLIER UN STATUT BULK (plusieurs messages)
   */
  async publishBulkMessageStatus(
    conversationId,
    userId,
    status,
    messageCount,
    conversationParticipants = null,
  ) {
    if (!this.redis) {
      console.log(`❌ publishBulkMessageStatus: Redis non disponible`);
      return null;
    }

    try {
      const userIdStr = userId.toString();

      console.log(`📦 [publishBulkMessageStatus] DÉBUT:`, {
        conversationId: conversationId?.toString(),
        userId: userIdStr,
        status,
        messageCount,
      });

      // ✅ RÉCUPÉRER LES PARTICIPANTS DE LA CONVERSATION (si non fournis)
      let participants = Array.isArray(conversationParticipants)
        ? conversationParticipants
        : [];

      if (participants.length === 0 && conversationId && this.mongoRepository) {
        try {
          const conversation =
            await this.mongoRepository.findById(conversationId);
          if (conversation) {
            participants = conversation.participants || [];
            console.log(
              `👥 [BULK] Participants trouvés: ${participants
                .map((p) => p.userId || p)
                .join(", ")}`,
            );
          }
        } catch (convError) {
          console.warn(
            "⚠️ [BULK] Erreur récupération participants:",
            convError.message,
          );
        }
      }

      // ✅ VÉRIFIER SI L'UTILISATEUR EST CONNECTÉ
      const isUserOnline =
        this.messageDeliveryService &&
        this.messageDeliveryService.userSockets &&
        this.messageDeliveryService.userSockets.has(userIdStr);

      console.log(
        `🔍 [BULK] Vérification online status: ${isUserOnline} (${userIdStr})`,
      );

      // Choisir le stream approprié selon le statut
      let streamName;
      let streamType;
      switch (status.toUpperCase()) {
        case "DELIVERED":
          streamName = this.MESSAGE_STREAMS.STATUS.DELIVERED;
          streamType = "statusDelivered";
          break;
        case "READ":
          streamName = this.MESSAGE_STREAMS.STATUS.READ;
          streamType = "statusRead";
          break;
        default:
          streamName = this.MESSAGE_STREAMS.STATUS.DELIVERED;
          streamType = "statusDelivered";
      }

      console.log(`📍 [BULK] Stream selection: ${streamName}`);

      const data = {
        conversationId: conversationId.toString(),
        userId: userIdStr,
        status: status.toUpperCase(),
        messageCount: messageCount.toString(),
        isBulk: "true",
        participants: JSON.stringify(participants),
        timestamp: new Date().toISOString(),
        publishedAt: Date.now().toString(),
      };

      const hasParticipants = participants.length > 0;

      // ✅ SI PARTICIPANTS DISPONIBLES, PUBLIER POUR LIVRAISON À TOUS
      if (hasParticipants) {
        console.log(
          `📡 [BULK] Participants détectés → publication directe vers ${streamName}`,
        );
        try {
          const streamId = await this.addToStream(streamName, data);
          console.log(`✅ [BULK] Événement bulk publié: ${streamId}`);
          return streamId;
        } catch (addErr) {
          console.error(`❌ [BULK] Erreur addToStream: ${addErr.message}`);
          throw addErr;
        }
      }

      // ✅ SI L'UTILISATEUR EST ONLINE
      if (isUserOnline) {
        console.log(
          `📡 [BULK] Utilisateur ${userIdStr} ONLINE → publication directe vers ${streamName}`,
        );

        try {
          const streamId = await this.addToStream(streamName, data);
          console.log(`✅ [BULK-ONLINE] Événement bulk publié: ${streamId}`);
          return streamId;
        } catch (addErr) {
          console.error(`❌ [BULK] Erreur addToStream: ${addErr.message}`);
          throw addErr;
        }
      } else {
        // ✅ SI L'UTILISATEUR EST OFFLINE
        console.log(
          `⏳ [BULK-OFFLINE] Utilisateur ${userIdStr} déconnecté → mise en attente pour ${streamType}`,
        );

        const pendingKey = `pending:messages:${userIdStr}:${streamType}`;
        console.log(`📥 Ajout à queue de mise en attente: ${pendingKey}`);

        try {
          // ✅ UTILISER XADD POUR LA QUEUE DE MISE EN ATTENTE (Redis STREAM)
          const pendingId = await this.addToStream(
            pendingKey,
            data,
            true,
            86400,
          );
          console.log(
            `✅ [BULK-OFFLINE] Événement bulk en attente: ${pendingId}`,
          );
          return pendingId;
        } catch (queueErr) {
          console.error(
            `❌ [BULK] Erreur mise en attente: ${queueErr.message}`,
          );
          throw queueErr;
        }
      }
    } catch (error) {
      console.error("❌ Erreur publication bulk:", error.message);
      console.error("Stack trace:", error.stack);
      return null;
    }
  }

  /**
   * ✅ PUBLIER UNE NOTIFICATION
   */
  async publishNotification(userId, title, message, type = "INFO") {
    if (!this.redis) return null;

    try {
      const streamId = await this.addToStream(
        this.EVENT_STREAMS.NOTIFICATIONS,
        {
          userId: userId.toString(),
          title: title.substring(0, 100),
          message: message.substring(0, 500),
          type: type,
          timestamp: new Date().toISOString(),
          publishedAt: Date.now().toString(),
        },
      );

      console.log(`🔔 Notification publiée: ${streamId}`);
      return streamId;
    } catch (error) {
      console.error("❌ Erreur publication notification:", error.message);
      return null;
    }
  }

  /**
   * ✅ PUBLIER UN MESSAGE SYSTÈME (groupe créé, membre ajouté, etc.)
   */
  async publishSystemMessage(messageData, options = {}) {
    if (!this.redis) return null;

    try {
      const streamName = options.stream || this.MESSAGE_STREAMS.GROUP;

      // ✅ CONSTRUIRE LES CHAMPS DU STREAM
      const fields = {
        messageId: `system_${Date.now()}`,
        conversationId: messageData.conversationId,
        senderId: messageData.senderId || "system",
        senderName: messageData.senderName || "Système",
        type: messageData.type || "SYSTEM",
        subType: messageData.subType || "INFO",
        content: messageData.content,
        participants: JSON.stringify(messageData.participants || []),
        metadata: JSON.stringify(messageData.metadata || {}),
        createdAt: new Date().toISOString(),
        ts: Date.now().toString(),
      };

      // ✅ AJOUTER AU STREAM (résilient avec WAL, retry, etc.)
      const streamId = await this.addToStream(streamName, fields);
      console.log(
        `📢 Message système publié (${messageData.subType}): ${streamId}`,
      );

      // ✅ OPTIONNEL : ÉMETTRE IMMÉDIATEMENT VIA SOCKET.IO AUX CONNECTÉS
      if (this.io && messageData.conversationId) {
        try {
          this.io.to(messageData.conversationId).emit("newMessage", {
            id: fields.messageId,
            conversationId: messageData.conversationId,
            senderId: messageData.senderId || "system",
            senderName: messageData.senderName || "Système",
            type: messageData.type || "SYSTEM",
            subType: messageData.subType,
            content: messageData.content,
            participants: messageData.participants,
            metadata: messageData.metadata,
            createdAt: fields.createdAt,
            status: "DELIVERED",
          });
          console.log(
            `✅ Message système émis Socket.IO à ${messageData.conversationId}`,
          );
        } catch (socketError) {
          console.warn(
            "⚠️ Erreur émission Socket.IO message système:",
            socketError.message,
          );
        }
      }

      return streamId;
    } catch (error) {
      console.error("❌ Erreur publication message système:", error.message);
      return null;
    }
  }

  /**
   * ✅ PUBLIER UN ÉVÉNEMENT DE CONVERSATION (création, mise à jour, participants)
   */
  async publishConversationEvent(eventType, conversationData) {
    if (!this.redis) return null;

    try {
      // ✅ DÉTERMINER LE STREAM SELON LE TYPE D'ÉVÉNEMENT
      let streamName;
      switch (eventType) {
        case "CONVERSATION_CREATED":
          streamName =
            this.streamManager.EVENT_STREAMS.CONVERSATION_EVENTS.CREATED;
          break;
        case "CONVERSATION_UPDATED":
          streamName =
            this.streamManager.EVENT_STREAMS.CONVERSATION_EVENTS.UPDATED;
          break;
        case "PARTICIPANT_ADDED":
          streamName =
            this.streamManager.EVENT_STREAMS.CONVERSATION_EVENTS
              .PARTICIPANT_ADDED;
          break;
        case "PARTICIPANT_REMOVED":
          streamName =
            this.streamManager.EVENT_STREAMS.CONVERSATION_EVENTS
              .PARTICIPANT_REMOVED;
          break;
        case "CONVERSATION_DELETED":
          streamName =
            this.streamManager.EVENT_STREAMS.CONVERSATION_EVENTS.DELETED;
          break;
        default:
          console.warn(
            `⚠️ Type d'événement conversation inconnu: ${eventType}`,
          );
          return null;
      }

      // ✅ CONSTRUIRE LES CHAMPS DU STREAM
      const fields = {
        eventType,
        conversationId: conversationData.conversationId || conversationData._id,
        timestamp: new Date().toISOString(),
        ts: Date.now().toString(),
      };

      // ✅ AJOUTER LES CHAMPS SPÉCIFIQUES SELON LE TYPE
      if (eventType === "CONVERSATION_CREATED") {
        fields.name = conversationData.name;
        fields.type = conversationData.type;
        fields.createdBy = conversationData.createdBy;
        fields.participants = JSON.stringify(
          conversationData.participants || [],
        );
      } else if (eventType === "CONVERSATION_UPDATED") {
        fields.name = conversationData.name;
        fields.updatedBy = conversationData.updatedBy;
        fields.changes = JSON.stringify(conversationData.changes || {});
      } else if (eventType === "PARTICIPANT_ADDED") {
        fields.participantId = conversationData.participantId;
        fields.participantName = conversationData.participantName;
        fields.addedBy = conversationData.addedBy;
      } else if (eventType === "PARTICIPANT_REMOVED") {
        fields.participantId = conversationData.participantId;
        fields.participantName = conversationData.participantName;
        fields.removedBy = conversationData.removedBy;
      } else if (eventType === "CONVERSATION_DELETED") {
        fields.deletedBy = conversationData.deletedBy;
      }

      // ✅ AJOUTER AU STREAM
      const streamId = await this.addToStream(streamName, fields);
      console.log(
        `🏢 Événement conversation publié (${eventType}): ${streamId}`,
      );

      return streamId;
    } catch (error) {
      console.error(
        "❌ Erreur publication événement conversation:",
        error.message,
      );
      return null;
    }
  }

  // ===== RECEIVE MESSAGE =====

  async receiveMessage(messageData) {
    const startTime = Date.now();

    try {
      // ✅ ÉTAPE 0 : RÉCUPÉRER LES PARTICIPANTS AVANT TOUT
      let conversationParticipants = [];
      if (messageData.conversationId && this.mongoRepository) {
        try {
          const conversation = await this.mongoRepository.findById(
            messageData.conversationId,
          );

          if (conversation) {
            conversationParticipants = conversation.participants || [];
            console.log(
              `👥 Participants trouvés: ${conversationParticipants
                .map((p) => p.userId || p)
                .join(", ")}`,
            );
          }
        } catch (convError) {
          console.warn(
            "⚠️ Erreur récupération participants:",
            convError.message,
          );
        }
      }

      // ✅ ÉTAPE 1 : LOG PRE-WRITE
      const walId = await this.logPreWrite(messageData);

      // ✅ ÉTAPE 2 : SAUVEGARDE AVEC CIRCUIT BREAKER
      let savedMessage;
      try {
        savedMessage = await this.circuitBreaker.execute(() =>
          this.messageRepository.save(messageData),
        );

        this.metrics.successfulSaves++;

        // ✅ ÉTAPE 3 : PUBLICATION AVEC PARTICIPANTS
        const publishStartTime = Date.now();
        await this.publishToMessageStream(savedMessage, {
          event: "NEW_MESSAGE",
          source: "mongodb_write",
          conversationParticipants: conversationParticipants, // ✅ PASSER LES PARTICIPANTS
        });
        const publishTime = Date.now() - publishStartTime;

        // ✅ ÉTAPE 4 : LOG POST-WRITE
        await this.logPostWrite(savedMessage._id, walId);

        // ✅ MÉTRIQUES
        const mongoTime = Date.now() - startTime - publishTime;
        const totalTime = Date.now() - startTime;
        this.metrics.totalMessages++;
        this.metrics.avgProcessingTime =
          (this.metrics.avgProcessingTime + totalTime) / 2;

        console.log(`✅ Message reçu et publié:`, {
          messageId: savedMessage._id,
          mongoTime: `${mongoTime}ms`,
          publishTime: `${publishTime}ms`,
          totalTime: `${totalTime}ms`,
          hasParticipants: conversationParticipants.length > 0,
        });

        return {
          success: true,
          message: savedMessage,
          metrics: { mongoTime, publishTime, totalTime },
        };
      } catch (saveError) {
        console.error(`❌ Erreur sauvegarde:`, saveError.message);

        // ✅ RETRY AUTOMATIQUE
        if (saveError.retryable !== false) {
          await this.addRetry(messageData, 1, saveError);
        }

        // ✅ FALLBACK REDIS
        if (this.redis) {
          try {
            const fallbackMessage = await this.redisFallback(messageData);
            console.log(`✅ Fallback activé: ${fallbackMessage._id}`);

            // ✅ PUBLIER LE FALLBACK AUSSI AVEC PARTICIPANTS
            await this.publishToMessageStream(fallbackMessage, {
              event: "NEW_MESSAGE",
              source: "redis_fallback",
              conversationParticipants: conversationParticipants, // ✅ ICI AUSSI
            });

            return fallbackMessage;
          } catch (fallbackError) {
            // ✅ DEAD LETTER QUEUE EN DERNIER RECOURS
            await this.addToDLQ(messageData, saveError, 1, {
              operation: "receiveMessage",
              walId,
              poison: true,
            });
            throw fallbackError;
          }
        }
      }
    } catch (error) {
      console.error("❌ Erreur receiveMessage:", error);
      throw error;
    }
  }

  /**
   * ✅ SYNCHRONISER LES MESSAGES MONGODB EXISTANTS VERS REDIS STREAMS
   * Appelé au démarrage pour remplir les streams avec l'historique
   */
  async syncExistingMessagesToStream() {
    if (!this.redis || !this.mongoRepository) {
      console.warn("⚠️ Redis ou mongoRepository non disponible pour sync");
      return;
    }

    try {
      console.log("🔄 SYNCHRONISATION DÉMARRÉE: MongoDB → Redis Streams");

      // ✅ RÉCUPÉRER TOUTES LES CONVERSATIONS ACTIVES (30 derniers jours)
      let synced = 0;
      let errors = 0;

      try {
        // Récupérer les conversations récentes
        const conversations = await this.mongoConversationRepository.findAll({
          query: {
            updatedAt: {
              $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
          limit: 100,
          sort: { updatedAt: -1 },
        });

        console.log(
          `📋 ${conversations.length} conversation(s) à synchroniser`,
        );

        for (const conversation of conversations) {
          try {
            const conversationId = conversation._id || conversation.id;
            const participants = conversation.participants || [];

            // ✅ RÉCUPÉRER LES MESSAGES DE CETTE CONVERSATION
            let page = 1;
            const limit = 50;
            let hasMore = true;

            while (hasMore) {
              try {
                const result = await this.mongoRepository.findByConversation(
                  conversationId,
                  { page, limit, sort: { createdAt: 1 } }, // Plus ancien en premier
                );

                const messages = result.messages || result || [];

                if (messages.length === 0) {
                  hasMore = false;
                  break;
                }

                // ✅ PUBLIER CHAQUE MESSAGE DANS LE BON STREAM
                for (const message of messages) {
                  try {
                    await this.publishToMessageStream(message, {
                      event: "EXISTING_MESSAGE",
                      source: "initial_sync",
                      conversationParticipants: participants,
                    });

                    synced++;

                    // Petit délai pour ne pas surcharger Redis
                    await new Promise((resolve) => setTimeout(resolve, 10));
                  } catch (msgError) {
                    console.warn(
                      `⚠️ Erreur sync message ${message._id}:`,
                      msgError.message,
                    );
                    errors++;
                  }
                }

                // Vérifier s'il y a d'autres pages
                page++;
                if (messages.length < limit) {
                  hasMore = false;
                }
              } catch (pageError) {
                console.warn(
                  `⚠️ Erreur lecture page ${page} pour ${conversationId}:`,
                  pageError.message,
                );
                hasMore = false;
              }
            }
          } catch (convError) {
            console.warn(
              `⚠️ Erreur sync conversation ${conversation._id}:`,
              convError.message,
            );
            errors++;
          }
        }

        console.log(
          `✅ SYNCHRONISATION TERMINÉE: ${synced} message(s) publiés, ${errors} erreur(s)`,
        );

        // Log les statistiques
        const stats = await this.getStreamStats();
        console.log("📊 État des streams après sync:", stats);

        return { synced, errors };
      } catch (error) {
        console.error("❌ Erreur synchronisation global:", error);
        return { synced: 0, errors: 1 };
      }
    } catch (error) {
      console.error("❌ Erreur critique syncExistingMessagesToStream:", error);
      return { synced: 0, errors: 1 };
    }
  }

  /**
   * ✅ OBTENIR LES STATISTIQUES DES STREAMS
   */
  async getStreamStats() {
    if (!this.redis) return null;

    try {
      const stats = {};

      for (const [streamName, maxLen] of Object.entries(this.STREAM_MAXLEN)) {
        try {
          const length = await this.redis.xLen(streamName);
          stats[streamName] = {
            current: length,
            max: maxLen,
            usage: ((length / maxLen) * 100).toFixed(2) + "%",
          };
        } catch (err) {
          stats[streamName] = { error: err.message };
        }
      }

      return stats;
    } catch (error) {
      console.error("❌ Erreur getStreamStats:", error);
      return null;
    }
  }

  // ===== MÉTRIQUES ET SANTÉ =====

  /**
   * ✅ OBTENIR LES MÉTRIQUES DU SERVICE
   * Fusionne les metrics locales du service avec celles des workers
   */
  getMetrics() {
    try {
      const workerMetrics = this.workerManager
        ? this.workerManager.getAllMetrics()
        : {};

      return {
        // Métriques du service
        service: {
          totalMessages: this.metrics.totalMessages,
          successfulSaves: this.metrics.successfulSaves,
          fallbackActivations: this.metrics.fallbackActivations,
          retryCount: this.metrics.retryCount,
          dlqCount: this.metrics.dlqCount,
          avgProcessingTime: this.metrics.avgProcessingTime,
          peakMemoryMB: this.metrics.peakMemoryMB,
          privateMessagesPublished: this.metrics.privateMessagesPublished,
          groupMessagesPublished: this.metrics.groupMessagesPublished,
          typingEventsPublished: this.metrics.typingEventsPublished,
          lastReportTime: this.metrics.lastReportTime,
        },
        // Métriques des workers (orchestrées par WorkerManager)
        workers: workerMetrics.workers || {},
        uptime: workerMetrics.uptime || process.uptime(),
        circuitBreakerState: this.circuitBreaker?.state || "CLOSED",
      };
    } catch (error) {
      console.error("❌ Erreur getMetrics:", error);
      return {
        error: error.message,
        service: this.metrics,
      };
    }
  }

  /**
   * ✅ OBTENIR L'ÉTAT DE SANTÉ DU SERVICE
   */
  getHealthStatus() {
    try {
      const workerHealth = this.workerManager
        ? this.workerManager.getHealthStatus()
        : {};
      const streamStats = this.getStreamStats ? this.getStreamStats() : {};

      return {
        status: this.isRunning ? "RUNNING" : "STOPPED",
        circuitBreaker: this.circuitBreaker?.state || "UNKNOWN",
        workers: workerHealth,
        streams: streamStats,
        redis: this.redis ? "CONNECTED" : "DISCONNECTED",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Erreur getHealthStatus:", error);
      return {
        status: "ERROR",
        error: error.message,
      };
    }
  }

  // ===== GESTION DES DOUBLONS =====

  /**
   * ✅ SUPPRIMER LES DOUBLONS D'UN STREAM SPÉCIFIQUE
   */
  async removeDuplicatesFromStream(streamKey = null) {
    if (!this.redis) {
      console.warn("⚠️ Redis non disponible pour suppression doublons");
      return 0;
    }

    try {
      // Par défaut, nettoyer tous les streams de messages
      const streamsToClean = streamKey
        ? [streamKey]
        : [
            this.MESSAGE_STREAMS.PRIVATE,
            this.MESSAGE_STREAMS.GROUP,
            this.STREAMS.MESSAGES,
          ];

      let totalDuplicatesRemoved = 0;

      for (const stream of streamsToClean) {
        try {
          console.log(`🔍 Analyse des doublons dans ${stream}...`);

          // 1. ✅ RÉCUPÉRER TOUS LES MESSAGES DU STREAM
          const allMessages = await this.redis.xRange(stream, "-", "+");

          if (allMessages.length === 0) {
            console.log(`ℹ️ Stream ${stream} est vide`);
            continue;
          }

          // 2. ✅ IDENTIFIER LES DOUBLONS PAR messageId
          const seen = new Set();
          const duplicates = [];
          const messageIdToEntries = new Map();

          for (const entry of allMessages) {
            const entryId = Array.isArray(entry) ? entry[0] : entry.id;
            const fields = Array.isArray(entry)
              ? Object.fromEntries(
                  Array.from({ length: entry[1].length / 2 }, (_, i) => [
                    entry[1][i * 2],
                    entry[1][i * 2 + 1],
                  ]),
                )
              : entry.message;

            const messageId = fields.messageId || fields.id;

            if (!messageId || messageId === "") {
              console.warn(`⚠️ Message sans ID trouvé: ${entryId}`);
              continue;
            }

            if (!messageIdToEntries.has(messageId)) {
              messageIdToEntries.set(messageId, []);
            }
            messageIdToEntries.get(messageId).push({ entryId, fields });

            if (seen.has(messageId)) {
              duplicates.push(entryId);
            } else {
              seen.add(messageId);
            }
          }

          console.log(
            `📊 Stream ${stream}: ${allMessages.length} entrées, ${seen.size} uniques, ${duplicates.length} doublon(s)`,
          );

          // 3. ✅ ANALYSE DÉTAILLÉE DES DOUBLONS
          if (duplicates.length > 0) {
            console.log(
              `🔍 Analyse détaillée des ${duplicates.length} doublon(s):`,
            );

            for (const [messageId, entries] of messageIdToEntries.entries()) {
              if (entries.length > 1) {
                console.log(
                  `  📝 Message ${messageId}: ${entries.length} occurrences`,
                );

                // Garder le plus ancien (premier dans le stream)
                const sortedEntries = entries.sort((a, b) =>
                  a.entryId.localeCompare(b.entryId),
                );

                const toKeep = sortedEntries[0];
                const toRemove = sortedEntries.slice(1);

                console.log(`    ✅ Conserver: ${toKeep.entryId}`);
                toRemove.forEach((entry) => {
                  console.log(`    ❌ Supprimer: ${entry.entryId}`);
                });
              }
            }
          }

          // 4. ✅ SUPPRIMER LES DOUBLONS EN BATCH
          if (duplicates.length > 0) {
            const batchSize = 100;
            let removedCount = 0;

            for (let i = 0; i < duplicates.length; i += batchSize) {
              const batch = duplicates.slice(i, i + batchSize);

              try {
                await this.redis.xDel(stream, ...batch);
                removedCount += batch.length;
                console.log(
                  `🗑️ Batch ${Math.ceil((i + 1) / batchSize)}: ${
                    batch.length
                  } doublons supprimés`,
                );

                // Petit délai pour ne pas surcharger Redis
                if (i + batchSize < duplicates.length) {
                  await new Promise((resolve) => setTimeout(resolve, 100));
                }
              } catch (delError) {
                console.error(`❌ Erreur suppression batch:`, delError.message);
              }
            }

            totalDuplicatesRemoved += removedCount;
            console.log(
              `✅ ${removedCount} doublon(s) supprimé(s) de ${stream}`,
            );
          } else {
            console.log(`✅ Aucun doublon dans ${stream}`);
          }
        } catch (streamError) {
          console.error(
            `❌ Erreur analyse stream ${stream}:`,
            streamError.message,
          );
        }
      }

      if (totalDuplicatesRemoved > 0) {
        console.log(
          `🎉 NETTOYAGE TERMINÉ: ${totalDuplicatesRemoved} doublon(s) supprimé(s) au total`,
        );

        // ✅ LOGS DES STATISTIQUES APRÈS NETTOYAGE
        const stats = await this.getStreamStats();
        if (stats) {
          console.log("📊 État des streams après nettoyage:");
          console.table(stats);
        }
      } else {
        console.log("✨ Aucun doublon détecté dans les streams");
      }

      return totalDuplicatesRemoved;
    } catch (error) {
      console.error("❌ Erreur suppression doublons:", error);
      return 0;
    }
  }

  /**
   * ✅ NETTOYAGE COMPLET DE TOUT REDIS (Streams + données associées)
   * ⚠️ ATTENTION: Supprime TOUTES les données de chat Redis
   */
  async nukeAllRedisData() {
    if (!this.redis) {
      console.error("❌ Redis non disponible");
      return { success: false, error: "Redis non disponible" };
    }

    console.log("☢️ ===== NETTOYAGE COMPLET REDIS =====");
    console.warn(
      "⚠️ ATTENTION: Cette opération va supprimer TOUTES les données de chat Redis!",
    );

    try {
      // ✅ PATTERNS DE SUPPRESSION COMPLETS
      const patterns = [
        // 1. Streams principaux
        "chat:stream:*",

        // 2. Données de synchronisation
        "*sync*",
        "message-sync:*",

        // 3. Présence et utilisateurs en ligne
        "chat:cache:presence:*",
        "chat:cache:online:*",
        "chat:cache:user:*",
        "chat:cache:user_data:*",
        "chat:cache:user_sockets:*",

        // 4. Messages en attente et delivery
        "pending:messages:*",
        "pending:*",
        "delivery:*",

        // 5. Résilience et fallback
        "fallback:*",
        "retry:*",
        "wal:*",
        "dlq:*",

        // 6. Consumer groups et workers
        "*delivery-*",
        "consumer:*",

        // 7. Cache applicatif
        "chat:cache:*",
        "conversation:*",
        "conversations:*",
        "unread:*",
        "last_messages:*",
        "messages:*",

        // 8. Rooms et gestion temps-réel
        "chat:cache:rooms:*",
        "chat:cache:room_users:*",
        "chat:cache:room_data:*",
        "chat:cache:user_rooms:*",
        "chat:cache:room_state:*",
        "chat:cache:last_seen:*",

        // 9. Autres patterns possibles
        "file:*",
        "cache:*",
      ];

      let totalDeleted = 0;
      const results = {};
      const startTime = Date.now();

      // ✅ SUPPRESSION PAR PATTERNS
      for (const pattern of patterns) {
        try {
          console.log(`🔍 Recherche pattern: ${pattern}`);

          let cursor = 0;
          let keysForPattern = [];

          // Utiliser SCAN pour éviter de bloquer Redis
          do {
            const result = await this.redis.scan(cursor, {
              MATCH: pattern,
              COUNT: 1000,
            });

            cursor = result.cursor;
            keysForPattern.push(...result.keys);
          } while (cursor !== 0);

          if (keysForPattern.length > 0) {
            console.log(
              `🗑️ ${keysForPattern.length} clé(s) avec pattern: ${pattern}`,
            );

            // ✅ SUPPRESSION PAR BATCH POUR PERFORMANCE
            const batchSize = 100;
            let deletedForPattern = 0;

            for (let i = 0; i < keysForPattern.length; i += batchSize) {
              const batch = keysForPattern.slice(i, i + batchSize);

              try {
                const deleted = await this.redis.del(...batch);
                deletedForPattern += deleted;

                // Log progression
                if (keysForPattern.length > batchSize) {
                  console.log(
                    `    📦 Batch ${Math.ceil((i + 1) / batchSize)}/${Math.ceil(
                      keysForPattern.length / batchSize,
                    )}: ${deleted} clé(s) supprimée(s)`,
                  );
                }

                // Petit délai pour ne pas surcharger Redis
                if (i + batchSize < keysForPattern.length) {
                  await new Promise((resolve) => setTimeout(resolve, 10));
                }
              } catch (batchError) {
                console.error(
                  `❌ Erreur suppression batch:`,
                  batchError.message,
                );
              }
            }

            totalDeleted += deletedForPattern;
            results[pattern] = deletedForPattern;
          } else {
            results[pattern] = 0;
          }
        } catch (patternError) {
          console.warn(`⚠️ Erreur pattern ${pattern}:`, patternError.message);
          results[pattern] = { error: patternError.message };
        }
      }

      // ✅ SUPPRIMER LES CLÉS SPÉCIFIQUES CONNUES
      console.log("🎯 Suppression des clés spécifiques...");

      const specificKeys = [
        "online:users",
        "messages:stream",
        "retry:stream",
        "wal:stream",
        "fallback:stream",
        "dlq:stream",
        "chat:stream:messages:private",
        "chat:stream:messages:group",
        "chat:stream:events:typing",
        "chat:stream:message_status",
        "chat:stream:messages:system",
        "active:conversations",
        "global:stats",
      ];

      for (const key of specificKeys) {
        try {
          const deleted = await this.redis.del(key);
          if (deleted > 0) {
            totalDeleted += deleted;
            results[`specific:${key}`] = deleted;
          }
        } catch (keyError) {
          console.warn(`⚠️ Erreur suppression ${key}:`, keyError.message);
          results[`specific:${key}`] = { error: keyError.message };
        }
      }

      // ✅ NETTOYER TOUS LES CONSUMER GROUPS
      console.log("🧹 Nettoyage des consumer groups...");

      try {
        const streamKeys = await this.redis.keys("stream:*");
        let groupsDestroyed = 0;

        for (const streamKey of streamKeys) {
          try {
            const groups = await this.redis.xInfoGroups(streamKey);

            for (const group of groups) {
              try {
                await this.redis.xGroupDestroy(streamKey, group.name);
                groupsDestroyed++;
              } catch (destroyError) {
                // Ignorer si le groupe n'existe pas
              }
            }
          } catch (infoError) {
            // Ignorer si le stream n'existe pas ou pas de groupes
          }
        }

        if (groupsDestroyed > 0) {
          results["consumer:groups"] = groupsDestroyed;
          console.log(`✅ ${groupsDestroyed} consumer group(s) supprimé(s)`);
        }
      } catch (groupsError) {
        console.warn(
          "⚠️ Erreur suppression consumer groups:",
          groupsError.message,
        );
        results["consumer:groups"] = { error: groupsError.message };
      }

      // ✅ STATISTIQUES FINALES
      const duration = Date.now() - startTime;

      console.log(`✅ NETTOYAGE TERMINÉ en ${duration}ms`);
      console.log(`🗑️ Total: ${totalDeleted} clé(s) supprimée(s)`);
      console.log("📊 Résultats détaillés:");

      // Afficher les résultats triés
      const sortedResults = Object.entries(results)
        .filter(([_, value]) => typeof value === "number" && value > 0)
        .sort(([, a], [, b]) => b - a);

      if (sortedResults.length > 0) {
        console.table(Object.fromEntries(sortedResults));
      }

      // ✅ VÉRIFICATION FINALE
      console.log("🔍 Vérification finale...");

      const remainingChatKeys = await this.redis.keys("stream:*");
      const totalRemainingKeys = await this.redis.dbSize();

      console.log(`📋 ${remainingChatKeys.length} stream(s) restant(s)`);
      console.log(
        `📊 ${totalRemainingKeys} clé(s) totales restantes dans Redis`,
      );

      // ✅ RÉINITIALISER LES MÉTRIQUES
      if (this.metrics) {
        this.metrics = {
          ...this.metrics,
          totalMessages: 0,
          successfulSaves: 0,
          fallbackActivations: 0,
          retryCount: 0,
          dlqCount: 0,
          privateMessagesPublished: 0,
          groupMessagesPublished: 0,
          typingEventsPublished: 0,
        };
      }

      console.log("🎉 NETTOYAGE COMPLET TERMINÉ AVEC SUCCÈS!");

      return {
        success: true,
        totalDeleted,
        duration: `${duration}ms`,
        results,
        remainingChatKeys: remainingChatKeys.length,
        totalRemainingKeys,
        patterns: patterns.length,
      };
    } catch (error) {
      console.error("❌ Erreur critique nettoyage complet Redis:", error);

      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }

  /**
   * ✅ NETTOYAGE SÉLECTIF PAR CATÉGORIE
   */
  async cleanRedisCategory(category) {
    if (!this.redis) {
      console.error("❌ Redis non disponible");
      return { success: false, error: "Redis non disponible" };
    }

    const categories = {
      streams: ["chat:stream:*"],
      users: [
        "chat:cache:presence:*",
        "chat:cache:online:*",
        "chat:cache:user:*",
        "chat:cache:user_data:*",
        "chat:cache:last_seen:*",
        "chat:cache:user_sockets:*",
        "chat:cache:user_sockets_set:*",
      ],
      messages: ["pending:messages:*", "messages:*", "last_messages:*"],
      cache: ["chat:cache:*", "conversation:*", "conversations:*"],
      rooms: [
        "chat:cache:rooms:*",
        "chat:cache:room_users:*",
        "chat:cache:room_data:*",
        "chat:cache:user_rooms:*",
        "chat:cache:room_state:*",
      ],
      resilience: ["fallback:*", "retry:*", "wal:*", "dlq:*"],
    };

    if (!categories[category]) {
      return {
        success: false,
        error: `Catégorie inconnue. Disponibles: ${Object.keys(categories).join(
          ", ",
        )}`,
      };
    }

    console.log(`🧹 Nettoyage catégorie: ${category}`);

    const patterns = categories[category];
    let totalDeleted = 0;

    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        const deleted = await this.redis.del(...keys);
        totalDeleted += deleted;
        console.log(
          `✅ ${deleted} clé(s) supprimée(s) pour pattern: ${pattern}`,
        );
      }
    }

    return {
      success: true,
      category,
      totalDeleted,
      patterns: patterns.length,
    };
  }

  // ===== ARRÊT COMPLET =====

  stopAll() {
    console.log("🛑 Arrêt complet du service...");

    // ✅ Arrêter les workers via WorkerManager (gère MemoryMonitor, MetricsReporting, StreamMonitoring)
    this.workerManager.stopAll();

    // ✅ Arrêter le nettoyage des doublons si actif
    if (this.stopDuplicateCleanup) {
      this.stopDuplicateCleanup();
    }

    console.log("✅ Service arrêté complètement");
  }

  async findById(conversationId, options = {}) {
    const { useCache = true } = options;

    try {
      let cacheKey = null;

      console.log("📌 [CACHED] conversationId:", conversationId);
      console.log("📌 [CACHED] useCache:", useCache);

      if (useCache && this.cache) {
        cacheKey = `${this.cacheKeyPrefix}:id:${conversationId}`;

        const cached = await this.cache.get(cacheKey);
        console.log(`📌 [CACHED] Résultat cache:`, cached ? "HIT" : "MISS");

        if (cached) {
          console.log(
            `✅ [CACHED] Conversation depuis cache: ${conversationId}`,
          );
          await this.cache.renewTTL(cacheKey, this.defaultTTL);
          // ✅ RETOURNER DIRECTEMENT LA CONVERSATION (pas d'objet wrapper)
          return cached;
        }
      }

      // ✅ CACHE MISS → MongoDB
      console.log(`🔍 Conversation depuis MongoDB: ${conversationId}`);

      const conversation = await this.primaryStore.findById(conversationId);

      if (!conversation) {
        throw new Error(`Conversation ${conversationId} non trouvée`);
      }

      // ✅ METTRE EN CACHE
      if (useCache && this.cache && cacheKey) {
        await this.cache.set(cacheKey, conversation, this.defaultTTL);
        console.log(`💾 Conversation mise en cache: ${conversationId}`);
      }

      // ✅ RETOURNER DIRECTEMENT LA CONVERSATION (CORRECTION MAJEURE)
      return conversation;
    } catch (error) {
      console.error("❌ [CACHED] Erreur findById conversation:", error.message);
      throw error;
    }
  }
}

module.exports = ResilientMessageService;
