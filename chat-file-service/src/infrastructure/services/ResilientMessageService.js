/**
 * ResilientMessageService - Service COMPLET de résilience
 * ✅ Écrit ET lit les streams
 * ✅ Gère les retries automatiques
 * ✅ Nettoie la mémoire
 * ✅ Un seul point de vérité pour la logique résiliente
 */

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000;
    this.fallback = options.fallback || null;

    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = "CLOSED";
  }

  async execute(operation) {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = "HALF_OPEN";
      } else {
        if (this.fallback) {
          console.warn("⚠️ Circuit ouvert, utilisation du fallback");
          return await this.fallback();
        }
        throw new Error("Circuit breaker ouvert");
      }
    }

    try {
      const result = await operation();

      if (this.state === "HALF_OPEN") {
        this.state = "CLOSED";
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.failureThreshold) {
        this.state = "OPEN";
        console.error(
          `❌ Circuit breaker ouvert après ${this.failureCount} échecs`
        );
      }

      throw error;
    }
  }
}

class ResilientMessageService {
  constructor(
    redisClient,
    messageRepository,
    mongoRepository = null,
    io = null
  ) {
    this.redis = redisClient;
    this.messageRepository = messageRepository;
    this.mongoRepository = mongoRepository;
    this.io = io;

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 30000,
      fallback: this.redisFallback.bind(this),
    });

    this.maxRetries = 5;

    // ✅ STREAMS CONFIGURATION
    this.STREAMS = {
      WAL: "wal:stream",
      RETRY: "retry:stream",
      DLQ: "dlq:stream",
      FALLBACK: "fallback:stream",
      MESSAGES: "messages:stream",
    };

    // ✅ CONFIGURATION SIMPLE DES TAILLES
    // Ces valeurs sont APPLIQUÉES dans addToStream()
    this.STREAM_MAXLEN = {
      [this.STREAMS.MESSAGES]: 5000, // 5k messages (grand buffer)
      [this.STREAMS.RETRY]: 5000, // 5k retries
      [this.STREAMS.WAL]: 10000, // 10k WAL entries
      [this.STREAMS.FALLBACK]: 5000, // 5k fallbacks
      [this.STREAMS.DLQ]: 1000, // 1k erreurs
    };

    // ✅ MÉTRIQUES
    this.metrics = {
      totalMessages: 0,
      successfulSaves: 0,
      fallbackActivations: 0,
      retryCount: 0,
      dlqCount: 0,
      avgProcessingTime: 0,
      peakMemoryMB: 0,
      lastReportTime: Date.now(),
    };

    this.memoryLimitMB = parseInt(process.env.REDIS_MEMORY_LIMIT_MB) || 512;
    this.memoryWarningThreshold = 0.8;

    this.workers = {
      retryWorker: null,
      fallbackWorker: null,
      walRecoveryWorker: null,
      dlqMonitor: null,
    };

    this.isRunning = false;
    this.batchSize = 10;
    this.processingDelayMs = 1000;

    if (this.redis) {
      // this.initConsumerGroups();
      this.startMemoryMonitor();
      this.startMetricsReporting();
      this.startStreamMonitoring();
    }

    console.log(
      "✅ ResilientMessageService initialisé (Auto-trim Redis MAXLEN)"
    );
  }

  // ===== DETECTION REDIS CLIENT =====

  isIoRedis() {
    if (!this.redis) return false;
    if (typeof this.redis.getBuiltinCommands === "function") return true;
    if (this.redis.status !== undefined) return true;
    return false;
  }

  // ===== WRAPPER UNIVERSEL - LA CLEF ! =====

  /**
   * ✅ AJOUTER À UN STREAM AVEC MAXLEN APPLIQUÉ IMMÉDIATEMENT
   * Redis gère le trim automatiquement à chaque écriture
   */
  async addToStream(streamName, fields) {
    if (!this.redis) return null;

    try {
      // ✅ NORMALISER LES CHAMPS - TOUS LES CHAMPS DOIVENT ÊTRE DES CHAÎNES
      const normalizedFields = {};

      for (const [key, value] of Object.entries(fields || {})) {
        let stringValue = "";

        if (value === null || value === undefined) {
          stringValue = "";
        } else if (typeof value === "string") {
          stringValue = value;
        } else if (typeof value === "object") {
          stringValue = JSON.stringify(value);
        } else {
          stringValue = String(value);
        }

        normalizedFields[key] = stringValue;
      }

      // ✅ VÉRIFIER QUE LE CHAMP 'data' N'EST PAS VIDE (critiques)
      if (
        normalizedFields.data === "" ||
        normalizedFields.data === "undefined"
      ) {
        console.warn(
          `⚠️ ATTENTION: Champ 'data' vide ou undefined dans ${streamName}`,
          { fields: Object.keys(fields) }
        );
      }

      // ✅ ÉCRIRE DANS LE STREAM
      const streamId = await this.redis.xAdd(streamName, "*", normalizedFields);

      // ✅ TRIMMER LE STREAM APRÈS (ne pas ralentir la rédaction)
      const maxLen = this.STREAM_MAXLEN[streamName];
      if (maxLen !== undefined) {
        try {
          // Faire un trim asynchrone sans attendre
          this.redis.xTrim(streamName, "~", maxLen).catch(() => {
            // Ignorer les erreurs de trim
          });
        } catch (trimErr) {
          // Ignorer
        }
      }

      return streamId;
    } catch (err) {
      console.warn(`⚠️ Erreur addToStream ${streamName}:`, err.message);
      try {
        // Fallback simple
        const normalizedFields = {};
        for (const [key, value] of Object.entries(fields || {})) {
          normalizedFields[key] = String(
            value === null || value === undefined ? "" : value
          );
        }
        return await this.redis.xAdd(streamName, "*", normalizedFields);
      } catch (finalErr) {
        console.error(`❌ xAdd échoué:`, finalErr.message);
        return null;
      }
    }
  }

  // ===== INITIALISATION =====

  // async initConsumerGroups() {
  //   try {
  //     const groupConfigs = {
  //       [this.STREAMS.RETRY]: "retry-workers",
  //       [this.STREAMS.DLQ]: "dlq-processors",
  //       [this.STREAMS.FALLBACK]: "fallback-workers",
  //     };

  //     for (const [stream, group] of Object.entries(groupConfigs)) {
  //       try {
  //         // ✅ CRÉER LE GROUPE DE CONSOMMATEURS (créera le stream s'il n'existe pas)
  //         // PAS BESOIN DE CRÉER UNE ENTRÉE D'INIT !
  //         await this.redis.xGroupCreate(stream, group, "$", {
  //           MKSTREAM: true,
  //         });
  //         console.log(`✅ Stream ${stream} + Consumer group ${group} créés`);
  //       } catch (err) {
  //         if (err.message.includes("BUSYGROUP")) {
  //           console.log(`ℹ️ Consumer group ${group} existe déjà`);
  //         } else {
  //           console.warn(`⚠️ Erreur création groupe:`, err.message);
  //         }
  //       }
  //     }
  //   } catch (err) {
  //     console.warn("⚠️ Erreur init consumer groups:", err.message);
  //   }
  // }

  // ===== MONITORING MÉMOIRE =====

  async startMemoryMonitor() {
    if (!this.redis) return;

    this.memoryMonitorInterval = setInterval(async () => {
      try {
        const info = await this.redis.info("memory");
        const usedMemoryMatch = info.match(/used_memory:(\d+)/);
        if (!usedMemoryMatch) return;

        const usedMemoryMB = parseInt(usedMemoryMatch[1]) / 1024 / 1024;
        this.metrics.peakMemoryMB = Math.max(
          this.metrics.peakMemoryMB,
          usedMemoryMB
        );

        const warningLevel = this.memoryLimitMB * this.memoryWarningThreshold;

        if (usedMemoryMB > warningLevel) {
          console.warn(
            `⚠️ Mémoire Redis: ${usedMemoryMB.toFixed(2)}MB / ${
              this.memoryLimitMB
            }MB`
          );

          if (usedMemoryMB > this.memoryLimitMB * 0.9) {
            console.warn(
              "🚨 Alerte mémoire critique (Redis gère automatiquement via MAXLEN)"
            );
          }
        }
      } catch (err) {
        console.warn("⚠️ Erreur monitoring mémoire:", err.message);
      }
    }, 60000);

    console.log("✅ Memory monitor démarré");
  }

  // ===== MONITORING DES STREAMS =====

  async startStreamMonitoring() {
    if (!this.redis) return;

    console.log("🚀 Démarrage du monitoring des streams...");

    this.monitoringInterval = setInterval(async () => {
      try {
        const streamSizes = {};
        let totalSize = 0;

        for (const [streamName, maxLen] of Object.entries(this.STREAM_MAXLEN)) {
          try {
            const length = await this.redis.xLen(streamName);
            streamSizes[streamName] = {
              current: length,
              max: maxLen,
              usage: ((length / maxLen) * 100).toFixed(2) + "%",
            };
            totalSize += length;

            // ✅ Warning si vraiment dépassé (ne devrait PAS arriver)
            if (length > maxLen * 1.5) {
              console.warn(
                `⚠️ ${streamName} dépasse limites: ${length}/${maxLen}`
              );
            }
          } catch (err) {
            console.warn(`⚠️ Erreur monitoring ${streamName}:`, err.message);
          }
        }

        // Log toutes les 5 minutes
        if (Object.keys(this.metrics).length % 5 === 0) {
          console.log("📊 === ÉTAT DES STREAMS ===");
          console.table(streamSizes);
          console.log(`📊 Total: ${totalSize} entrées`);
        }
      } catch (error) {
        console.error("❌ Erreur stream monitoring:", error.message);
      }
    }, 60000);

    console.log("✅ Stream monitoring démarré");
  }

  // ===== MÉTRIQUES =====

  startMetricsReporting() {
    this.metricsInterval = setInterval(() => {
      const now = Date.now();
      const intervalMinutes = (now - this.metrics.lastReportTime) / 60000;

      console.log("📊 === MÉTRIQUES RÉSILIENCE ===");
      console.log(`📈 Période: ${intervalMinutes.toFixed(1)} min`);
      console.log(`📝 Messages traités: ${this.metrics.totalMessages}`);
      console.log(
        `✅ Saves réussies: ${this.metrics.successfulSaves} (${
          this.metrics.totalMessages > 0
            ? (
                (this.metrics.successfulSaves / this.metrics.totalMessages) *
                100
              ).toFixed(2)
            : 0
        }%)`
      );
      console.log(`🔄 Retries: ${this.metrics.retryCount}`);
      console.log(`⚠️ Fallback: ${this.metrics.fallbackActivations}`);
      console.log(`❌ DLQ: ${this.metrics.dlqCount}`);
      console.log(
        `⏱️ Temps moyen: ${this.metrics.avgProcessingTime.toFixed(2)}ms`
      );
      console.log(`💾 Mémoire pic: ${this.metrics.peakMemoryMB.toFixed(2)}MB`);
      console.log(`🔌 Circuit breaker: ${this.circuitBreaker.state}`);
      console.log("================================");

      // Reset metrics
      this.metrics.totalMessages = 0;
      this.metrics.successfulSaves = 0;
      this.metrics.retryCount = 0;
      this.metrics.fallbackActivations = 0;
      this.metrics.dlqCount = 0;
      this.metrics.lastReportTime = now;
      this.metrics.peakMemoryMB = 0;
    }, 3600000);

    console.log("✅ Metrics reporting démarré");
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

      // ✅ Supprimer le WAL incomplet après succès
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

      // ✅ VÉRIFIER QUE messageData N'EST PAS NULL
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

      // Stocker les données de fallback
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

      // Ajouter au stream FALLBACK avec MAXLEN
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
    console.log("🚀 Démarrage des workers internes...");

    try {
      this.workers.retryWorker = setInterval(
        () =>
          this.processRetries().catch((err) =>
            console.error("❌ processRetries:", err.message)
          ),
        this.processingDelayMs
      );

      this.workers.fallbackWorker = setInterval(
        () =>
          this.processFallback().catch((err) =>
            console.error("❌ processFallback:", err.message)
          ),
        this.processingDelayMs * 2
      );

      this.workers.walRecoveryWorker = setInterval(
        () =>
          this.processWALRecovery().catch((err) =>
            console.error("❌ processWALRecovery:", err.message)
          ),
        this.processingDelayMs * 3
      );

      this.workers.dlqMonitor = setInterval(
        () =>
          this.monitorDLQ().catch((err) =>
            console.error("❌ monitorDLQ:", err.message)
          ),
        5000
      );

      console.log("✅ Tous les workers démarrés");
    } catch (error) {
      console.error("❌ Erreur démarrage workers:", error);
      this.isRunning = false;
    }
  }

  stopWorkers() {
    if (!this.isRunning) return;

    console.log("🛑 Arrêt des workers...");
    Object.values(this.workers).forEach((worker) => {
      if (worker) clearInterval(worker);
    });

    this.isRunning = false;
    console.log("✅ Workers arrêtés");
  }

  // ===== PROCESS RETRIES =====

  async processRetries() {
    if (!this.redis) return;

    try {
      const retries = await this.redis.xRead(
        [{ key: this.STREAMS.RETRY, id: "0" }],
        { COUNT: this.batchSize }
      );

      if (!retries || retries.length === 0) return;

      // Le format retourné est: [{ key, messages: [...] }]
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
            // ✅ VÉRIFIER QUE message.data EXISTE ET N'EST PAS VIDE OU "undefined"
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
              message.data?.substring(0, 50)
            );
            // ✅ Supprimer seulement après echec de parsing
            await this.redis.xDel(this.STREAMS.RETRY, id);
            continue;
          }

          console.log(`🔄 Retry #${attempt} pour ${message.messageId}...`);

          try {
            const savedMessage = await this.messageRepository.save(messageData);
            console.log(`✅ Retry réussi: ${message.messageId}`);

            // ✅ Publier le message réussi
            await this.publishToMessageStream(savedMessage, {
              event: "NEW_MESSAGE",
              source: "retry",
            });

            // ✅ Supprimer du RETRY après succès
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
        { COUNT: this.batchSize }
      );

      if (!fallbacks || fallbacks.length === 0) return;

      // Le format retourné est: [{ key, messages: [...] }]
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
              `✅ Fallback rejoué: ${fallbackId} → ${mongoMessage._id}`
            );

            // ✅ Publier le message rejoué
            await this.publishToMessageStream(mongoMessage, {
              event: "NEW_MESSAGE",
              source: "fallback_replay",
            });

            // ✅ Nettoyer seulement après succès
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
              { operation: "processFallback", fallbackId, poison: true }
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
              ])
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
      const walTimeout = 60000; // 1 minute

      for (const [walId, walData] of incompleteWALs.entries()) {
        try {
          const age = now - walData.timestamp;

          if (age > walTimeout) {
            console.warn(
              `⚠️ WAL incomplet: ${walId} (${(age / 1000).toFixed(2)}s)`
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
                { operation: "processWALRecovery", walId, poison: true }
              );
            }

            // ✅ Supprimer le WAL incomplet
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
          { COUNT: 5 }
        );

        dlqMessages.forEach((msg) => {
          const fields = Array.isArray(msg)
            ? Object.fromEntries(
                Array.from({ length: msg[1].length / 2 }, (_, i) => [
                  msg[1][i * 2],
                  msg[1][i * 2 + 1],
                ])
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
   * ✅ PUBLIER UN MESSAGE DANS LE STREAM
   * Redis gère automatiquement le trim via MAXLEN
   */
  async publishToMessageStream(savedMessage, options = {}) {
    if (!this.redis) {
      console.warn("⚠️ Redis non disponible pour publish");
      return null;
    }

    try {
      const streamData = {
        messageId: savedMessage._id?.toString() || savedMessage.id,
        conversationId: savedMessage.conversationId?.toString(),
        senderId: savedMessage.senderId?.toString(),
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

      // ✅ MAXLEN APPLIQUÉ AUTOMATIQUEMENT ICI !
      const streamId = await this.addToStream(
        this.STREAMS.MESSAGES,
        streamData
      );

      console.log(`📤 Message publié dans stream: ${streamId}`);
      return streamId;
    } catch (error) {
      console.error("❌ Erreur publication stream:", error.message);
      return null;
    }
  }

  // ===== RECEIVE MESSAGE =====

  async receiveMessage(messageData) {
    const startTime = Date.now();

    try {
      // ✅ ÉTAPE 1 : LOG PRE-WRITE
      const walId = await this.logPreWrite(messageData);

      // ✅ ÉTAPE 2 : SAUVEGARDE AVEC CIRCUIT BREAKER
      let savedMessage;
      try {
        savedMessage = await this.circuitBreaker.execute(() =>
          this.messageRepository.save(messageData)
        );

        this.metrics.successfulSaves++;

        // ✅ ÉTAPE 3 : PUBLICATION
        const publishStartTime = Date.now();
        await this.publishToMessageStream(savedMessage, {
          event: "NEW_MESSAGE",
          source: "mongodb_write",
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
        });

        return {
          success: true,
          message: savedMessage,
          metrics: { mongoTime, publishTime, totalTime },
        };
      } catch (saveError) {
        console.error(`❌ Erreur sauvegarde:`, saveError.message);

        // ✅ RETRY
        if (saveError.retryable !== false) {
          await this.addRetry(messageData, 1, saveError);
        }

        // ✅ FALLBACK
        if (this.redis) {
          try {
            const fallbackMessage = await this.redisFallback(messageData);
            console.log(`✅ Fallback activé: ${fallbackMessage._id}`);

            await this.publishToMessageStream(fallbackMessage, {
              event: "NEW_MESSAGE",
              source: "redis_fallback",
            });

            return fallbackMessage;
          } catch (fallbackError) {
            // ✅ DLQ EN DERNIER RECOURS
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

  // ===== ARRÊT =====

  stopAll() {
    console.log("🛑 Arrêt complet du service...");

    this.stopWorkers();

    clearInterval(this.memoryMonitorInterval);
    clearInterval(this.metricsInterval);
    clearInterval(this.monitoringInterval);

    console.log("✅ Service arrêté complètement");
  }
}

module.exports = ResilientMessageService;
