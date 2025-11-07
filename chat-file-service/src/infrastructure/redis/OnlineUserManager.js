class OnlineUserManager {
  constructor(redis, io = null) {
    this.redis = redis;
    this.io = io;
    this.presencePrefix = "presence"; // Clé avec TTL pour détecter l'inactivité
    this.userDataPrefix = "user_data"; // // Données sans TTL initial
    this.userSocketPrefix = "user_sockets";
    this.defaultTTL = 5; // 5 minutes pour test
    this.idleTTL = 3600; // 1 heure idle
    this.subscriber = null;

    if (this.redis) {
      this.setupExpirationListener();
    }
  }

  async setupExpirationListener() {
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
            console.log("🔔 Message d'expiration reçu:", message);

            // Vérifier si c'est une clé de présence qui expire
            if (message.startsWith(`${this.presencePrefix}:`)) {
              const userId = message.split(":")[1];
              console.log(`⏰ Détection expiration utilisateur: ${userId}`);

              // Récupérer les données utilisateur (toujours disponibles car pas de TTL)
              const userData = await this.getUserData(userId);

              if (userData) {
                // Déconnecter le socket
                // if (this.io && userData.socketId) {
                //   const socket = this.io.sockets.sockets.get(userData.socketId);
                //   if (socket) {
                //     console.log(`🔌 Déconnexion socket ${userData.socketId}`);
                //     socket.disconnect(true);
                //   }
                // }

                // Notifier avant de nettoyer les données
                // if (this.io) {
                //   this.io.emit("user_disconnected", {
                //     userId,
                //     matricule: userData.matricule,
                //     reason: "session_expired",
                //     timestamp: new Date().toISOString(),
                //   });
                // }

                // Nettoyer les données après utilisation
                // await this.setUserOffline(userId);

                // Passage en mode idle au lieu de déconnexion

                await this.redis.set(
                  `${this.presencePrefix}:${userId}`,
                  "idle",
                  { EX: this.idleTTL } // Format object pour compatibilité
                );

                await this.redis.hSet(
                  `${this.userDataPrefix}:${userId}`,
                  "status",
                  "idle"
                );

                if (this.io) {
                  this.io.emit("user_idle", {
                    userId,
                    matricule: userData.matricule,
                    timestamp: new Date().toISOString(),
                  });
                }
              }
              await this.getUserData(userId);
            }
          } catch (err) {
            console.error("❌ Erreur traitement expiration:", err);
          }
        }
      );

      console.log("✅ Listener d'expiration configuré");
    } catch (error) {
      console.error("❌ Erreur setup listener:", error);
    }
  }

  async setUserOnline(userId, userData = {}) {
    try {
      const userIdString = String(userId);
      if (!this._validateUserId(userIdString)) {
        throw new Error("userId invalide");
      }

      // Stocker uniquement les données utilisateur avec TTL
      const userInfo = {
        userId: userIdString,
        socketId: userData.socketId ? String(userData.socketId) : null,
        connectedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        matricule: String(userData.matricule || "Unknown"),
        status: "online",
      };

      console.log(`✅ Connexion utilisateur: ${userIdString}`, userInfo);

      // 1. Stocker les données sans TTL
      await this.redis.hSet(
        `${this.userDataPrefix}:${userIdString}`,
        this._sanitizeData(userInfo)
      );
      // await this.redis.expire(`${this.userDataPrefix}:${userIdString}`);

      // Vérifier si idle
      const currentStatus = await this.redis.get(
        `${this.presencePrefix}:${userIdString}`
      );
      if (currentStatus === "idle") {
        console.log(`🔄 Passage de idle à online pour ${userIdString}`);
      }

      // 2. Marquer présence avec TTL
      await this.redis.set(
        `${this.presencePrefix}:${userIdString}`,
        "online",
        { EX: this.defaultTTL } // Format object pour compatibilité
      );

      // Mapping bidirectionnel socket<->user si socketId présent
      if (userInfo.socketId) {
        await this.redis.set(
          `${this.userSocketPrefix}:${userInfo.socketId}`,
          userIdString,
          "EX",
          this.defaultTTL
        );
      }

      return true;
    } catch (error) {
      console.error("❌ Erreur setUserOnline:", error);
      return false;
    }
  }

  async setUserOffline(userId) {
    try {
      const userIdString = String(userId);
      if (!this._validateUserId(userIdString)) return false;

      const userData = await this.getUserData(userId);
      if (!userData) return false;

      console.log(`⏰ Déconnexion utilisateur: ${userIdString}`);

      // Nettoyer les données et mappings
      await this.redis.del(`${this.userDataPrefix}:${userIdString}`);
      if (userData.socketId) {
        await this.redis.del(`${this.userSocketPrefix}:${userData.socketId}`);
      }

      await this.redis.del(`${this.presencePrefix}:${userIdString}`);

      return true;
    } catch (error) {
      console.error("❌ Erreur setUserOffline:", error);
      return false;
    }
  }

  async isUserOnline(userId) {
    try {
      const userIdString = String(userId);
      const status = await this.redis.get(
        `${this.presencePrefix}:${userIdString}`
      );
      return status === "online";
    } catch (error) {
      console.error("❌ Erreur isUserOnline:", error);
      return false;
    }
  }

  async updateLastActivity(userId) {
    try {
      const userIdString = String(userId);
      const status = await this.redis.get(
        `${this.presencePrefix}:${userIdString}`
      );

      if (!status) return false;

      if (status === "idle") {
        // Retour à online si activité
        await this.redis.set(
          `${this.presencePrefix}:${userIdString}`,
          "online",
          { EX: this.defaultTTL }
        );

        await this.redis.hSet(
          `${this.userDataPrefix}:${userIdString}`,
          "status",
          "online"
        );
      } else {
        // Renouveler TTL si déjà online
        await this.redis.expire(
          `${this.presencePrefix}:${userIdString}`,
          this.defaultTTL
        );
      }

      await this.redis.hSet(
        `${this.userDataPrefix}:${userIdString}`,
        "lastActivity",
        new Date().toISOString()
      );

      return true;
    } catch (error) {
      console.error("❌ Erreur updateLastActivity:", error);
      return false;
    }
  }

  // Méthodes utilitaires privées
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

  // Version optimisée pour la pagination
  async getOnlineUsers(options = { offset: 0, limit: 100 }) {
    try {
      const pattern = `${this.userDataPrefix}:*`;
      const users = [];
      let cursor = options.offset;

      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          options.limit
        );

        cursor = nextCursor;

        if (keys.length) {
          const pipeline = this.redis.pipeline();
          keys.forEach((key) => pipeline.hGetAll(key));
          const results = await pipeline.exec();

          users.push(
            ...results
              .filter(([err, data]) => !err && Object.keys(data).length)
              .map(([_, data]) => data)
          );
        }
      } while (cursor !== "0" && users.length < options.limit);

      return users.slice(0, options.limit);
    } catch (error) {
      console.error("❌ Erreur getOnlineUsers:", error);
      return [];
    }
  }

  // Méthode pour récupérer les données utilisateur
  async getUserData(userId) {
    try {
      const data = await this.redis.hGetAll(`${this.userDataPrefix}:${userId}`);
      console.log(`🔍 getUserData pour ${userId}:`, data);
      return Object.keys(data).length > 0 ? data : null;
    } catch (error) {
      console.error("❌ Erreur getUserData:", error);
      return null;
    }
  }
}

module.exports = OnlineUserManager;
