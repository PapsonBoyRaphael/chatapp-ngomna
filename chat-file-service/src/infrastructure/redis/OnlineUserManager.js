class OnlineUserManager {
  constructor(redis) {
    this.redis = redis;
    this.keyPrefix = "online_users";
    this.userDataPrefix = "user_data";
    this.userSocketPrefix = "user_sockets";
  }

  // ✅ CORRIGER setUserOnline AVEC VALIDATION DES TYPES
  async setUserOnline(userId, userData = {}) {
    try {
      // ✅ VALIDATION ET CONVERSION DES TYPES
      const userIdString = String(userId); // Convertir en string

      if (
        !userIdString ||
        userIdString === "undefined" ||
        userIdString === "null"
      ) {
        throw new Error("userId invalide");
      }

      // ✅ PRÉPARER LES DONNÉES AVEC SÉRIALISATION APPROPRIÉE
      const userInfo = {
        userId: userIdString,
        socketId: userData.socketId ? String(userData.socketId) : null,
        serverId: userData.serverId ? String(userData.serverId) : "default",
        connectedAt:
          userData.connectedAt instanceof Date
            ? userData.connectedAt.toISOString()
            : String(userData.connectedAt) || new Date().toISOString(),
        lastActivity:
          userData.lastActivity instanceof Date
            ? userData.lastActivity.toISOString()
            : String(userData.lastActivity) || new Date().toISOString(),
        matricule:
          userData.matricule || userData.nom
            ? String(userData.matricule || userData.nom)
            : "Unknown",
      };

      // ✅ AJOUTER À LA LISTE DES UTILISATEURS EN LIGNE (AVEC STRING)
      await this.redis.sAdd(this.keyPrefix, userIdString);

      // ✅ STOCKER LES DONNÉES UTILISATEUR (AVEC CONVERSION EN STRINGS)
      const redisData = {};
      for (const [key, value] of Object.entries(userInfo)) {
        if (value !== null && value !== undefined) {
          redisData[key] = String(value);
        }
      }

      await this.redis.hSet(
        `${this.userDataPrefix}:${userIdString}`,
        redisData
      );

      // ✅ STOCKER LA RELATION SOCKET -> USERID SI DISPONIBLE
      if (userInfo.socketId && userInfo.socketId !== "null") {
        await this.redis.set(
          `${this.userSocketPrefix}:${userInfo.socketId}`,
          userIdString,
          "EX",
          3600 // Expire dans 1 heure
        );
      }

      // Expiration automatique après 1 heure d'inactivité
      await this.redis.expire(`${this.userDataPrefix}:${userIdString}`, 3600);

      console.log(
        `👤 Utilisateur ${userIdString} (${userInfo.matricule}) mis en ligne`
      );
      return true;
    } catch (error) {
      console.error("❌ Erreur setUserOnline:", error);
      return false;
    }
  }

  // ✅ CORRIGER setUserOffline AVEC VALIDATION
  async setUserOffline(userId) {
    try {
      const userIdString = String(userId);

      if (
        !userIdString ||
        userIdString === "undefined" ||
        userIdString === "null"
      ) {
        console.warn("⚠️ UserId invalide pour setUserOffline:", userId);
        return false;
      }

      // Récupérer les données utilisateur pour le nettoyage
      const userData = await this.redis.hGetAll(
        `${this.userDataPrefix}:${userIdString}`
      );

      // Supprimer de la liste des utilisateurs en ligne
      await this.redis.sRem(this.keyPrefix, userIdString);

      // Supprimer les données utilisateur
      await this.redis.del(`${this.userDataPrefix}:${userIdString}`);

      // Supprimer la relation socket si elle existe
      if (userData && userData.socketId) {
        await this.redis.del(`${this.userSocketPrefix}:${userData.socketId}`);
      }

      console.log(`👋 Utilisateur ${userIdString} mis hors ligne`);
      return true;
    } catch (error) {
      console.error("❌ Erreur setUserOffline:", error);
      return false;
    }
  }

  // ✅ CORRIGER addUser AVEC VALIDATION
  async addUser(userId, socketId, serverId = "default") {
    return this.setUserOnline(userId, {
      socketId: socketId ? String(socketId) : null,
      serverId: String(serverId),
    });
  }

  async removeUser(userId) {
    return this.setUserOffline(userId);
  }

  async getUserData(userId) {
    try {
      const userIdString = String(userId);
      const data = await this.redis.hGetAll(
        `${this.userDataPrefix}:${userIdString}`
      );
      return Object.keys(data).length > 0 ? data : null;
    } catch (error) {
      console.error("❌ Erreur getUserData:", error);
      return null;
    }
  }

  async isUserOnline(userId) {
    try {
      const userIdString = String(userId);
      return await this.redis.sIsMember(this.keyPrefix, userIdString);
    } catch (error) {
      console.error("❌ Erreur isUserOnline:", error);
      return false;
    }
  }

  async getOnlineUsers() {
    try {
      const userIds = await this.redis.sMembers(this.keyPrefix);
      const users = [];

      for (const userId of userIds) {
        const userData = await this.getUserData(userId);
        if (userData) {
          users.push(userData);
        }
      }

      return users;
    } catch (error) {
      console.error("❌ Erreur getOnlineUsers:", error);
      return [];
    }
  }

  async getOnlineUsersCount() {
    try {
      return await this.redis.sCard(this.keyPrefix);
    } catch (error) {
      console.error("❌ Erreur getOnlineUsersCount:", error);
      return 0;
    }
  }

  async updateLastActivity(userId) {
    try {
      const userIdString = String(userId);
      await this.redis.hSet(
        `${this.userDataPrefix}:${userIdString}`,
        "lastActivity",
        new Date().toISOString()
      );

      // Renouveler l'expiration
      await this.redis.expire(`${this.userDataPrefix}:${userIdString}`, 3600);
      return true;
    } catch (error) {
      console.error("❌ Erreur updateLastActivity:", error);
      return false;
    }
  }

  async cleanupInactiveUsers() {
    try {
      const userIds = await this.redis.sMembers(this.keyPrefix);
      let cleanedCount = 0;

      for (const userId of userIds) {
        const userData = await this.getUserData(userId);

        if (!userData) {
          // Données corrompues, nettoyer
          await this.redis.sRem(this.keyPrefix, userId);
          cleanedCount++;
          continue;
        }

        // Vérifier si l'utilisateur est inactif depuis plus d'1 heure
        if (userData.lastActivity) {
          const lastActivity = new Date(userData.lastActivity);
          const now = new Date();
          const diffMinutes = (now - lastActivity) / (1000 * 60);

          if (diffMinutes > 60) {
            await this.setUserOffline(userId);
            cleanedCount++;
          }
        }
      }

      console.log(`🧹 ${cleanedCount} utilisateurs inactifs nettoyés`);
      return cleanedCount;
    } catch (error) {
      console.error("❌ Erreur cleanupInactiveUsers:", error);
      return 0;
    }
  }

  async getStats() {
    try {
      const totalOnline = await this.getOnlineUsersCount();
      const users = await this.getOnlineUsers();

      return {
        totalOnline,
        users: users.map((user) => ({
          userId: user.userId,
          matricule: user.matricule,
          connectedAt: user.connectedAt,
          lastActivity: user.lastActivity,
        })),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Erreur getStats:", error);
      return { totalOnline: 0, users: [], error: error.message };
    }
  }
}

module.exports = OnlineUserManager;
