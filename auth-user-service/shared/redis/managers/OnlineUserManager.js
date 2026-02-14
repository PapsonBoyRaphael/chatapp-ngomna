/**
 * OnlineUserManager - Gestionnaire des utilisateurs en ligne
 * ✅ Migré vers le module partagé
 * ✅ Utilise RedisManager singleton
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
    this.userRoomsPrefix = options.userRoomsPrefix || "chat:cache:user_rooms"; // ✅ Contacts via rooms
    this.roomUsersPrefix = options.roomUsersPrefix || "chat:cache:room_users"; // ✅ Contacts via rooms

    // TTL
    this.defaultTTL = options.defaultTTL || 300; // 5 minutes
    this.idleTTL = options.idleTTL || 3600; // 1 heure

    this.subscriber = null;
    this.isInitialized = false;
  }

  /**
   * Initialiser avec RedisManager
   */
  async initialize(RedisManager) {
    if (this.isInitialized) return;

    this.redisManager = RedisManager;
    await this.redisManager.connect();
    this.redis = this.redisManager.getCacheClient();

    await this.setupExpirationListener();
    this.isInitialized = true;

    console.log("✅ OnlineUserManager initialisé via RedisManager");
  }

  /**
   * Initialiser avec un client Redis direct (compatibilité)
   */
  async initializeWithClient(redisClient) {
    this.redis = redisClient;
    await this.setupExpirationListener();
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
      };

      console.log(`✅ Connexion utilisateur: ${userIdString}`, userInfo);

      await this.redis.hSet(
        `${this.userDataPrefix}:${userIdString}`,
        this._sanitizeData(userInfo),
      );

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

      return true;
    } catch (error) {
      console.error("❌ Erreur setUserOnline:", error);
      return false;
    }
  }

  async setUserOffline(userId) {
    if (!this.redis) return false;

    try {
      const userIdString = String(userId);
      if (!this._validateUserId(userIdString)) return false;

      const userData = await this.getUserData(userIdString);
      if (!userData) return false;

      console.log(`⏰ Déconnexion utilisateur: ${userIdString}`);

      await this.redis.del(`${this.userDataPrefix}:${userIdString}`);
      if (userData.socketId) {
        await this.redis.del(`${this.userSocketPrefix}:${userData.socketId}`);
      }
      await this.redis.del(`${this.presencePrefix}:${userIdString}`);

      console.log(`✅ Utilisateur ${userIdString} déconnecté`);

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
      const pattern = `${this.presencePrefix}:*`;
      const keys = await this.redis.keys(pattern);
      return keys.length;
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
      const keys = await this.redis.keys(pattern);

      for (const key of keys) {
        const exists = await this.redis.exists(key);
        if (!exists) {
          const userId = key.replace(`${this.presencePrefix}:`, "");
          await this.setUserOffline(userId);
          cleanedCount++;
        }
      }

      return cleanedCount;
    } catch (error) {
      console.error("❌ Erreur cleanupInactiveUsers:", error);
      return 0;
    }
  }

  async cleanup() {
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
