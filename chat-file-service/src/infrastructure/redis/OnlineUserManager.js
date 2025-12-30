/**
 * OnlineUserManager - Adapter compatible pour @chatapp-ngomna/shared
 * ✅ Wrapper autour du OnlineUserManager du shared
 * ✅ Signature compatible avec l'utilisation locale (redis en param)
 */

const { OnlineUserManager: SharedOnlineUserManager } = require("@chatapp-ngomna/shared");

class OnlineUserManager {
  constructor(redis, io = null) {
    if (!redis) {
      throw new Error("redis est requis pour OnlineUserManager");
    }

    // ✅ Créer l'instance du shared
    this._manager = new SharedOnlineUserManager(io, {});

    // ✅ Initialiser avec le client Redis fourni
    this.redis = redis;
    this._manager.redis = redis;
    this._manager.redisManager = null; // Pas de RedisManager, on utilise directement le client
    this._manager.isInitialized = true;

    // ✅ Références compatibles
    this.io = io;
    this.presencePrefix = this._manager.presencePrefix;
    this.userDataPrefix = this._manager.userDataPrefix;
    this.userSocketPrefix = this._manager.userSocketPrefix;
    this.defaultTTL = this._manager.defaultTTL;
    this.idleTTL = this._manager.idleTTL;
  }

  // ✅ DÉLÉGUER TOUTES LES MÉTHODES
  async setupExpirationListener() {
    if (this._manager.setupExpirationListener) {
      return await this._manager.setupExpirationListener();
    }
  }

  async setUserOnline(userId, socketId) {
    return await this._manager.setUserOnline(userId, socketId);
  }

  async setUserOffline(userId) {
    return await this._manager.setUserOffline(userId);
  }

  async updateLastActivity(userId) {
    return await this._manager.updateLastActivity(userId);
  }

  async getOnlineUsers() {
    return await this._manager.getOnlineUsers();
  }

  async isUserOnline(userId) {
    return await this._manager.isUserOnline(userId);
  }

  async getUserSocket(userId) {
    return await this._manager.getUserSocket(userId);
  }

  async getUserIdFromSocket(socketId) {
    if (this._manager.getUserIdFromSocket) {
      return await this._manager.getUserIdFromSocket(socketId);
    }
    return null;
  }

  async clearUserData(userId) {
    if (this._manager.clearUserData) {
      return await this._manager.clearUserData(userId);
    }
  }
}

module.exports = OnlineUserManager;
