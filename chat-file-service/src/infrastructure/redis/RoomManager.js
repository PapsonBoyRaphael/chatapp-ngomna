/**
 * RoomManager - Adapter compatible pour @chatapp-ngomna/shared
 * ✅ Wrapper autour du RoomManager du shared
 * ✅ Signature compatible avec l'utilisation locale (redis en param)
 */

const { RoomManager: SharedRoomManager } = require("@chatapp-ngomna/shared");

class RoomManager {
  constructor(redis, io = null) {
    if (!redis) {
      throw new Error("redis est requis pour RoomManager");
    }

    // ✅ Créer l'instance du shared
    this._manager = new SharedRoomManager(io, {});

    // ✅ Initialiser avec le client Redis fourni
    this.redis = redis;
    this._manager.redis = redis;
    this._manager.redisManager = null;
    this._manager.isInitialized = true;

    // ✅ Références compatibles
    this.io = io;
    this.roomPrefix = this._manager.roomPrefix;
    this.roomUserPrefix = this._manager.roomUserPrefix;
    this.defaultTTL = this._manager.defaultTTL;
  }

  // ✅ DÉLÉGUER TOUTES LES MÉTHODES
  async initializeRoom(roomId, metadata = {}) {
    return await this._manager.initializeRoom(roomId, metadata);
  }

  async addUserToRoom(roomId, userId, socketId) {
    return await this._manager.addUserToRoom(roomId, userId, socketId);
  }

  async removeUserFromRoom(roomId, userId) {
    return await this._manager.removeUserFromRoom(roomId, userId);
  }

  async getRoomUsers(roomId) {
    return await this._manager.getRoomUsers(roomId);
  }

  async getRoomUserCount(roomId) {
    return await this._manager.getRoomUserCount(roomId);
  }

  async isUserInRoom(roomId, userId) {
    return await this._manager.isUserInRoom(roomId, userId);
  }

  async setRoomMetadata(roomId, metadata) {
    return await this._manager.setRoomMetadata(roomId, metadata);
  }

  async getRoomMetadata(roomId) {
    return await this._manager.getRoomMetadata(roomId);
  }

  async deleteRoom(roomId) {
    return await this._manager.deleteRoom(roomId);
  }

  async getAllRooms() {
    return await this._manager.getAllRooms();
  }

  async getRoomStats(roomId) {
    return await this._manager.getRoomStats(roomId);
  }

  async broadcastToRoom(roomId, event, data) {
    if (this._manager.broadcastToRoom) {
      return await this._manager.broadcastToRoom(roomId, event, data);
    }
    if (this.io && this.io.to) {
      this.io.to(roomId).emit(event, data);
    }
  }
}

module.exports = RoomManager;
