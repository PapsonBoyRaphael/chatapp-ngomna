class RoomManager {
  constructor(redis) {
    this.redis = redis;
    this.roomPrefix = "rooms";
    this.roomUsersPrefix = "room_users";
    this.userRoomsPrefix = "user_rooms";
    this.roomDataPrefix = "room_data";
  }

  // ✅ CORRIGER addUserToRoom AVEC VALIDATION DES TYPES
  async addUserToRoom(roomName, userId, userData = {}) {
    try {
      // ✅ VALIDATION ET CONVERSION DES TYPES
      const roomNameString = String(roomName);
      const userIdString = String(userId);

      if (
        !roomNameString ||
        !userIdString ||
        userIdString === "undefined" ||
        userIdString === "null"
      ) {
        throw new Error(
          `Paramètres invalides: roomName=${roomName}, userId=${userId}`
        );
      }

      // ✅ PRÉPARER LES DONNÉES AVEC SÉRIALISATION
      const userInfo = {
        userId: userIdString,
        matricule: userData.matricule
          ? String(userData.matricule)
          : userData.nom
          ? String(userData.nom)
          : "Unknown",
        joinedAt: userData.joinedAt
          ? userData.joinedAt instanceof Date
            ? userData.joinedAt.toISOString()
            : String(userData.joinedAt)
          : new Date().toISOString(),
        lastActivity: userData.lastActivity
          ? userData.lastActivity instanceof Date
            ? userData.lastActivity.toISOString()
            : String(userData.lastActivity)
          : new Date().toISOString(),
        conversationId: userData.conversationId
          ? String(userData.conversationId)
          : null,
      };

      // ✅ AJOUTER L'UTILISATEUR À LA ROOM (AVEC STRINGS)
      await this.redis.sAdd(
        `${this.roomUsersPrefix}:${roomNameString}`,
        userIdString
      );

      // ✅ AJOUTER LA ROOM À LA LISTE DES ROOMS DE L'UTILISATEUR
      await this.redis.sAdd(
        `${this.userRoomsPrefix}:${userIdString}`,
        roomNameString
      );

      // ✅ STOCKER LES DONNÉES UTILISATEUR DANS LA ROOM (AVEC CONVERSION)
      const redisData = {};
      for (const [key, value] of Object.entries(userInfo)) {
        if (value !== null && value !== undefined) {
          redisData[key] = String(value);
        }
      }

      await this.redis.hSet(
        `${this.roomDataPrefix}:${roomNameString}:${userIdString}`,
        redisData
      );

      // ✅ METTRE À JOUR LES MÉTADONNÉES DE LA ROOM
      await this.redis.hSet(`${this.roomPrefix}:${roomNameString}`, {
        lastActivity: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Expiration automatique
      await this.redis.expire(
        `${this.roomDataPrefix}:${roomNameString}:${userIdString}`,
        7200
      ); // 2 heures
      await this.redis.expire(`${this.roomPrefix}:${roomNameString}`, 7200);

      console.log(
        `🏠 Utilisateur ${userIdString} (${userInfo.matricule}) ajouté à la room ${roomNameString}`
      );
      return true;
    } catch (error) {
      console.error("❌ Erreur addUserToRoom:", error);
      return false;
    }
  }

  // ✅ CORRIGER removeUserFromRoom AVEC VALIDATION
  async removeUserFromRoom(roomName, userId) {
    try {
      const roomNameString = String(roomName);
      const userIdString = String(userId);

      if (!roomNameString || !userIdString) {
        console.warn("⚠️ Paramètres invalides pour removeUserFromRoom:", {
          roomName,
          userId,
        });
        return false;
      }

      // Supprimer l'utilisateur de la room
      await this.redis.sRem(
        `${this.roomUsersPrefix}:${roomNameString}`,
        userIdString
      );

      // Supprimer la room de la liste des rooms de l'utilisateur
      await this.redis.sRem(
        `${this.userRoomsPrefix}:${userIdString}`,
        roomNameString
      );

      // Supprimer les données utilisateur de la room
      await this.redis.del(
        `${this.roomDataPrefix}:${roomNameString}:${userIdString}`
      );

      // Vérifier si la room est vide
      const usersCount = await this.redis.sCard(
        `${this.roomUsersPrefix}:${roomNameString}`
      );
      if (usersCount === 0) {
        // Supprimer la room si elle est vide
        await this.redis.del(`${this.roomPrefix}:${roomNameString}`);
        console.log(`🏠 Room ${roomNameString} supprimée (vide)`);
      }

      console.log(
        `👋 Utilisateur ${userIdString} retiré de la room ${roomNameString}`
      );
      return true;
    } catch (error) {
      console.error("❌ Erreur removeUserFromRoom:", error);
      return false;
    }
  }

  async createRoom(roomName, options = {}) {
    try {
      const roomNameString = String(roomName);

      const roomData = {
        name: roomNameString,
        type: options.type ? String(options.type) : "CONVERSATION",
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        maxUsers: options.maxUsers ? String(options.maxUsers) : "100",
        isPrivate: options.isPrivate ? String(options.isPrivate) : "false",
        description: options.description ? String(options.description) : "",
      };

      await this.redis.hSet(`${this.roomPrefix}:${roomNameString}`, roomData);
      await this.redis.expire(`${this.roomPrefix}:${roomNameString}`, 7200);

      console.log(`🏠 Room ${roomNameString} créée`);
      return true;
    } catch (error) {
      console.error("❌ Erreur createRoom:", error);
      return false;
    }
  }

  async getRoomUsers(roomName) {
    try {
      const roomNameString = String(roomName);
      const userIds = await this.redis.sMembers(
        `${this.roomUsersPrefix}:${roomNameString}`
      );
      const users = [];

      for (const userId of userIds) {
        const userData = await this.redis.hGetAll(
          `${this.roomDataPrefix}:${roomNameString}:${userId}`
        );
        if (Object.keys(userData).length > 0) {
          users.push(userData);
        }
      }

      return users;
    } catch (error) {
      console.error("❌ Erreur getRoomUsers:", error);
      return [];
    }
  }

  async getUserRooms(userId) {
    try {
      const userIdString = String(userId);
      const roomNames = await this.redis.sMembers(
        `${this.userRoomsPrefix}:${userIdString}`
      );
      const rooms = [];

      for (const roomName of roomNames) {
        const roomData = await this.redis.hGetAll(
          `${this.roomPrefix}:${roomName}`
        );
        if (Object.keys(roomData).length > 0) {
          const usersCount = await this.redis.sCard(
            `${this.roomUsersPrefix}:${roomName}`
          );
          rooms.push({
            ...roomData,
            name: roomName,
            usersCount,
          });
        }
      }

      return rooms;
    } catch (error) {
      console.error("❌ Erreur getUserRooms:", error);
      return [];
    }
  }

  async isUserInRoom(roomName, userId) {
    try {
      const roomNameString = String(roomName);
      const userIdString = String(userId);
      return await this.redis.sIsMember(
        `${this.roomUsersPrefix}:${roomNameString}`,
        userIdString
      );
    } catch (error) {
      console.error("❌ Erreur isUserInRoom:", error);
      return false;
    }
  }

  async getRoomsCount() {
    try {
      const keys = await this.redis.keys(`${this.roomPrefix}:*`);
      return keys.length;
    } catch (error) {
      console.error("❌ Erreur getRoomsCount:", error);
      return 0;
    }
  }

  async getRooms() {
    try {
      const keys = await this.redis.keys(`${this.roomPrefix}:*`);
      const rooms = [];

      for (const key of keys) {
        const roomName = key.replace(`${this.roomPrefix}:`, "");
        const roomData = await this.redis.hGetAll(key);
        const usersCount = await this.redis.sCard(
          `${this.roomUsersPrefix}:${roomName}`
        );

        rooms.push({
          ...roomData,
          name: roomName,
          usersCount,
        });
      }

      return rooms;
    } catch (error) {
      console.error("❌ Erreur getRooms:", error);
      return [];
    }
  }

  async cleanupInactiveRooms() {
    try {
      const keys = await this.redis.keys(`${this.roomPrefix}:*`);
      let cleanedCount = 0;

      for (const key of keys) {
        const roomName = key.replace(`${this.roomPrefix}:`, "");
        const usersCount = await this.redis.sCard(
          `${this.roomUsersPrefix}:${roomName}`
        );

        if (usersCount === 0) {
          // Room vide, supprimer
          await this.redis.del(key);
          cleanedCount++;
        } else {
          // Vérifier l'activité
          const roomData = await this.redis.hGetAll(key);
          if (roomData.lastActivity) {
            const lastActivity = new Date(roomData.lastActivity);
            const now = new Date();
            const diffHours = (now - lastActivity) / (1000 * 60 * 60);

            if (diffHours > 2) {
              // Pas d'activité depuis 2h, supprimer
              await this.redis.del(key);
              await this.redis.del(`${this.roomUsersPrefix}:${roomName}`);
              cleanedCount++;
            }
          }
        }
      }

      console.log(`🧹 ${cleanedCount} rooms inactives nettoyées`);
      return cleanedCount;
    } catch (error) {
      console.error("❌ Erreur cleanupInactiveRooms:", error);
      return 0;
    }
  }

  async updateRoomActivity(roomName) {
    try {
      const roomNameString = String(roomName);
      await this.redis.hSet(
        `${this.roomPrefix}:${roomNameString}`,
        "lastActivity",
        new Date().toISOString()
      );
      return true;
    } catch (error) {
      console.error("❌ Erreur updateRoomActivity:", error);
      return false;
    }
  }

  async getStats() {
    try {
      const totalRooms = await this.getRoomsCount();
      const rooms = await this.getRooms();

      return {
        totalRooms,
        rooms: rooms.map((room) => ({
          name: room.name,
          usersCount: room.usersCount,
          lastActivity: room.lastActivity,
          type: room.type,
        })),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Erreur getStats:", error);
      return { totalRooms: 0, rooms: [], error: error.message };
    }
  }
}

module.exports = RoomManager;
