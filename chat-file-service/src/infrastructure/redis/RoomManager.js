class RoomManager {
  constructor(redisClient) {
    this.redis = redisClient;
    this.roomsKey = 'chat:rooms';
    this.roomDataPrefix = 'chat:room_data';
    this.roomParticipantsPrefix = 'chat:room_participants';
  }

  async createRoom(roomId, roomData) {
    try {
      const room = {
        id: roomId,
        name: roomData.name || `Room ${roomId}`,
        type: roomData.type || 'conversation',
        creator: roomData.creator,
        createdAt: roomData.createdAt || new Date().toISOString(),
        isActive: true,
        metadata: roomData.metadata || {}
      };

      // Ajouter à la liste des salons
      await this.redis.sAdd(this.roomsKey, roomId);
      
      // Stocker les données du salon
      await this.redis.hSet(`${this.roomDataPrefix}:${roomId}`, room);

      // Initialiser la liste des participants
      if (roomData.participants && roomData.participants.length > 0) {
        await this.redis.sAdd(
          `${this.roomParticipantsPrefix}:${roomId}`,
          ...roomData.participants
        );
      }

      console.log(`🏠 Salon créé: ${roomId} (${room.name})`);
      return room;
    } catch (error) {
      console.error('Erreur création salon:', error);
      return null;
    }
  }

  async getRooms() {
    try {
      const roomIds = await this.redis.sMembers(this.roomsKey);
      const rooms = [];

      for (const roomId of roomIds) {
        const roomData = await this.redis.hGetAll(`${this.roomDataPrefix}:${roomId}`);
        
        if (Object.keys(roomData).length > 0) {
          // Récupérer les participants
          const participants = await this.redis.sMembers(
            `${this.roomParticipantsPrefix}:${roomId}`
          );
          
          rooms.push({
            ...roomData,
            participants
          });
        } else {
          // Nettoyer les salons sans données
          await this.redis.sRem(this.roomsKey, roomId);
        }
      }

      return rooms;
    } catch (error) {
      console.error('Erreur récupération salons:', error);
      return [];
    }
  }

  async getRoomsCount() {
    try {
      return await this.redis.sCard(this.roomsKey);
    } catch (error) {
      console.error('Erreur comptage salons:', error);
      return 0;
    }
  }

  async getRoomData(roomId) {
    try {
      const roomData = await this.redis.hGetAll(`${this.roomDataPrefix}:${roomId}`);
      
      if (Object.keys(roomData).length === 0) {
        return null;
      }

      // Récupérer les participants
      const participants = await this.redis.sMembers(
        `${this.roomParticipantsPrefix}:${roomId}`
      );

      return {
        ...roomData,
        participants
      };
    } catch (error) {
      console.error('Erreur récupération données salon:', error);
      return null;
    }
  }

  async addParticipant(roomId, userId) {
    try {
      // Vérifier que le salon existe
      const exists = await this.redis.sIsMember(this.roomsKey, roomId);
      if (!exists) {
        console.warn(`Salon ${roomId} n'existe pas`);
        return false;
      }

      // Ajouter le participant
      await this.redis.sAdd(`${this.roomParticipantsPrefix}:${roomId}`, userId);
      
      // Mettre à jour la date de dernière activité
      await this.redis.hSet(
        `${this.roomDataPrefix}:${roomId}`,
        'lastActivity',
        new Date().toISOString()
      );

      console.log(`👤 ${userId} ajouté au salon ${roomId}`);
      return true;
    } catch (error) {
      console.error('Erreur ajout participant:', error);
      return false;
    }
  }

  async removeParticipant(roomId, userId) {
    try {
      await this.redis.sRem(`${this.roomParticipantsPrefix}:${roomId}`, userId);
      
      // Mettre à jour la date de dernière activité
      await this.redis.hSet(
        `${this.roomDataPrefix}:${roomId}`,
        'lastActivity',
        new Date().toISOString()
      );

      console.log(`👤 ${userId} retiré du salon ${roomId}`);
      return true;
    } catch (error) {
      console.error('Erreur suppression participant:', error);
      return false;
    }
  }

  async getRoomParticipants(roomId) {
    try {
      return await this.redis.sMembers(`${this.roomParticipantsPrefix}:${roomId}`);
    } catch (error) {
      console.error('Erreur récupération participants:', error);
      return [];
    }
  }

  async isParticipant(roomId, userId) {
    try {
      return await this.redis.sIsMember(
        `${this.roomParticipantsPrefix}:${roomId}`,
        userId
      );
    } catch (error) {
      console.error('Erreur vérification participant:', error);
      return false;
    }
  }

  async deleteRoom(roomId) {
    try {
      // Supprimer de la liste des salons
      await this.redis.sRem(this.roomsKey, roomId);
      
      // Supprimer les données du salon
      await this.redis.del(`${this.roomDataPrefix}:${roomId}`);
      
      // Supprimer la liste des participants
      await this.redis.del(`${this.roomParticipantsPrefix}:${roomId}`);

      console.log(`🗑️ Salon ${roomId} supprimé`);
      return true;
    } catch (error) {
      console.error('Erreur suppression salon:', error);
      return false;
    }
  }

  async updateRoomActivity(roomId) {
    try {
      await this.redis.hSet(
        `${this.roomDataPrefix}:${roomId}`,
        'lastActivity',
        new Date().toISOString()
      );
      return true;
    } catch (error) {
      console.error('Erreur mise à jour activité salon:', error);
      return false;
    }
  }

  async getRoomsByUser(userId) {
    try {
      const roomIds = await this.redis.sMembers(this.roomsKey);
      const userRooms = [];

      for (const roomId of roomIds) {
        const isParticipant = await this.redis.sIsMember(
          `${this.roomParticipantsPrefix}:${roomId}`,
          userId
        );

        if (isParticipant) {
          const roomData = await this.getRoomData(roomId);
          if (roomData) {
            userRooms.push(roomData);
          }
        }
      }

      return userRooms;
    } catch (error) {
      console.error('Erreur récupération salons utilisateur:', error);
      return [];
    }
  }

  async cleanupInactiveRooms() {
    try {
      const roomIds = await this.redis.sMembers(this.roomsKey);
      let cleanedCount = 0;

      for (const roomId of roomIds) {
        const roomData = await this.redis.hGetAll(`${this.roomDataPrefix}:${roomId}`);
        
        if (Object.keys(roomData).length === 0) {
          // Pas de données -> supprimer
          await this.deleteRoom(roomId);
          cleanedCount++;
        } else if (roomData.lastActivity) {
          // Vérifier l'inactivité (plus de 7 jours)
          const lastActivity = new Date(roomData.lastActivity);
          const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          
          if (lastActivity < weekAgo) {
            // Vérifier s'il y a encore des participants
            const participantCount = await this.redis.sCard(
              `${this.roomParticipantsPrefix}:${roomId}`
            );
            
            if (participantCount === 0) {
              await this.deleteRoom(roomId);
              cleanedCount++;
            }
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 ${cleanedCount} salons inactifs nettoyés`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('Erreur nettoyage salons:', error);
      return 0;
    }
  }
}

module.exports = RoomManager;
