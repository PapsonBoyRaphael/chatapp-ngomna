/**
 * UnreadMessageManager - Adapter compatible pour @chatapp-ngomna/shared
 * ✅ Wrapper autour du UnreadMessageManager du shared
 * ✅ Signature compatible avec l'utilisation locale
 */

const { UnreadMessageManager: SharedUnreadMessageManager } = require("@chatapp-ngomna/shared");

class UnreadMessageManager {
  constructor(redis, io = null) {
    if (!redis) {
      throw new Error("redis est requis pour UnreadMessageManager");
    }

    // ✅ Créer l'instance du shared
    this._manager = new SharedUnreadMessageManager(io, {});

    // ✅ Initialiser avec le client Redis fourni
    this.redis = redis;
    this._manager.redis = redis;
    this._manager.redisManager = null;
    this._manager.isInitialized = true;

    this.io = io;
    this.unreadPrefix = this._manager.unreadPrefix;
    this.defaultTTL = this._manager.defaultTTL;
  }

  // ✅ DÉLÉGUER TOUTES LES MÉTHODES
  async incrementUnread(userId, conversationId) {
    return await this._manager.incrementUnread(userId, conversationId);
  }

  async decrementUnread(userId, conversationId) {
    return await this._manager.decrementUnread(userId, conversationId);
  }

  async setUnread(userId, conversationId, count) {
    return await this._manager.setUnread(userId, conversationId, count);
  }

  async getUnread(userId, conversationId) {
    return await this._manager.getUnread(userId, conversationId);
  }

  async getUserUnreads(userId) {
    return await this._manager.getUserUnreads(userId);
  }

  async clearUnread(userId, conversationId) {
    return await this._manager.clearUnread(userId, conversationId);
  }

  async clearAllUnread(userId) {
    return await this._manager.clearAllUnread(userId);
  }

  async getTotalUnread(userId) {
    return await this._manager.getTotalUnread(userId);
  }
}

module.exports = UnreadMessageManager;
