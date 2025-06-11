class OnlineUserManager {
  constructor(redisClient) {
    this.redis = redisClient;
  }

  async addUser(userId, socketId, serverId) {
    try {
      // Utiliser la syntaxe Redis v4+
      await this.redis.hSet(`user:${userId}`, {
        socketId,
        serverId,
        connectedAt: Date.now().toString(),
        status: "online",
      });

      // Ajouter à l'ensemble des utilisateurs en ligne
      await this.redis.sAdd("online_users", userId.toString());

      console.log(`Utilisateur ajouté: ${userId} sur ${serverId}`);
    } catch (error) {
      console.error("Erreur ajout utilisateur:", error);
    }
  }

  async removeUser(userId) {
    try {
      await this.redis.del(`user:${userId}`);
      await this.redis.sRem("online_users", userId.toString());
      console.log(`Utilisateur supprimé: ${userId}`);
    } catch (error) {
      console.error("Erreur suppression utilisateur:", error);
    }
  }

  async getOnlineUsers() {
    try {
      return await this.redis.sMembers("online_users");
    } catch (error) {
      console.error("Erreur récupération utilisateurs:", error);
      return [];
    }
  }

  async getOnlineUsersCount() {
    try {
      return await this.redis.sCard("online_users");
    } catch (error) {
      console.error("Erreur comptage utilisateurs:", error);
      return 0;
    }
  }

  async getUserInfo(userId) {
    try {
      return await this.redis.hGetAll(`user:${userId}`);
    } catch (error) {
      console.error("Erreur info utilisateur:", error);
      return null;
    }
  }

  async isUserOnline(userId) {
    try {
      return await this.redis.sIsMember("online_users", userId.toString());
    } catch (error) {
      console.error("Erreur vérification utilisateur:", error);
      return false;
    }
  }
}

module.exports = OnlineUserManager;
