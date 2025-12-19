class RoomManager {
  constructor(redis, io = null) {
    this.redis = redis;
    this.io = io; // ✅ AJOUTER IO POUR BROADCAST
    this.roomPrefix = "rooms";
    this.roomUsersPrefix = "room_users";
    this.userRoomsPrefix = "user_rooms";
    this.roomDataPrefix = "room_data";
    this.roomStatePrefix = "room_state";
    this.roomRolesPrefix = "room_roles"; // ✅ NOUVEAU : pour les rôles
    this.roomPeakPrefix = "room_peak"; // ✅ NOUVEAU : pics de connexion

    this.defaultRoomTTL = 3600;
    this.idleRoomTTL = 7200;
    this.archivedRoomTTL = 86400;

    // ✅ RÉFÉRENCE AU OnlineUserManager (sera injectée)
    this.onlineUserManager = null;
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

  // =======================================
  // ✅ NOUVELLES MÉTHODES DE PRÉSENCE
  // =======================================

  /**
   * ✅ NOUVEAU : Récupérer les statistiques de présence complètes d'une room
   */
  async getRoomPresenceStats(roomName) {
    try {
      const roomNameString = String(roomName);

      // 1. ✅ RÉCUPÉRER TOUS LES UTILISATEURS DE LA ROOM
      const userIds = await this.redis.sMembers(
        `${this.roomUsersPrefix}:${roomNameString}`
      );

      if (!userIds || userIds.length === 0) {
        return {
          roomName: roomNameString,
          totalUsers: 0,
          onlineUsers: 0,
          idleUsers: 0,
          offlineUsers: 0,
          users: [],
          stats: this.getEmptyStats(),
          timestamp: new Date().toISOString(),
        };
      }

      // 2. ✅ VÉRIFIER ONLINEUSEMANAGER
      if (!this.onlineUserManager) {
        console.warn(
          "⚠️ OnlineUserManager non disponible pour getRoomPresenceStats"
        );
        return this.getFallbackStats(roomNameString, userIds);
      }

      // 3. ✅ ANALYSER CHAQUE UTILISATEUR
      const users = [];
      let onlineCount = 0;
      let idleCount = 0;
      let offlineCount = 0;

      for (const userId of userIds) {
        try {
          // Données de la room
          const userRoomData = await this.redis.hGetAll(
            `${this.roomDataPrefix}:${roomNameString}:${userId}`
          );

          // Statut de présence via OnlineUserManager
          const isOnline = await this.onlineUserManager.isUserOnline(userId);
          const userData = await this.onlineUserManager.getUserData(userId);

          // Déterminer le statut précis
          let status = "offline";
          let lastActivity = null;
          let connectedAt = null;

          if (userData) {
            status = userData.status || (isOnline ? "online" : "offline");
            lastActivity = userData.lastActivity;
            connectedAt = userData.connectedAt;
          }

          // Compter les statuts
          if (status === "online") onlineCount++;
          else if (status === "idle") idleCount++;
          else offlineCount++;

          // Rôle dans la room
          const role = await this.getUserRoleInRoom(roomNameString, userId);

          // Conversation ID
          const conversationId =
            userRoomData.conversationId || roomNameString.replace("conv_", "");

          users.push({
            userId: userId,
            matricule:
              userRoomData.matricule || userData?.matricule || "Unknown",
            status,
            isOnline: status === "online",
            isIdle: status === "idle",
            isOffline: status === "offline",
            lastActivity,
            connectedAt,
            joinedAt: userRoomData.joinedAt,
            role,
            conversationId,
            // Temps de connexion calculé
            connectedDuration: this.calculateConnectedDuration(connectedAt),
            // Métadonnées complètes
            metadata: {
              roomData: userRoomData,
              presenceData: userData || {},
              lastRoomActivity: userRoomData.lastActivity,
            },
          });
        } catch (userError) {
          console.warn(
            `⚠️ Erreur analyse utilisateur ${userId}:`,
            userError.message
          );
          // Utilisateur avec données minimales
          users.push({
            userId,
            matricule: "Unknown",
            status: "offline",
            isOnline: false,
            isIdle: false,
            isOffline: true,
            error: userError.message,
          });
          offlineCount++;
        }
      }

      // 4. ✅ RÉCUPÉRER LES MÉTADONNÉES DE LA ROOM
      const roomMetadata = await this.redis.hGetAll(
        `${this.roomPrefix}:${roomNameString}`
      );

      // 5. ✅ RÉCUPÉRER LE STATUT DE LA ROOM
      const roomState =
        (await this.redis.get(`${this.roomStatePrefix}:${roomNameString}`)) ||
        "active";

      // 6. ✅ CALCULER LES STATISTIQUES AVANCÉES
      const stats = await this.calculateAdvancedStats(roomNameString, users);

      return {
        roomName: roomNameString,
        roomState,
        totalUsers: userIds.length,
        onlineUsers: onlineCount,
        idleUsers: idleCount,
        offlineUsers: offlineCount,

        // ✅ UTILISATEURS TRIÉS PAR STATUT (en ligne d'abord)
        users: users.sort((a, b) => {
          const statusOrder = { online: 0, idle: 1, offline: 2 };
          const statusSort = statusOrder[a.status] - statusOrder[b.status];
          if (statusSort !== 0) return statusSort;

          // Si même statut, trier par dernière activité
          if (a.lastActivity && b.lastActivity) {
            return new Date(b.lastActivity) - new Date(a.lastActivity);
          }
          return 0;
        }),

        // ✅ STATISTIQUES AVANCÉES
        stats,

        // ✅ MÉTADONNÉES DE LA ROOM
        roomMetadata,

        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Erreur getRoomPresenceStats:", error);
      return {
        roomName: String(roomName),
        error: error.message,
        totalUsers: 0,
        onlineUsers: 0,
        idleUsers: 0,
        offlineUsers: 0,
        users: [],
        stats: this.getEmptyStats(),
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * ✅ NOUVEAU : Calculer les statistiques avancées
   */
  async calculateAdvancedStats(roomName, users) {
    try {
      const onlineUsers = users.filter((u) => u.status === "online");
      const totalUsers = users.length;

      // Pourcentages
      const onlinePercentage =
        totalUsers > 0
          ? Math.round((onlineUsers.length / totalUsers) * 100)
          : 0;
      const idlePercentage =
        totalUsers > 0
          ? Math.round(
              (users.filter((u) => u.status === "idle").length / totalUsers) *
                100
            )
          : 0;

      // Utilisateur le plus actif
      const mostActiveUser =
        users.length > 0
          ? users.reduce((prev, current) => {
              if (!prev.lastActivity) return current;
              if (!current.lastActivity) return prev;
              return new Date(prev.lastActivity) >
                new Date(current.lastActivity)
                ? prev
                : current;
            })
          : null;

      // Temps de connexion moyen
      const averageConnectedTime =
        this.calculateAverageConnectedTime(onlineUsers);

      // Pic d'utilisateurs en ligne
      const peakOnlineCount = await this.getPeakOnlineCount(roomName);

      // Mettre à jour le pic si nécessaire
      if (onlineUsers.length > peakOnlineCount) {
        await this.updatePeakOnlineCount(roomName, onlineUsers.length);
      }

      // Distribution des rôles
      const roleDistribution = {};
      users.forEach((user) => {
        const role = user.role || "member";
        roleDistribution[role] = (roleDistribution[role] || 0) + 1;
      });

      // Activité récente (dernière heure)
      const recentActivityCount = users.filter((user) => {
        if (!user.lastActivity) return false;
        const lastActivity = new Date(user.lastActivity);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        return lastActivity > oneHourAgo;
      }).length;

      return {
        onlinePercentage,
        idlePercentage,
        offlinePercentage: 100 - onlinePercentage - idlePercentage,
        mostActiveUser: mostActiveUser
          ? {
              userId: mostActiveUser.userId,
              matricule: mostActiveUser.matricule,
              lastActivity: mostActiveUser.lastActivity,
            }
          : null,
        averageConnectedTime,
        peakOnlineCount: Math.max(peakOnlineCount, onlineUsers.length),
        currentPeak: onlineUsers.length,
        roleDistribution,
        recentActivityCount,
        // Ratios utiles
        activeRatio: totalUsers > 0 ? onlineUsers.length / totalUsers : 0,
        engagementScore: this.calculateEngagementScore(users),
        roomHealth: this.calculateRoomHealth(
          onlineUsers.length,
          totalUsers,
          recentActivityCount
        ),
      };
    } catch (error) {
      console.error("❌ Erreur calculateAdvancedStats:", error);
      return this.getEmptyStats();
    }
  }

  /**
   * ✅ NOUVEAU : Calculer le temps de connexion moyen
   */
  calculateConnectedDuration(connectedAt) {
    if (!connectedAt) return null;

    try {
      const now = new Date();
      const connected = new Date(connectedAt);
      const diffMs = now - connected;
      const diffMinutes = Math.floor(diffMs / (1000 * 60));

      if (diffMinutes < 1) return "< 1m";
      if (diffMinutes < 60) return `${diffMinutes}m`;
      if (diffMinutes < 1440)
        return `${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}m`;
      return `${Math.floor(diffMinutes / 1440)}j ${Math.floor(
        (diffMinutes % 1440) / 60
      )}h`;
    } catch (error) {
      return null;
    }
  }

  /**
   * ✅ NOUVEAU : Calculer le temps moyen de connexion
   */
  calculateAverageConnectedTime(onlineUsers) {
    try {
      if (onlineUsers.length === 0) return "0m";

      const now = new Date();
      let totalMinutes = 0;
      let validUsers = 0;

      for (const user of onlineUsers) {
        if (user.connectedAt) {
          const connectedTime = new Date(user.connectedAt);
          const diffMinutes = Math.floor((now - connectedTime) / (1000 * 60));
          totalMinutes += diffMinutes;
          validUsers++;
        }
      }

      if (validUsers === 0) return "0m";

      const avgMinutes = Math.floor(totalMinutes / validUsers);

      if (avgMinutes < 60) return `${avgMinutes}m`;
      if (avgMinutes < 1440)
        return `${Math.floor(avgMinutes / 60)}h ${avgMinutes % 60}m`;
      return `${Math.floor(avgMinutes / 1440)}j ${Math.floor(
        (avgMinutes % 1440) / 60
      )}h`;
    } catch (error) {
      return "N/A";
    }
  }

  /**
   * ✅ NOUVEAU : Calculer le score d'engagement (0-100)
   */
  calculateEngagementScore(users) {
    try {
      if (users.length === 0) return 0;

      let score = 0;
      const now = new Date();

      users.forEach((user) => {
        // Points pour le statut
        if (user.status === "online") score += 10;
        else if (user.status === "idle") score += 5;

        // Points pour l'activité récente
        if (user.lastActivity) {
          const diffHours =
            (now - new Date(user.lastActivity)) / (1000 * 60 * 60);
          if (diffHours < 1) score += 8;
          else if (diffHours < 6) score += 5;
          else if (diffHours < 24) score += 2;
        }

        // Points pour le rôle (admin/moderator plus engagés)
        if (user.role === "admin") score += 3;
        else if (user.role === "moderator") score += 2;
      });

      // Normaliser sur 100
      const maxPossibleScore = users.length * 21; // 10+8+3
      return Math.min(100, Math.round((score / maxPossibleScore) * 100));
    } catch (error) {
      return 0;
    }
  }

  /**
   * ✅ NOUVEAU : Calculer la santé de la room (healthy, moderate, low)
   */
  calculateRoomHealth(onlineUsers, totalUsers, recentActivity) {
    try {
      if (totalUsers === 0) return "empty";

      const onlineRatio = onlineUsers / totalUsers;
      const activityRatio = recentActivity / totalUsers;

      if (onlineRatio >= 0.5 && activityRatio >= 0.3) return "healthy";
      if (onlineRatio >= 0.2 && activityRatio >= 0.1) return "moderate";
      return "low";
    } catch (error) {
      return "unknown";
    }
  }

  /**
   * ✅ NOUVEAU : Gestion des rôles
   */
  async getUserRoleInRoom(roomName, userId) {
    try {
      const role = await this.redis.hGet(
        `${this.roomRolesPrefix}:${roomName}`,
        String(userId)
      );
      return role || "member";
    } catch (error) {
      return "member";
    }
  }

  async setUserRoleInRoom(roomName, userId, role) {
    try {
      await this.redis.hSet(
        `${this.roomRolesPrefix}:${roomName}`,
        String(userId),
        String(role)
      );

      // Mettre TTL sur les rôles
      await this.redis.expire(`${this.roomRolesPrefix}:${roomName}`, 86400 * 7); // 7 jours

      console.log(`👑 Rôle ${role} assigné à ${userId} dans ${roomName}`);
      return true;
    } catch (error) {
      console.error("❌ Erreur setUserRoleInRoom:", error);
      return false;
    }
  }

  /**
   * ✅ NOUVEAU : Gestion des pics de connexion
   */
  async getPeakOnlineCount(roomName) {
    try {
      const peakKey = `${this.roomPeakPrefix}:${roomName}`;
      const peakData = await this.redis.hGetAll(peakKey);

      if (!peakData || !peakData.count) return 0;

      return {
        count: parseInt(peakData.count) || 0,
        timestamp: peakData.timestamp,
        duration: peakData.duration || "0m",
      };
    } catch (error) {
      return 0;
    }
  }

  async updatePeakOnlineCount(roomName, currentCount) {
    try {
      const peakKey = `${this.roomPeakPrefix}:${roomName}`;
      const currentPeak = await this.getPeakOnlineCount(roomName);
      const currentPeakCount =
        typeof currentPeak === "object" ? currentPeak.count : currentPeak;

      if (currentCount > currentPeakCount) {
        await this.redis.hSet(peakKey, {
          count: currentCount.toString(),
          timestamp: new Date().toISOString(),
          roomName: String(roomName),
        });

        await this.redis.expire(peakKey, 86400 * 30); // 30 jours

        console.log(
          `🏔️ Nouveau pic pour ${roomName}: ${currentCount} utilisateurs`
        );
        return currentCount;
      }

      return currentPeakCount;
    } catch (error) {
      console.error("❌ Erreur updatePeakOnlineCount:", error);
      return 0;
    }
  }

  /**
   * ✅ NOUVEAU : Obtenir toutes les conversations avec présence pour un utilisateur
   */
  async getConversationsWithPresence(userId) {
    try {
      const userIdString = String(userId);

      // 1. Récupérer toutes les rooms de l'utilisateur
      const userRooms = await this.getUserRooms(userIdString);

      const conversations = [];

      for (const roomName of userRooms) {
        if (!roomName.startsWith("conv_")) continue;

        const conversationId = roomName.replace("conv_", "");

        try {
          // 2. Récupérer les statistiques de présence
          const presenceStats = await this.getRoomPresenceStats(roomName);

          // 3. Récupérer les métadonnées de la conversation
          const metadata = await this.redis.hGetAll(
            `room_metadata:${roomName}`
          );

          // 4. Vérifier le statut de l'utilisateur dans cette conversation
          const userStatus = presenceStats.users.find(
            (u) => u.userId === userIdString
          );

          conversations.push({
            conversationId,
            title: metadata.title || "Conversation",
            type: metadata.type || "CONVERSATION",
            isPrivate: metadata.isPrivate === "true",

            // Statistiques de présence
            onlineUsers: presenceStats.onlineUsers,
            idleUsers: presenceStats.idleUsers,
            totalUsers: presenceStats.totalUsers,
            isActive: presenceStats.roomState === "active",
            roomHealth: presenceStats.stats.roomHealth,

            // Statut de l'utilisateur courant
            userStatus: userStatus
              ? {
                  isOnline: userStatus.isOnline,
                  isIdle: userStatus.isIdle,
                  lastActivity: userStatus.lastActivity,
                  role: userStatus.role,
                  connectedDuration: userStatus.connectedDuration,
                }
              : {
                  isOnline: false,
                  isIdle: false,
                  role: "member",
                },

            // Statistiques détaillées
            presenceStats: {
              onlinePercentage: presenceStats.stats.onlinePercentage,
              averageConnectedTime: presenceStats.stats.averageConnectedTime,
              peakOnlineCount: presenceStats.stats.peakOnlineCount,
              engagementScore: presenceStats.stats.engagementScore,
              recentActivityCount: presenceStats.stats.recentActivityCount,
            },

            // Métadonnées complètes
            metadata,
            lastActivity: presenceStats.roomMetadata.lastActivity,
            createdAt: metadata.createdAt,

            timestamp: new Date().toISOString(),
          });
        } catch (convError) {
          console.warn(
            `⚠️ Erreur traitement conversation ${conversationId}:`,
            convError.message
          );

          // Conversation avec données minimales
          conversations.push({
            conversationId,
            title: "Conversation",
            onlineUsers: 0,
            totalUsers: 0,
            isActive: false,
            userStatus: { isOnline: false, isIdle: false },
            error: convError.message,
          });
        }
      }

      // Trier par activité (conversations actives d'abord)
      return conversations.sort((a, b) => {
        if (a.isActive !== b.isActive) return b.isActive - a.isActive;
        if (a.onlineUsers !== b.onlineUsers)
          return b.onlineUsers - a.onlineUsers;
        return new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0);
      });
    } catch (error) {
      console.error("❌ Erreur getConversationsWithPresence:", error);
      return [];
    }
  }

  /**
   * ✅ NOUVEAU : Broadcast des mises à jour de présence
   */
  async broadcastPresenceUpdate(roomName) {
    try {
      if (!this.io) {
        console.warn("⚠️ Socket.IO non disponible pour broadcast");
        return false;
      }

      const presenceStats = await this.getRoomPresenceStats(roomName);
      const conversationId = roomName.replace("conv_", "");

      // Émettre à tous les membres de la room
      this.io.to(roomName).emit("presence:update", {
        conversationId,
        ...presenceStats,
        event: "presence_updated",
        timestamp: new Date().toISOString(),
      });

      // Émettre aussi aux surveillants de présence
      this.io.to(`presence_${roomName}`).emit("presence:realtime", {
        conversationId,
        ...presenceStats,
        event: "presence_realtime_update",
        timestamp: new Date().toISOString(),
      });

      console.log(
        `📡 Présence diffusée: ${roomName} (${presenceStats.onlineUsers}/${presenceStats.totalUsers})`
      );
      return true;
    } catch (error) {
      console.error("❌ Erreur broadcastPresenceUpdate:", error);
      return false;
    }
  }

  /**
   * ✅ NOUVEAU : Dashboard global de présence
   */
  async getGlobalPresenceDashboard() {
    try {
      const rooms = await this.getRooms();

      let totalConversations = 0;
      let totalUsers = 0;
      let totalOnline = 0;
      let totalIdle = 0;
      const conversations = [];
      const healthDistribution = { healthy: 0, moderate: 0, low: 0, empty: 0 };

      for (const room of rooms) {
        if (room.name.startsWith("conv_")) {
          const presence = await this.getRoomPresenceStats(room.name);

          totalConversations++;
          totalUsers += presence.totalUsers;
          totalOnline += presence.onlineUsers;
          totalIdle += presence.idleUsers;

          healthDistribution[presence.stats.roomHealth]++;

          conversations.push({
            conversationId: room.name.replace("conv_", ""),
            ...presence,
          });
        }
      }

      return {
        globalStats: {
          totalConversations,
          totalUsers,
          totalOnline,
          totalIdle,
          totalOffline: totalUsers - totalOnline - totalIdle,
          onlinePercentage:
            totalUsers > 0 ? Math.round((totalOnline / totalUsers) * 100) : 0,
          averageUsersPerConversation:
            totalConversations > 0
              ? Math.round(totalUsers / totalConversations)
              : 0,
          averageOnlinePerConversation:
            totalConversations > 0
              ? Math.round(totalOnline / totalConversations)
              : 0,
          healthDistribution,
        },
        conversations: conversations.sort(
          (a, b) => b.onlineUsers - a.onlineUsers
        ),
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Erreur getGlobalPresenceDashboard:", error);
      return {
        globalStats: {
          totalConversations: 0,
          totalUsers: 0,
          totalOnline: 0,
          error: error.message,
        },
        conversations: [],
      };
    }
  }

  /**
   * ✅ UTILITAIRES
   */
  getEmptyStats() {
    return {
      onlinePercentage: 0,
      idlePercentage: 0,
      offlinePercentage: 100,
      mostActiveUser: null,
      averageConnectedTime: "0m",
      peakOnlineCount: 0,
      currentPeak: 0,
      roleDistribution: { member: 0 },
      recentActivityCount: 0,
      activeRatio: 0,
      engagementScore: 0,
      roomHealth: "empty",
    };
  }

  getFallbackStats(roomName, userIds) {
    return {
      roomName: String(roomName),
      totalUsers: userIds.length,
      onlineUsers: 0,
      idleUsers: 0,
      offlineUsers: userIds.length,
      users: userIds.map((userId) => ({
        userId,
        matricule: "Unknown",
        status: "offline",
        isOnline: false,
        isIdle: false,
        isOffline: true,
        role: "member",
        fallback: true,
      })),
      stats: this.getEmptyStats(),
      warning: "OnlineUserManager non disponible",
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = RoomManager;
