class RoomManager {
  constructor(redis) {
    this.redis = redis;
    this.roomPrefix = "rooms";
    this.roomUsersPrefix = "room_users";
    this.userRoomsPrefix = "user_rooms";
    this.roomDataPrefix = "room_data";
    this.roomStatePrefix = "room_state"; // "active" | "idle" | "archived"
    this.defaultRoomTTL = 3600; // 1 heure active
    this.idleRoomTTL = 7200; // 2 heures idle
    this.archivedRoomTTL = 86400; // 24h avant suppression définitive
  }

  // APPELER ÇA DANS addUserToRoom ET updateRoomActivity
  async setRoomActive(roomName) {
    try {
      const roomNameString = String(roomName);

      await this.redis.set(
        `${this.roomStatePrefix}:${roomNameString}`,
        "active",
        { EX: this.defaultRoomTTL }
      );

      await this.redis.hSet(`${this.roomPrefix}:${roomNameString}`, {
        lastActivity: new Date().toISOString(),
        status: "active",
      });

      console.log(
        `Room ${roomNameString} → active (TTL ${this.defaultRoomTTL}s)`
      );
      return true;
    } catch (error) {
      console.error("Erreur setRoomActive:", error);
      return false;
    }
  }

  // LISTENER D'EXPIRATION (comme OnlineUserManager)
  async setupRoomExpirationListener() {
    try {
      this.roomSubscriber = this.redis.duplicate();
      await this.roomSubscriber.connect();

      await this.redis.sendCommand([
        "CONFIG",
        "SET",
        "notify-keyspace-events",
        "KEx",
      ]);

      await this.roomSubscriber.subscribe(
        `__keyevent@0__:expired`,
        async (message) => {
          if (!message.startsWith(`${this.roomStatePrefix}:`)) return;

          const roomName = message.split(":").slice(1).join(":");
          console.log(`Expiration room détectée: ${roomName}`);

          const currentState = await this.redis.get(
            `${this.roomStatePrefix}:${roomName}`
          );

          if (currentState === "active") {
            console.log(`Room ${roomName} → idle`);
            await this.redis.set(
              `${this.roomStatePrefix}:${roomName}`,
              "idle",
              { EX: this.idleRoomTTL }
            );
            await this.redis.hSet(
              `${this.roomPrefix}:${roomName}`,
              "status",
              "idle"
            );
          } else if (currentState === "idle") {
            console.log(`Room ${roomName} → archived`);
            await this.redis.set(
              `${this.roomStatePrefix}:${roomName}`,
              "archived",
              { EX: this.archivedRoomTTL }
            );
            await this.redis.hSet(
              `${this.roomPrefix}:${roomName}`,
              "status",
              "archived"
            );
          } else if (currentState === "archived") {
            console.log(`SUPPRESSION DÉFINITIVE room: ${roomName}`);
            await this.cleanupRoomCompletely(roomName);
          }
        }
      );

      console.log("Listener expiration rooms configuré");
    } catch (error) {
      console.error("Erreur setupRoomExpirationListener:", error);
    }
  }

  async cleanupRoomCompletely(roomName) {
    try {
      const roomNameString = String(roomName);

      await this.redis.del(`${this.roomPrefix}:${roomNameString}`);
      await this.redis.del(`${this.roomUsersPrefix}:${roomNameString}`);
      await this.redis.del(`${this.roomStatePrefix}:${roomNameString}`);

      const userDataKeys = await this.redis.keys(
        `${this.roomDataPrefix}:${roomNameString}:*`
      );
      if (userDataKeys.length > 0) await this.redis.del(userDataKeys);

      const userIds = await this.redis.sMembers(
        `${this.roomUsersPrefix}:${roomNameString}`
      );
      for (const userId of userIds) {
        await this.redis.sRem(
          `${this.userRoomsPrefix}:${userId}`,
          roomNameString
        );
      }

      console.log(`Room ${roomNameString} SUPPRIMÉE COMPLÈTEMENT`);

      if (this.io) {
        this.io.emit("room_deleted", { roomName: roomNameString });
      }

      return true;
    } catch (error) {
      console.error("Erreur cleanupRoomCompletely:", error);
      return false;
    }
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

      const userInfo = {
        userId: userIdString,
        matricule: userData.matricule ? String(userData.matricule) : "Unknown",
        joinedAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
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

      // CRITIQUE : activer la room
      await this.setRoomActive(roomNameString);

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
        // Room vide → archived
        await this.redis.set(
          `${this.roomStatePrefix}:${roomNameString}`,
          "archived",
          { EX: this.archivedRoomTTL }
        );
        await this.redis.hSet(
          `${this.roomPrefix}:${roomNameString}`,
          "status",
          "archived"
        );
        console.log(`Room ${roomNameString} vide → archived`);
      }

      console.log(
        `👋 Utilisateur ${userIdString} retiré de la room ${roomNameString}`
      );

      // console.log(`🏠 Room ${roomNameString} supprimée (vide)`);

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

  // ✅ AJOUTER LA MÉTHODE MANQUANTE removeUserFromAllRooms
  async removeUserFromAllRooms(userId) {
    try {
      const userIdString = String(userId);

      if (
        !userIdString ||
        userIdString === "undefined" ||
        userIdString === "null"
      ) {
        console.warn("⚠️ UserId invalide pour removeUserFromAllRooms:", userId);
        return false;
      }

      // ✅ RÉCUPÉRER TOUTES LES ROOMS DE L'UTILISATEUR
      const userRooms = await this.redis.sMembers(
        `${this.userRoomsPrefix}:${userIdString}`
      );

      if (!userRooms || userRooms.length === 0) {
        console.log(`👤 Utilisateur ${userIdString} n'était dans aucune room`);
        return true;
      }

      console.log(
        `🏠 Suppression utilisateur ${userIdString} de ${
          userRooms.length
        } room(s): ${userRooms.join(", ")}`
      );

      // ✅ SUPPRIMER L'UTILISATEUR DE CHAQUE ROOM
      const removePromises = userRooms.map(async (roomName) => {
        try {
          await this.removeUserFromRoom(roomName, userIdString);
          return { roomName, success: true };
        } catch (error) {
          console.warn(
            `⚠️ Erreur suppression room ${roomName} pour ${userIdString}:`,
            error.message
          );
          return { roomName, success: false, error: error.message };
        }
      });

      const results = await Promise.allSettled(removePromises);

      // ✅ ANALYSER LES RÉSULTATS
      const successful = results.filter(
        (r) => r.status === "fulfilled" && r.value.success
      ).length;
      const failed = results.length - successful;

      if (failed > 0) {
        console.warn(
          `⚠️ ${failed} échecs lors de la suppression des rooms pour ${userIdString}`
        );
      }

      // ✅ NETTOYER LA LISTE DES ROOMS DE L'UTILISATEUR
      await this.redis.del(`${this.userRoomsPrefix}:${userIdString}`);

      console.log(
        `✅ Utilisateur ${userIdString} supprimé de toutes ses rooms (${successful}/${results.length} succès)`
      );
      return true;
    } catch (error) {
      console.error("❌ Erreur removeUserFromAllRooms:", error);
      return false;
    }
  }

  // ✅ MÉTHODE UTILITAIRE POUR RÉCUPÉRER LES ROOMS D'UN UTILISATEUR
  async getUserRooms(userId) {
    try {
      const userIdString = String(userId);
      const rooms = await this.redis.sMembers(
        `${this.userRoomsPrefix}:${userIdString}`
      );
      return rooms || [];
    } catch (error) {
      console.error("❌ Erreur getUserRooms:", error);
      return [];
    }
  }

  // ✅ MÉTHODE POUR NETTOYER LES ROOMS INACTIVES (AMÉLIORATION)
  async cleanupInactiveRooms() {
    try {
      let cleanedCount = 0;
      const allRoomKeys = await this.redis.keys(`${this.roomPrefix}:*`);

      for (const roomKey of allRoomKeys) {
        const roomName = roomKey.replace(`${this.roomPrefix}:`, "");
        const usersCount = await this.redis.sCard(
          `${this.roomUsersPrefix}:${roomName}`
        );

        // Si la room est vide, la supprimer
        if (usersCount === 0) {
          await this.redis.del(roomKey);
          await this.redis.del(`${this.roomUsersPrefix}:${roomName}`);
          cleanedCount++;
          console.log(`🧹 Room vide supprimée: ${roomName}`);
        }
      }

      return cleanedCount;
    } catch (error) {
      console.error("❌ Erreur cleanupInactiveRooms:", error);
      return 0;
    }
  }

  // ✅ MÉTHODE POUR OBTENIR LE NOMBRE TOTAL DE ROOMS (CORRIGÉE)
  async getRoomsCount() {
    try {
      const roomKeys = await this.redis.keys(`${this.roomPrefix}:*`);
      return roomKeys ? roomKeys.length : 0;
    } catch (error) {
      console.error("❌ Erreur getRoomsCount:", error);
      return 0;
    }
  }

  // ✅ MÉTHODE POUR LISTER TOUTES LES ROOMS (CORRIGÉE)
  async getRooms() {
    try {
      const roomKeys = await this.redis.keys(`${this.roomPrefix}:*`);
      const rooms = [];

      for (const roomKey of roomKeys) {
        const roomName = roomKey.replace(`${this.roomPrefix}:`, "");
        const usersCount = await this.redis.sCard(
          `${this.roomUsersPrefix}:${roomName}`
        );

        rooms.push({
          name: roomName,
          usersCount: usersCount,
          key: roomKey,
        });
      }

      return rooms;
    } catch (error) {
      console.error("❌ Erreur getRooms:", error);
      return [];
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
      await this.setRoomActive(roomNameString); // ← CRITIQUE
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

  /**
   * Initialise une room de conversation à partir des données MongoDB
   * Crée la room, ajoute les participants et stocke les métadonnées
   * @param {Object} conversationData - Données de la conversation MongoDB
   */
  async initializeConversationRoom(conversationData) {
    try {
      const conversationIdString = String(
        conversationData._id || conversationData.id
      );
      const roomName = `conv_${conversationIdString}`;

      // 1️⃣ Créer la room
      await this.createRoom(roomName, {
        type: "CONVERSATION",
        isPrivate: String(conversationData.isPrivate || true),
        description: conversationData.title || "",
      });

      // 2️⃣ Ajouter les participants
      const participants = conversationData.participants || [];
      for (const participant of participants) {
        await this.addUserToRoom(roomName, participant.userId, {
          matricule: participant.matricule,
          conversationId: conversationIdString,
        });
      }

      // 3️⃣ Stocker les métadonnées de la conversation
      const metadata = {
        conversationId: conversationIdString,
        title: conversationData.title || "Conversation",
        isPrivate: String(conversationData.isPrivate || true),
        createdBy: conversationData.createdBy
          ? String(conversationData.createdBy)
          : "Unknown",
        createdAt:
          conversationData.createdAt?.toISOString?.() ||
          new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        participantsCount: String(participants.length),
        unreadCounts: JSON.stringify(conversationData.unreadCounts || {}),
        userMetadata: JSON.stringify(conversationData.userMetadata || {}),
        settings: JSON.stringify(conversationData.settings || {}),
      };

      await this.redis.hSet(`room_metadata:${roomName}`, metadata);

      // Définir TTL : 7 jours pour les métadonnées
      await this.redis.expire(`room_metadata:${roomName}`, 86400 * 7);

      console.log(
        `✅ Room de conversation ${roomName} initialisée avec ${participants.length} participant(s)`
      );
      return true;
    } catch (error) {
      console.error("❌ Erreur initializeConversationRoom:", error);
      return false;
    }
  }

  /**
   * Récupère les données unifiées d'une conversation
   * Combine métadonnées Redis + données temps-réel + participants
   * @param {string} conversationId - ID de la conversation
   * @returns {Object} Données unifiées de la conversation
   */
  async getConversationData(conversationId) {
    try {
      const conversationIdString = String(conversationId);
      const roomName = `conv_${conversationIdString}`;

      // 1️⃣ Récupérer métadonnées Redis
      const metadata = await this.redis.hGetAll(`room_metadata:${roomName}`);

      if (!metadata || Object.keys(metadata).length === 0) {
        console.warn(`⚠️ Métadonnées manquantes pour ${roomName}`);
        return null;
      }

      // 2️⃣ Récupérer participants et statut temps-réel
      const users = await this.getRoomUsers(roomName);
      const roomState = await this.redis.get(
        `${this.roomStatePrefix}:${roomName}`
      );

      // 3️⃣ Assembler les données unifiées
      const unifiedData = {
        id: conversationIdString,
        title: metadata.title || "Conversation",
        isPrivate: metadata.isPrivate === "true",
        createdBy: metadata.createdBy,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
        participants: users.map((user) => ({
          userId: user.userId,
          matricule: user.matricule,
          joinedAt: user.joinedAt,
          lastActivity: user.lastActivity,
        })),
        participantsCount: users.length,
        status: roomState || "idle",
        unreadCounts: metadata.unreadCounts
          ? JSON.parse(metadata.unreadCounts)
          : {},
        userMetadata: metadata.userMetadata
          ? JSON.parse(metadata.userMetadata)
          : {},
        settings: metadata.settings ? JSON.parse(metadata.settings) : {},
      };

      return unifiedData;
    } catch (error) {
      console.error("❌ Erreur getConversationData:", error);
      return null;
    }
  }

  /**
   * Met à jour les métadonnées d'une conversation
   * Synchronise les changements MongoDB → Redis
   * @param {string} conversationId - ID de la conversation
   * @param {Object} metadata - Nouvelles métadonnées à mettre à jour
   */
  async updateConversationMetadata(conversationId, metadata) {
    try {
      const conversationIdString = String(conversationId);
      const roomName = `conv_${conversationIdString}`;

      // 1️⃣ Vérifier que la room existe
      const existingMetadata = await this.redis.hGetAll(
        `room_metadata:${roomName}`
      );
      if (!existingMetadata || Object.keys(existingMetadata).length === 0) {
        console.warn(
          `⚠️ Room ${roomName} inexistante, initialisation nécessaire`
        );
        return false;
      }

      // 2️⃣ Préparer les données de mise à jour
      const updateData = {
        updatedAt: new Date().toISOString(),
      };

      // Mettre à jour les champs fournis
      if (metadata.title) updateData.title = String(metadata.title);
      if (metadata.isPrivate !== undefined)
        updateData.isPrivate = String(metadata.isPrivate);
      if (metadata.settings)
        updateData.settings = JSON.stringify(metadata.settings);
      if (metadata.userMetadata)
        updateData.userMetadata = JSON.stringify(metadata.userMetadata);
      if (metadata.unreadCounts)
        updateData.unreadCounts = JSON.stringify(metadata.unreadCounts);

      // 3️⃣ Mettre à jour Redis
      await this.redis.hSet(`room_metadata:${roomName}`, updateData);

      // 4️⃣ Renouveler le TTL
      await this.redis.expire(`room_metadata:${roomName}`, 86400 * 7);

      // 5️⃣ Mettre à jour l'activité de la room
      await this.updateRoomActivity(roomName);

      console.log(`✅ Métadonnées du room ${roomName} mises à jour`);
      return true;
    } catch (error) {
      console.error("❌ Erreur updateConversationMetadata:", error);
      return false;
    }
  }
}

module.exports = RoomManager;
