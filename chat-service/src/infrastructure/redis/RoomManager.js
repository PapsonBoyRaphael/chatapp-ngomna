class RoomManager {
  constructor(redisClient) {
    this.redis = redisClient;
  }

  async createRoom(roomId, roomData) {
    try {
      await this.redis.hSet(`room:${roomId}`, {
        name: roomData.name,
        type: roomData.type,
        creator: roomData.creator.toString(),
        createdAt: roomData.createdAt,
        participants: JSON.stringify(roomData.participants),
      });

      await this.redis.sAdd("active_rooms", roomId);
      console.log(`Salon créé: ${roomId}`);
    } catch (error) {
      console.error("Erreur création salon:", error);
    }
  }

  async removeRoom(roomId) {
    try {
      await this.redis.del(`room:${roomId}`);
      await this.redis.sRem("active_rooms", roomId);
      console.log(`Salon supprimé: ${roomId}`);
    } catch (error) {
      console.error("Erreur suppression salon:", error);
    }
  }

  async getRooms() {
    try {
      const roomIds = await this.redis.sMembers("active_rooms");
      const rooms = [];

      for (const roomId of roomIds) {
        const roomData = await this.redis.hGetAll(`room:${roomId}`);
        if (roomData.name) {
          roomData.participants = JSON.parse(roomData.participants || "[]");
          rooms.push([roomId, roomData]);
        }
      }

      return rooms;
    } catch (error) {
      console.error("Erreur récupération salons:", error);
      return [];
    }
  }

  async getRoomsCount() {
    try {
      return await this.redis.sCard("active_rooms");
    } catch (error) {
      console.error("Erreur comptage salons:", error);
      return 0;
    }
  }
}

module.exports = RoomManager;
