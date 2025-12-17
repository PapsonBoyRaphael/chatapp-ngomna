// src/infrastructure/kafka/consumers/UserMessageDeliveryService.js

const { v4: uuidv4 } = require("uuid");

class UserMessageDeliveryService {
  constructor({ kafkaInstance, io, redisClient, updateMessageStatusUseCase }) {
    // ✅ VALIDATION STRICTE
    if (!kafkaInstance) throw new Error("kafkaInstance requis");
    if (!io) throw new Error("io (Socket.IO) requis");
    if (!redisClient) throw new Error("redisClient (Redis) requis");
    if (!updateMessageStatusUseCase)
      throw new Error("updateMessageStatusUseCase requis");

    this.kafka = kafkaInstance;
    this.io = io;
    this.redis = redisClient;
    this.updateStatus = updateMessageStatusUseCase;

    this.consumer = null;
    this.isRunning = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;

    this.groupId = "chat-delivery-group-v3";
    this.topic = "chat.messages";
    this.redisKeyPrefix = "conv:";
    this.redisTTL = 86400; // 24 heures

    // ✅ MÉTRIQUES
    this.metrics = {
      messagesProcessed: 0,
      messagesDelivered: 0,
      errorCount: 0,
      lastProcessTime: 0,
      startedAt: null,
    };
  }

  async start() {
    // ✅ PROTECTION DOUBLE-DÉMARRAGE
    if (this.isRunning) {
      console.log("⚠️ UserMessageDeliveryService déjà démarré");
      return;
    }

    if (this.isConnecting) {
      console.log("⚠️ UserMessageDeliveryService en cours de connexion...");
      return;
    }

    this.isConnecting = true;

    try {
      // ✅ CRÉER LE CONSUMER
      this.consumer = this.kafka.consumer({
        groupId: this.groupId,
        sessionTimeout: 60000,
        heartbeatInterval: 8000,
        rebalanceTimeout: 60000,
        metadataMaxAge: 300000,
        maxWaitTimeInMs: 5000,
        // ✅ RETRY AUTOMATIQUE
        retry: {
          initialRetryTime: 100,
          retries: 8,
          maxRetryTime: 30000,
          randomizationFactor: 0.2,
          multiplier: 2,
        },
      });

      console.log("🔌 Connexion à Kafka...");
      await this.consumer.connect();
      console.log("✅ UserMessageDeliveryService connecté à Kafka");

      // ✅ S'ABONNER AU TOPIC
      await this.consumer.subscribe({
        topic: this.topic,
        fromBeginning: false, // Seulement nouveaux messages
      });

      console.log(`📨 Abonné au topic: ${this.topic}`);

      // ✅ DÉMARRER LA CONSOMMATION
      await this.consumer.run({
        autoCommit: true,
        autoCommitInterval: 3000, // Commit fréquent = moins de duplication
        autoCommitThreshold: 100, // Commit tous les 100 messages
        eachBatch: async ({ batch, resolveOffset, heartbeat, isRunning }) => {
          // ✅ SI LE CONSUMER ARRÊTE, NE RIEN FAIRE
          if (!isRunning()) {
            console.log("⚠️ Consumer pas en cours, skip batch");
            return;
          }

          const startTime = Date.now();
          const messagesToDeliver = new Map(); // userId → [messages]
          let processedCount = 0;
          let skippedCount = 0;

          try {
            // ✅ TRAITER CHAQUE MESSAGE
            for (let i = 0; i < batch.messages.length; i++) {
              const message = batch.messages[i];

              try {
                // ✅ PARSER ET VALIDER
                let payload;
                try {
                  payload = JSON.parse(message.value.toString());
                } catch (parseErr) {
                  console.warn(
                    `❌ Erreur parsing message (offset ${message.offset}):`,
                    parseErr.message
                  );
                  skippedCount++;
                  continue;
                }

                // ✅ IGNORER LES HEALTH CHECKS ET MESSAGES MAL FORMÉS
                if (
                  !payload?.messageId ||
                  payload.eventType === "HEALTH_CHECK"
                ) {
                  skippedCount++;
                  continue;
                }

                if (!payload.conversationId) {
                  console.warn(
                    `⚠️ Message sans conversationId (offset ${message.offset})`
                  );
                  skippedCount++;
                  continue;
                }

                // ✅ RÉCUPÉRER LES UTILISATEURS EN LIGNE
                const conversationId = String(payload.conversationId);
                const onlineUserIds = await this.getOnlineUsersInConversation(
                  conversationId
                );

                if (onlineUserIds.length === 0) {
                  console.log(
                    `ℹ️ Aucun utilisateur en ligne dans ${conversationId}`
                  );
                  processedCount++;
                  continue;
                }

                const senderId = String(payload.senderId);

                // ✅ PRÉPARER LES MESSAGES POUR LIVRAISON
                for (const userId of onlineUserIds) {
                  // Ne pas envoyer à l'expéditeur
                  if (userId === senderId) continue;

                  if (!messagesToDeliver.has(userId)) {
                    messagesToDeliver.set(userId, []);
                  }

                  messagesToDeliver.get(userId).push({
                    ...payload,
                    delivered: true,
                    deliveredAt: new Date().toISOString(),
                    _kafkaOffset: message.offset,
                    _kafkaPartition: message.partition,
                  });
                }

                // ✅ MARQUER COMME DELIVERED (fire-and-forget)
                for (const userId of onlineUserIds) {
                  if (userId === senderId) continue;

                  this.updateStatus
                    .markSingleMessage({
                      messageId: payload.messageId,
                      receiverId: userId,
                      status: "DELIVERED",
                      conversationId: conversationId,
                    })
                    .catch((err) => {
                      console.warn(
                        `⚠️ Erreur marquage DELIVERED ${payload.messageId}/${userId}:`,
                        err.message
                      );
                      this.metrics.errorCount++;
                    });
                }

                processedCount++;
              } catch (messageErr) {
                console.error(
                  `❌ Erreur traitement message (offset ${message.offset}):`,
                  messageErr.message
                );
                this.metrics.errorCount++;
                skippedCount++;
              }

              // ✅ HEARTBEAT RÉGULIÈREMENT POUR ÉVITER TIMEOUT
              if ((i + 1) % 10 === 0) {
                try {
                  await heartbeat();
                } catch (hbErr) {
                  console.warn("⚠️ Erreur heartbeat:", hbErr.message);
                }
              }
            }

            // ✅ ENVOYER TOUS LES MESSAGES GROUPÉS
            if (messagesToDeliver.size > 0) {
              this.deliverToUsers(messagesToDeliver);
              this.metrics.messagesDelivered += Array.from(
                messagesToDeliver.values()
              ).reduce((sum, msgs) => sum + msgs.length, 0);
            }

            // ✅ MÉTRIQUES
            const processingTime = Date.now() - startTime;
            this.metrics.messagesProcessed += processedCount;
            this.metrics.lastProcessTime = processingTime;

            console.log(
              `✅ Batch traité: ${processedCount} messages, ${skippedCount} ignorés, ${processingTime}ms`,
              {
                usersDelivered: messagesToDeliver.size,
                totalMessages: batch.messages.length,
              }
            );

            // ✅ HEARTBEAT FINAL
            try {
              await heartbeat();
            } catch (hbErr) {
              console.warn("⚠️ Erreur heartbeat final:", hbErr.message);
            }
          } catch (batchErr) {
            console.error("❌ Erreur traitement batch:", batchErr.message);
            this.metrics.errorCount++;
          }
        },
      });

      this.isRunning = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.metrics.startedAt = new Date();

      console.log(
        `🚀 UserMessageDeliveryService démarré (groupe: ${this.groupId}, topic: ${this.topic})`
      );
    } catch (error) {
      this.isConnecting = false;
      console.error(
        `❌ Erreur démarrage UserMessageDeliveryService:`,
        error.message
      );

      // ✅ RETRY AUTOMATIQUE
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(
          `🔄 Reconnexion dans ${this.reconnectDelay}ms (tentative ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
        );
        setTimeout(() => this.start(), this.reconnectDelay);
      } else {
        console.error(
          `❌ Impossible de démarrer UserMessageDeliveryService après ${this.maxReconnectAttempts} tentatives`
        );
      }

      throw error;
    }
  }

  /**
   * ✅ LIVRER LES MESSAGES AUX UTILISATEURS VIA SOCKET.IO
   */
  deliverToUsers(messagesByUser) {
    let totalDelivered = 0;

    for (const [userId, messages] of messagesByUser) {
      try {
        // ✅ ENVOYER À TOUTES LES CONNEXIONS DE L'UTILISATEUR
        // (multi-onglets, mobile + web, etc.)
        this.io.to(`user:${userId}`).emit("newMessage", messages);

        totalDelivered += messages.length;

        console.log(
          `📤 ${messages.length} message(s) livré(s) à l'utilisateur ${userId}`
        );
      } catch (err) {
        console.error(`❌ Erreur livraison messages à ${userId}:`, err.message);
        this.metrics.errorCount++;
      }
    }

    console.log(`✅ Total livré ce batch: ${totalDelivered} messages`);
  }

  /**
   * ✅ RÉCUPÉRER LES UTILISATEURS EN LIGNE DANS UNE CONVERSATION
   */
  async getOnlineUsersInConversation(conversationId) {
    try {
      const redisKey = `${this.redisKeyPrefix}${conversationId}:online`;
      const members = await this.redis.smembers(redisKey);

      return Array.isArray(members) && members.length > 0
        ? members.map(String)
        : [];
    } catch (err) {
      console.warn(
        `⚠️ Erreur Redis getOnlineUsers (${conversationId}):`,
        err.message
      );
      return [];
    }
  }

  /**
   * ✅ À APPELER LORS DE LA CONNEXION WEBSOCKET
   */
  async onUserConnect(userId, conversationIds = []) {
    if (!userId) {
      console.warn("⚠️ onUserConnect: userId requis");
      return;
    }

    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
      console.log(`ℹ️ Utilisateur ${userId} connecté sans conversations`);
      return;
    }

    try {
      const multi = this.redis.multi();
      const userIdStr = String(userId);

      for (const convId of conversationIds) {
        const redisKey = `${this.redisKeyPrefix}${convId}:online`;
        multi.sadd(redisKey, userIdStr);
        multi.expire(redisKey, this.redisTTL);
      }

      await multi.exec();

      console.log(
        `✅ Utilisateur ${userId} ajouté à ${conversationIds.length} conversation(s) en ligne`
      );
    } catch (err) {
      console.error(
        `❌ Erreur onUserConnect Redis pour ${userId}:`,
        err.message
      );
      this.metrics.errorCount++;
    }
  }

  /**
   * ✅ À APPELER LORS DE LA DÉCONNEXION WEBSOCKET
   */
  async onUserDisconnect(userId, conversationIds = []) {
    if (!userId) {
      console.warn("⚠️ onUserDisconnect: userId requis");
      return;
    }

    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
      console.log(`ℹ️ Utilisateur ${userId} déconnecté sans conversations`);
      return;
    }

    try {
      const multi = this.redis.multi();
      const userIdStr = String(userId);

      for (const convId of conversationIds) {
        const redisKey = `${this.redisKeyPrefix}${convId}:online`;
        multi.srem(redisKey, userIdStr);
        // Ne pas delete la clé - elle expirera naturellement après 24h
      }

      await multi.exec();

      console.log(
        `👋 Utilisateur ${userId} retiré de ${conversationIds.length} conversation(s) en ligne`
      );
    } catch (err) {
      console.error(
        `❌ Erreur onUserDisconnect Redis pour ${userId}:`,
        err.message
      );
      this.metrics.errorCount++;
    }
  }

  /**
   * ✅ ARRÊTER LE SERVICE PROPREMENT
   */
  async stop() {
    if (!this.isRunning && !this.consumer) {
      console.log("⚠️ UserMessageDeliveryService pas en cours");
      return;
    }

    try {
      console.log("🛑 Arrêt de UserMessageDeliveryService...");

      if (this.consumer) {
        await this.consumer.stop();
        console.log("✅ Consumer arrêté");

        await this.consumer.disconnect();
        console.log("✅ Déconnexion Kafka");
      }

      this.isRunning = false;
      this.isConnecting = false;
      console.log("✅ UserMessageDeliveryService arrêté proprement");
    } catch (err) {
      console.error("❌ Erreur arrêt UserMessageDeliveryService:", err.message);
    }
  }

  /**
   * ✅ STATUS ET MÉTRIQUES
   */
  getStatus() {
    const uptime = this.metrics.startedAt
      ? Date.now() - this.metrics.startedAt.getTime()
      : 0;

    return {
      isRunning: this.isRunning,
      groupId: this.groupId,
      topic: this.topic,
      timestamp: new Date().toISOString(),
      uptime: `${Math.floor(uptime / 1000)}s`,
      metrics: {
        messagesProcessed: this.metrics.messagesProcessed,
        messagesDelivered: this.metrics.messagesDelivered,
        errorCount: this.metrics.errorCount,
        lastProcessTime: `${this.metrics.lastProcessTime}ms`,
        startedAt: this.metrics.startedAt?.toISOString() || null,
      },
    };
  }

  /**
   * ✅ HEALTH CHECK ENDPOINT
   */
  getHealthCheck() {
    return {
      status: this.isRunning ? "healthy" : "unhealthy",
      isRunning: this.isRunning,
      isConnecting: this.isConnecting,
      consumerConnected: this.consumer ? true : false,
      metrics: this.metrics,
    };
  }
}

module.exports = UserMessageDeliveryService;
