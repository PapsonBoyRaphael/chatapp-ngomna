/**
 * OnlineUserManager - Gestionnaire des utilisateurs en ligne
 * ✅ Migré vers le module partagé
 * ✅ Utilise RedisManager singleton
 * ✅ Support multi-connexions (mobile + web)
 * ✅ Rate-limiting sur updateLastActivity
 * ✅ Cron de nettoyage proactif
 * ✅ Privacy settings (hide last seen)
 * ✅ Intégration typing indicator
 * ✅ SCAN optimisé pour gros volumes
 */

class OnlineUserManager {
  constructor(io = null, options = {}) {
    this.redis = null;
    this.redisManager = null;
    this.io = io;

    // Préfixes des clés
    this.presencePrefix = options.presencePrefix || "chat:cache:presence";
    this.userDataPrefix = options.userDataPrefix || "chat:cache:user_data";
    this.userSocketPrefix =
      options.userSocketPrefix || "chat:cache:user_sockets";
    this.userSocketsSetPrefix =
      options.userSocketsSetPrefix || "chat:cache:user_sockets_set"; // ✅ Multi-connexions
    this.userRoomsPrefix = options.userRoomsPrefix || "chat:cache:user_rooms"; // ✅ Contacts via rooms
    this.roomUsersPrefix = options.roomUsersPrefix || "chat:cache:room_users"; // ✅ Contacts via rooms

    // TTL
    this.defaultTTL = options.defaultTTL || 300; // 5 minutes
    this.idleTTL = options.idleTTL || 3600; // 1 heure

    // ✅ RATE-LIMITING
    this.rateLimitWindow = options.rateLimitWindow || 1000; // 1 seconde
    this.lastActivityUpdates = new Map(); // userId → lastUpdateTimestamp

    // ✅ CRON CLEANUP
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute
    this.cleanupTimer = null;

    // ✅ TYPING INTEGRATION
    this.typingPrefix = options.typingPrefix || "typing";

    // ✅ CALLBACK POUR LA DÉCONNEXION (mise à jour lastSeen dans MongoDB)
    this.onUserDisconnectCallback = options.onUserDisconnect || null;

    this.subscriber = null;
    this.isInitialized = false;
  }

  /**
   * ✅ SETTER POUR LE CALLBACK DE DÉCONNEXION
   */
  setOnUserDisconnectCallback(callback) {
    this.onUserDisconnectCallback = callback;
    console.log("✅ Callback de déconnexion configuré");
  }

  /**
   * Initialiser avec RedisManager
   */
  async initialize(RedisManager) {
    if (this.isInitialized) return;

    this.redisManager = RedisManager;
    await this.redisManager.connect();
    this.redis = this.redisManager.getMainClient();

    await this.setupExpirationListener();
    this.startCleanupCron(); // ✅ Démarrer le cron
    this.isInitialized = true;

    console.log("✅ OnlineUserManager initialisé via RedisManager");
  }

  /**
   * Initialiser avec un client Redis direct (compatibilité)
   */
  async initializeWithClient(redisClient) {
    this.redis = redisClient;
    await this.setupExpirationListener();
    this.startCleanupCron(); // ✅ Démarrer le cron
    this.isInitialized = true;
    console.log("✅ OnlineUserManager initialisé avec client direct");
  }

  async setupExpirationListener() {
    if (!this.redis) return;

    try {
      this.subscriber = this.redis.duplicate();
      await this.subscriber.connect();

      await this.redis.sendCommand([
        "CONFIG",
        "SET",
        "notify-keyspace-events",
        "KEx",
      ]);

      await this.subscriber.subscribe(
        `__keyevent@0__:expired`,
        async (message) => {
          try {
            if (message.startsWith(`${this.presencePrefix}:`)) {
              const userId = message.split(":")[1];
              console.log(`⏰ Détection expiration utilisateur: ${userId}`);

              const userData = await this.getUserData(userId);

              if (userData) {
                const currentStatus = userData.status || "offline";

                if (currentStatus === "idle") {
                  console.log(`🧹 Nettoyage utilisateur inactif: ${userId}`);

                  // ✅ METTRE À JOUR lastActivity AVANT OFFLINE
                  await this.redis.hSet(`${this.userDataPrefix}:${userId}`, {
                    lastActivity: new Date().toISOString(),
                    status: "offline",
                  });

                  // ✅ FORCER TYPING:STOP SI EN COURS
                  await this.forceStopTyping(userId);

                  await this.setUserOffline(userId);

                  await this.emitPresenceToContacts(userId, "user_offline", {
                    userId,
                    matricule: userData.matricule,
                    reason: "idle_timeout",
                    timestamp: new Date().toISOString(),
                  });
                } else if (currentStatus === "online") {
                  console.log(`💤 Passage en idle: ${userId}`);
                  await this.redis.set(
                    `${this.presencePrefix}:${userId}`,
                    "idle",
                    { EX: this.idleTTL },
                  );

                  await this.redis.hSet(
                    `${this.userDataPrefix}:${userId}`,
                    "status",
                    "idle",
                  );

                  await this.emitPresenceToContacts(userId, "user_idle", {
                    userId,
                    matricule: userData.matricule,
                    timestamp: new Date().toISOString(),
                  });
                }
              }
            }
          } catch (err) {
            console.error("❌ Erreur traitement expiration:", err);
          }
        },
      );

      console.log("✅ Listener d'expiration configuré");
    } catch (error) {
      console.error("❌ Erreur setup listener:", error);
    }
  }

  /**
   * ✅ CRON DE NETTOYAGE PROACTIF
   */
  startCleanupCron() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(async () => {
      try {
        const cleaned = await this.cleanupInactiveUsers();
        if (cleaned > 0) {
          console.log(
            `🧹 [CRON] ${cleaned} utilisateur(s) inactif(s) nettoyé(s)`,
          );
        }
      } catch (err) {
        console.error("❌ [CRON] Erreur cleanup:", err.message);
      }
    }, this.cleanupInterval);

    console.log(
      `⏰ Cron de nettoyage démarré (intervalle: ${this.cleanupInterval}ms)`,
    );
  }

  /**
   * ✅ FORCER TYPING:STOP QUAND USER DEVIENT OFFLINE
   */
  async forceStopTyping(userId) {
    if (!this.redis || !this.io) return;

    try {
      // Récupérer les conversations où l'user tape
      const typingKey = `${this.typingPrefix}:user:${userId}`;
      const conversationId = await this.redis.get(typingKey);

      if (conversationId) {
        // Supprimer la clé typing
        await this.redis.del(typingKey);

        // Broadcaster typing:stop
        this.io.to(`conversation_${conversationId}`).emit("userStoppedTyping", {
          userId,
          conversationId,
          reason: "user_offline",
          timestamp: new Date().toISOString(),
        });

        console.log(
          `🛑 Typing forcé stop pour ${userId} dans ${conversationId}`,
        );
      }
    } catch (err) {
      console.error("❌ Erreur forceStopTyping:", err.message);
    }
  }

  /**
   * ✅ DIFFUSER LA PRÉSENCE UNIQUEMENT AUX CONTACTS (user_rooms)
   */
  async emitPresenceToContacts(userId, event, payload) {
    if (!this.redis || !this.io) return;

    try {
      const userIdString = String(userId);
      const userRooms = await this.redis.sMembers(
        `${this.userRoomsPrefix}:${userIdString}`,
      );

      if (!userRooms || userRooms.length === 0) return;

      const contactIds = new Set();

      for (const roomName of userRooms) {
        const roomUsers = await this.redis.sMembers(
          `${this.roomUsersPrefix}:${roomName}`,
        );
        for (const contactId of roomUsers) {
          if (contactId && contactId !== userIdString) {
            contactIds.add(contactId);
          }
        }
      }

      if (contactIds.size === 0) return;

      for (const contactId of contactIds) {
        this.io.to(`user_${contactId}`).emit(event, payload);
      }
    } catch (err) {
      console.error("❌ Erreur emitPresenceToContacts:", err.message);
    }
  }

  async setUserOnline(userId, userData = {}) {
    if (!this.redis) return false;

    try {
      const userIdString = String(userId);
      if (!this._validateUserId(userIdString)) {
        throw new Error("userId invalide");
      }

      const userInfo = {
        userId: userIdString,
        socketId: userData.socketId ? String(userData.socketId) : null,
        connectedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        matricule: String(userData.matricule || "Unknown"),
        status: "online",
        // ✅ PRIVACY SETTINGS
        hideLastSeen: userData.hideLastSeen ? "true" : "false",
        lastSeenVisibility: userData.lastSeenVisibility || "everyone", // everyone, contacts, nobody
      };

      console.log(`✅ Connexion utilisateur: ${userIdString}`, userInfo);

      await this.redis.hSet(
        `${this.userDataPrefix}:${userIdString}`,
        this._sanitizeData(userInfo),
      );

      // ✅ MULTI-CONNEXIONS: Ajouter ce socket au set de l'utilisateur
      if (userInfo.socketId) {
        await this.redis.sAdd(
          `${this.userSocketsSetPrefix}:${userIdString}`,
          userInfo.socketId,
        );
        await this.redis.expire(
          `${this.userSocketsSetPrefix}:${userIdString}`,
          this.idleTTL,
        );

        // Garder aussi l'ancienne clé pour compatibilité
        await this.redis.set(
          `${this.userSocketPrefix}:${userInfo.socketId}`,
          userIdString,
          { EX: this.defaultTTL },
        );
      }

      const currentStatus = await this.redis.get(
        `${this.presencePrefix}:${userIdString}`,
      );
      if (currentStatus === "idle") {
        console.log(`🔄 Passage de idle à online pour ${userIdString}`);
      }

      await this.redis.set(`${this.presencePrefix}:${userIdString}`, "online", {
        EX: this.defaultTTL,
      });

      if (userInfo.socketId) {
        await this.redis.set(
          `${this.userSocketPrefix}:${userInfo.socketId}`,
          userIdString,
          { EX: this.defaultTTL },
        );
      }

      if (currentStatus !== "online") {
        await this.emitPresenceToContacts(userIdString, "user_online", {
          userId: userIdString,
          matricule: userInfo.matricule,
          timestamp: new Date().toISOString(),
        });
      }

      return true;
    } catch (error) {
      console.error("❌ Erreur setUserOnline:", error);
      return false;
    }
  }

  async setUserOffline(userId, socketId = null) {
    if (!this.redis) return false;

    try {
      const userIdString = String(userId);
      if (!this._validateUserId(userIdString)) return false;

      const userData = await this.getUserData(userIdString);
      if (!userData) return false;

      // ✅ MULTI-CONNEXIONS: Si socketId fourni, retirer ce socket du set
      if (socketId) {
        await this.redis.sRem(
          `${this.userSocketsSetPrefix}:${userIdString}`,
          socketId,
        );
        await this.redis.del(`${this.userSocketPrefix}:${socketId}`);

        // Vérifier s'il reste d'autres sockets
        const remainingSockets = await this.redis.sCard(
          `${this.userSocketsSetPrefix}:${userIdString}`,
        );

        if (remainingSockets > 0) {
          await this.redis.set(
            `${this.presencePrefix}:${userIdString}`,
            "online",
            { EX: this.defaultTTL },
          );
          await this.redis.expire(
            `${this.userSocketsSetPrefix}:${userIdString}`,
            this.idleTTL,
          );
          await this.redis.hSet(
            `${this.userDataPrefix}:${userIdString}`,
            "status",
            "online",
          );
          console.log(
            `📱 Socket ${socketId} déconnecté, mais ${remainingSockets} autre(s) socket(s) actif(s) pour ${userIdString}`,
          );
          return true; // Ne pas mettre offline, d'autres connexions actives
        }
      }

      // ✅ GARDE-FOU: si socketId non fourni, vérifier s'il reste des sockets
      if (!socketId) {
        const remainingSockets = await this.redis.sCard(
          `${this.userSocketsSetPrefix}:${userIdString}`,
        );
        if (remainingSockets > 0) {
          await this.redis.set(
            `${this.presencePrefix}:${userIdString}`,
            "online",
            { EX: this.defaultTTL },
          );
          await this.redis.expire(
            `${this.userSocketsSetPrefix}:${userIdString}`,
            this.idleTTL,
          );
          await this.redis.hSet(
            `${this.userDataPrefix}:${userIdString}`,
            "status",
            "online",
          );
          console.log(
            `📱 Déconnexion sans socketId, mais ${remainingSockets} socket(s) actif(s) pour ${userIdString}`,
          );
          return true;
        }
      }

      console.log(`⏰ Déconnexion utilisateur: ${userIdString}`);

      // ✅ METTRE À JOUR lastActivity AVANT SUPPRESSION
      const lastActivityTimestamp = new Date().toISOString();
      await this.redis.hSet(`${this.userDataPrefix}:${userIdString}`, {
        lastActivity: lastActivityTimestamp,
        status: "offline",
      });

      // ✅ SAUVEGARDER lastSeen DANS UNE CLÉ SÉPARÉE (pour récupération ultérieure)
      await this.redis.set(
        `chat:cache:last_seen:${userIdString}`,
        JSON.stringify({
          lastActivity: lastActivityTimestamp,
          status: "offline",
          matricule: userData.matricule,
          disconnectedAt: lastActivityTimestamp,
        }),
        { EX: 86400 * 30 }, // 30 jours TTL
      );

      // ✅ APPELER LE CALLBACK DE DÉCONNEXION (mise à jour lastSeen dans MongoDB)
      if (this.onUserDisconnectCallback) {
        try {
          await this.onUserDisconnectCallback(
            userIdString,
            lastActivityTimestamp,
          );
        } catch (callbackErr) {
          console.warn("⚠️ Erreur callback déconnexion:", callbackErr.message);
        }
      }

      // ✅ FORCER TYPING:STOP
      await this.forceStopTyping(userIdString);

      // Nettoyer toutes les clés
      await this.redis.del(`${this.userDataPrefix}:${userIdString}`);
      await this.redis.del(`${this.userSocketsSetPrefix}:${userIdString}`);
      await this.redis.del(`${this.presencePrefix}:${userIdString}`);

      // Nettoyer l'ancien socket si présent
      if (userData.socketId) {
        await this.redis.del(`${this.userSocketPrefix}:${userData.socketId}`);
      }

      console.log(`✅ Utilisateur ${userIdString} déconnecté`);

      await this.emitPresenceToContacts(userIdString, "user_offline", {
        userId: userIdString,
        matricule: userData.matricule,
        reason: "user_disconnect",
        timestamp: lastActivityTimestamp,
      });

      return true;
    } catch (error) {
      console.error("❌ Erreur setUserOffline:", error);
      return false;
    }
  }

  async isUserOnline(userId) {
    if (!this.redis) return false;

    try {
      const userIdString = String(userId);
      const status = await this.redis.get(
        `${this.presencePrefix}:${userIdString}`,
      );
      return status === "online";
    } catch (error) {
      console.error("❌ Erreur isUserOnline:", error);
      return false;
    }
  }

  async updateLastActivity(userId, socket = null) {
    if (!this.redis) return false;

    try {
      const userIdString = String(userId);
      if (!this._validateUserId(userIdString)) return false;

      // ✅ RATE-LIMITING: Éviter les updates trop fréquentes
      const now = Date.now();
      const lastUpdate = this.lastActivityUpdates.get(userIdString) || 0;

      if (now - lastUpdate < this.rateLimitWindow) {
        // Trop rapide, ignorer silencieusement
        return true;
      }

      this.lastActivityUpdates.set(userIdString, now);

      // Nettoyer la map périodiquement (éviter fuite mémoire)
      if (this.lastActivityUpdates.size > 10000) {
        const cutoff = now - this.rateLimitWindow * 10;
        for (const [uid, ts] of this.lastActivityUpdates) {
          if (ts < cutoff) this.lastActivityUpdates.delete(uid);
        }
      }

      let userData = await this.getUserData(userIdString);

      if (!userData) {
        console.log(`🔄 Recréation données Redis pour ${userIdString}`);
        userData = {
          userId: userIdString,
          socketId: socket?.id || null,
          matricule: socket?.matricule || "Unknown",
          status: "online",
          lastActivity: new Date().toISOString(),
          connectedAt: new Date().toISOString(),
        };

        await this.redis.hSet(
          `${this.userDataPrefix}:${userIdString}`,
          this._sanitizeData(userData),
        );

        await this.redis.set(
          `${this.presencePrefix}:${userIdString}`,
          "online",
          { EX: this.defaultTTL },
        );

        if (userData.socketId) {
          await this.redis.set(
            `${this.userSocketPrefix}:${userData.socketId}`,
            userIdString,
            { EX: this.defaultTTL },
          );
        }
      }

      const currentStatus = userData.status || "offline";

      if (currentStatus === "idle" || currentStatus === "offline") {
        await this.redis.set(
          `${this.presencePrefix}:${userIdString}`,
          "online",
          { EX: this.defaultTTL },
        );
        await this.redis.hSet(
          `${this.userDataPrefix}:${userIdString}`,
          "status",
          "online",
        );
        console.log(`✅ Upgraded to online: ${userIdString}`);
      } else {
        await this.redis.expire(
          `${this.presencePrefix}:${userIdString}`,
          this.defaultTTL,
        );
      }

      await this.redis.hSet(
        `${this.userDataPrefix}:${userIdString}`,
        "lastActivity",
        new Date().toISOString(),
      );

      // ✅ RAFRAÎCHIR LE TTL DU SET DE SOCKETS SI PRÉSENT
      await this.redis.expire(
        `${this.userSocketsSetPrefix}:${userIdString}`,
        this.idleTTL,
      );

      if (currentStatus !== "online") {
        await this.emitPresenceToContacts(userIdString, "user_online", {
          userId: userIdString,
          matricule: userData.matricule,
        });
      }

      return true;
    } catch (error) {
      console.error("❌ Erreur updateLastActivity:", error);
      return false;
    }
  }

  _validateUserId(userId) {
    return userId && userId !== "undefined" && userId !== "null";
  }

  _sanitizeData(data) {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      if (value != null) sanitized[key] = String(value);
    }
    return sanitized;
  }

  /**
   * ✅ OBTENIR TOUS LES SOCKETS D'UN UTILISATEUR (Multi-connexions)
   */
  async getUserSockets(userId) {
    if (!this.redis) return [];

    try {
      const userIdString = String(userId);
      const sockets = await this.redis.sMembers(
        `${this.userSocketsSetPrefix}:${userIdString}`,
      );
      return sockets || [];
    } catch (error) {
      console.error("❌ Erreur getUserSockets:", error);
      return [];
    }
  }

  /**
   * ✅ COMPTER LES CONNEXIONS D'UN UTILISATEUR
   */
  async getUserConnectionCount(userId) {
    if (!this.redis) return 0;

    try {
      const userIdString = String(userId);
      const count = await this.redis.sCard(
        `${this.userSocketsSetPrefix}:${userIdString}`,
      );
      return count || 0;
    } catch (error) {
      console.error("❌ Erreur getUserConnectionCount:", error);
      return 0;
    }
  }

  /**
   * ✅ METTRE À JOUR LES PARAMÈTRES DE PRIVACY
   */
  async updatePrivacySettings(userId, settings = {}) {
    if (!this.redis) return false;

    try {
      const userIdString = String(userId);
      const updates = {};

      if (settings.hideLastSeen !== undefined) {
        updates.hideLastSeen = settings.hideLastSeen ? "true" : "false";
      }
      if (settings.lastSeenVisibility) {
        updates.lastSeenVisibility = settings.lastSeenVisibility;
      }

      if (Object.keys(updates).length > 0) {
        await this.redis.hSet(
          `${this.userDataPrefix}:${userIdString}`,
          updates,
        );
        console.log(
          `🔒 Privacy settings mis à jour pour ${userIdString}:`,
          updates,
        );
      }

      return true;
    } catch (error) {
      console.error("❌ Erreur updatePrivacySettings:", error);
      return false;
    }
  }

  /**
   * ✅ OBTENIR LE LAST SEEN AVEC RESPECT DE LA PRIVACY
   */
  async getLastSeen(userId, requesterId = null) {
    if (!this.redis) return null;

    try {
      const userIdString = String(userId);

      // D'abord vérifier si l'utilisateur est en ligne
      let userData = await this.getUserData(userIdString);

      // Si l'utilisateur n'est pas en ligne, récupérer le lastSeen sauvegardé
      if (!userData) {
        const lastSeenData = await this.redis.get(
          `chat:cache:last_seen:${userIdString}`,
        );
        if (lastSeenData) {
          try {
            const parsed = JSON.parse(lastSeenData);
            return {
              hidden: false,
              lastActivity: parsed.lastActivity,
              disconnectedAt: parsed.disconnectedAt,
              status: "offline",
              isOffline: true,
            };
          } catch (parseErr) {
            console.warn("⚠️ Erreur parsing lastSeen:", parseErr.message);
          }
        }
        return null;
      }

      // Vérifier les paramètres de privacy
      const hideLastSeen = userData.hideLastSeen === "true";
      const visibility = userData.lastSeenVisibility || "everyone";

      if (hideLastSeen) {
        return { hidden: true, reason: "user_preference" };
      }

      if (visibility === "nobody") {
        return { hidden: true, reason: "privacy_setting" };
      }

      // TODO: Si visibility === "contacts", vérifier si requesterId est un contact

      return {
        hidden: false,
        lastActivity: userData.lastActivity,
        status: userData.status,
        isOffline: false,
      };
    } catch (error) {
      console.error("❌ Erreur getLastSeen:", error);
      return null;
    }
  }

  async getOnlineUsers(options = { offset: 0, limit: 100 }) {
    if (!this.redis) return [];

    try {
      const pattern = `${this.userDataPrefix}:*`;
      const users = [];
      let cursor = String(options.offset);

      do {
        const result = await this.redis.scan(cursor, {
          MATCH: pattern,
          COUNT: options.limit,
        });

        cursor = String(result.cursor);

        if (result.keys.length) {
          for (const key of result.keys) {
            const data = await this.redis.hGetAll(key);
            if (Object.keys(data).length > 0) {
              users.push(data);
            }
          }
        }
      } while (cursor !== "0" && users.length < options.limit);

      return users.slice(0, options.limit);
    } catch (error) {
      console.error("❌ Erreur getOnlineUsers:", error);
      return [];
    }
  }

  async getOnlineUsersCount() {
    if (!this.redis) return 0;

    try {
      // ✅ OPTIMISÉ: Utiliser SCAN au lieu de KEYS
      const pattern = `${this.presencePrefix}:*`;
      let count = 0;
      let cursor = "0";

      do {
        const result = await this.redis.scan(cursor, {
          MATCH: pattern,
          COUNT: 1000,
        });

        cursor = String(result.cursor);
        count += result.keys.length;
      } while (cursor !== "0");

      return count;
    } catch (error) {
      console.error("❌ Erreur getOnlineUsersCount:", error);
      return 0;
    }
  }

  async getUserData(userId) {
    if (!this.redis) return null;

    try {
      const data = await this.redis.hGetAll(`${this.userDataPrefix}:${userId}`);
      return Object.keys(data).length > 0 ? data : null;
    } catch (error) {
      console.error("❌ Erreur getUserData:", error);
      return null;
    }
  }

  async cleanupInactiveUsers() {
    if (!this.redis) return 0;

    try {
      let cleanedCount = 0;
      const pattern = `${this.presencePrefix}:*`;
      let cursor = "0";

      // ✅ OPTIMISÉ: Utiliser SCAN au lieu de KEYS
      do {
        const result = await this.redis.scan(cursor, {
          MATCH: pattern,
          COUNT: 100, // Traiter par lots de 100
        });

        cursor = String(result.cursor);

        for (const key of result.keys) {
          const exists = await this.redis.exists(key);
          if (!exists) {
            const userId = key.replace(`${this.presencePrefix}:`, "");
            await this.setUserOffline(userId);
            cleanedCount++;
          }
        }
      } while (cursor !== "0");

      return cleanedCount;
    } catch (error) {
      console.error("❌ Erreur cleanupInactiveUsers:", error);
      return 0;
    }
  }

  /**
   * ✅ STATISTIQUES DE PRÉSENCE
   */
  async getPresenceStats() {
    if (!this.redis) return null;

    try {
      const onlineCount = await this.getOnlineUsersCount();

      // Compter les users idle
      let idleCount = 0;
      let cursor = "0";

      do {
        const result = await this.redis.scan(cursor, {
          MATCH: `${this.presencePrefix}:*`,
          COUNT: 100,
        });

        cursor = String(result.cursor);

        for (const key of result.keys) {
          const status = await this.redis.get(key);
          if (status === "idle") idleCount++;
        }
      } while (cursor !== "0");

      return {
        online: onlineCount - idleCount,
        idle: idleCount,
        total: onlineCount,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Erreur getPresenceStats:", error);
      return null;
    }
  }

  async cleanup() {
    // ✅ ARRÊTER LE CRON
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log("⏰ Cron de nettoyage arrêté");
    }

    // ✅ NETTOYER LE RATE-LIMITER
    this.lastActivityUpdates.clear();

    if (this.subscriber) {
      try {
        await this.subscriber.unsubscribe();
        await this.subscriber.quit();
      } catch (err) {
        console.warn("⚠️ Erreur cleanup subscriber:", err.message);
      }
    }
  }
}

module.exports = OnlineUserManager;
