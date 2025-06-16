class OnlineUserManager {
  constructor(redisClient) {
    this.redis = redisClient;
    this.keyPrefix = 'chat:online_users';
    this.userDataPrefix = 'chat:user_data';
  }

  async addUser(userId, socketId, serverId = 'default') {
    try {
      const userData = {
        userId,
        socketId,
        serverId,
        connectedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };

      // Ajouter à la liste des utilisateurs en ligne
      await this.redis.sAdd(this.keyPrefix, userId);
      
      // Stocker les données détaillées de l'utilisateur
      await this.redis.hSet(
        `${this.userDataPrefix}:${userId}`,
        userData
      );

      // Expiration automatique après 1 heure d'inactivité
      await this.redis.expire(`${this.userDataPrefix}:${userId}`, 3600);

      console.log(`👤 Utilisateur ${userId} ajouté (${socketId})`);
      return true;
    } catch (error) {
      console.error('Erreur ajout utilisateur:', error);
      return false;
    }
  }

  async removeUser(userId) {
    try {
      // Supprimer de la liste des utilisateurs en ligne
      await this.redis.sRem(this.keyPrefix, userId);
      
      // Supprimer les données utilisateur
      await this.redis.del(`${this.userDataPrefix}:${userId}`);

      console.log(`👤 Utilisateur ${userId} supprimé`);
      return true;
    } catch (error) {
      console.error('Erreur suppression utilisateur:', error);
      return false;
    }
  }

  async getOnlineUsers() {
    try {
      const userIds = await this.redis.sMembers(this.keyPrefix);
      const users = [];

      for (const userId of userIds) {
        const userData = await this.redis.hGetAll(`${this.userDataPrefix}:${userId}`);
        if (Object.keys(userData).length > 0) {
          users.push(userData);
        } else {
          // Nettoyer les utilisateurs sans données
          await this.redis.sRem(this.keyPrefix, userId);
        }
      }

      return users;
    } catch (error) {
      console.error('Erreur récupération utilisateurs:', error);
      return [];
    }
  }

  async getOnlineUsersCount() {
    try {
      return await this.redis.sCard(this.keyPrefix);
    } catch (error) {
      console.error('Erreur comptage utilisateurs:', error);
      return 0;
    }
  }

  async getUserData(userId) {
    try {
      const userData = await this.redis.hGetAll(`${this.userDataPrefix}:${userId}`);
      return Object.keys(userData).length > 0 ? userData : null;
    } catch (error) {
      console.error('Erreur récupération données utilisateur:', error);
      return null;
    }
  }

  async updateUserActivity(userId) {
    try {
      await this.redis.hSet(
        `${this.userDataPrefix}:${userId}`,
        'lastActivity',
        new Date().toISOString()
      );
      
      // Prolonger l'expiration
      await this.redis.expire(`${this.userDataPrefix}:${userId}`, 3600);
      
      return true;
    } catch (error) {
      console.error('Erreur mise à jour activité:', error);
      return false;
    }
  }

  async isUserOnline(userId) {
    try {
      return await this.redis.sIsMember(this.keyPrefix, userId);
    } catch (error) {
      console.error('Erreur vérification utilisateur en ligne:', error);
      return false;
    }
  }

  async cleanupInactiveUsers() {
    try {
      const userIds = await this.redis.sMembers(this.keyPrefix);
      let cleanedCount = 0;

      for (const userId of userIds) {
        const userData = await this.redis.hGetAll(`${this.userDataPrefix}:${userId}`);
        
        if (Object.keys(userData).length === 0) {
          // Pas de données -> supprimer
          await this.redis.sRem(this.keyPrefix, userId);
          cleanedCount++;
        } else if (userData.lastActivity) {
          // Vérifier l'inactivité (plus de 2 heures)
          const lastActivity = new Date(userData.lastActivity);
          const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
          
          if (lastActivity < twoHoursAgo) {
            await this.removeUser(userId);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 ${cleanedCount} utilisateurs inactifs nettoyés`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('Erreur nettoyage utilisateurs:', error);
      return 0;
    }
  }
}

module.exports = OnlineUserManager;
