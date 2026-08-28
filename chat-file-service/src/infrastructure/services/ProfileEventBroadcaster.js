/**
 * ProfileEventBroadcaster
 *
 * Consomme les events `identity.userupdated` (field: photo / photo_deleted)
 * depuis le stream Redis `stream:domain:identity` et emet un event Socket.IO
 * `profile:photo_updated` a tous les contacts connectes de l'utilisateur concerne.
 *
 * Utilise un consumer group dedie (`chat-service-profile-consumers`) pour ne pas
 * interferer avec le consumer RBAC existant.
 */
class ProfileEventBroadcaster {
  constructor(redisClient, io, onlineUserManager, userCacheService = null, conversationRepository = null) {
    this.redisClient = redisClient;
    this.io = io;
    this.onlineUserManager = onlineUserManager;
    this.userCacheService = userCacheService;
    this.conversationRepository = conversationRepository;

    this.streamName = process.env.STREAM_DOMAIN_IDENTITY || 'stream:domain:identity';
    this.consumerGroup = 'chat-service-profile-consumers';
    this.consumerId = `profile-broadcaster-${process.pid}`;

    this.isRunning = false;
    this.client = null;
    this.consecutiveErrors = 0;
  }

  async initialize() {
    try {
      // ✅ FIX CRITIQUE : Dupliquer le client Redis pour avoir une connexion TCP dédiée.
      // Sans ça, xReadGroup(BLOCK:5000) monopolise la connexion partagée pendant 5s
      // et bloque TOUTES les autres opérations Redis (cache.get, cache.set, xAdd WAL, etc.)
      const baseClient = await this.redisClient;
      if (typeof baseClient.duplicate === 'function') {
        this.client = baseClient.duplicate();
        await this.client.connect();
        console.log('[ProfileEventBroadcaster] Connexion Redis dédiée créée (duplicate)');
      } else {
        this.client = baseClient;
        console.warn('[ProfileEventBroadcaster] ⚠️ duplicate() non disponible, utilisation du client partagé');
      }

      try {
        await this.client.xGroupCreate(
          this.streamName,
          this.consumerGroup,
          '$', // Nouveaux messages seulement
          { MKSTREAM: true }
        );
        console.log(`[ProfileEventBroadcaster] Consumer group "${this.consumerGroup}" cree`);
      } catch (error) {
        if (!error.message.includes('BUSYGROUP')) {
          throw error;
        }
        console.log(`[ProfileEventBroadcaster] Consumer group "${this.consumerGroup}" existe deja`);
      }

      return true;
    } catch (error) {
      console.error('[ProfileEventBroadcaster] Erreur initialisation:', error.message);
      throw error;
    }
  }

  async start() {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('[ProfileEventBroadcaster] Demarrage du consumer photo...');

    await this.processPendingMessages();
    this.consumeLoop();
  }

  async processPendingMessages() {
    try {
      const pending = await this.client.xReadGroup(
        this.consumerGroup,
        this.consumerId,
        [{ key: this.streamName, id: '0' }],
        { COUNT: 50 }
      );

      if (pending && pending.length > 0) {
        for (const stream of pending) {
          for (const message of stream.messages) {
            await this.processMessage(message);
          }
        }
      }
    } catch (error) {
      console.error('[ProfileEventBroadcaster] Erreur pending:', error.message);
    }
  }

  async consumeLoop() {
    while (this.isRunning) {
      try {
        const messages = await this.client.xReadGroup(
          this.consumerGroup,
          this.consumerId,
          [{ key: this.streamName, id: '>' }],
          { COUNT: 10, BLOCK: 5000 }
        );

        this.consecutiveErrors = 0;

        if (messages && messages.length > 0) {
          for (const stream of messages) {
            for (const message of stream.messages) {
              await this.processMessage(message);
            }
          }
        }
      } catch (error) {
        this.consecutiveErrors++;
        const delay = Math.min(1000 * Math.pow(2, this.consecutiveErrors - 1), 30000);
        console.error(`[ProfileEventBroadcaster] Erreur consume loop (tentative ${this.consecutiveErrors}, retry ${delay}ms):`, error.message);
        await this.sleep(delay);
      }
    }
  }

  async processMessage(message) {
    const { id, message: data } = message;

    try {
      const eventData = this.parseMessage(data);

      // Filtrer: ne traiter que les events photo
      if (!this.isPhotoEvent(eventData)) {
        await this.client.xAck(this.streamName, this.consumerGroup, id);
        return;
      }

      console.log(`[ProfileEventBroadcaster] Event photo recu: ${id}`, {
        matricule: eventData.matricule,
        field: eventData.field
      });

      await this.broadcastPhotoUpdate(eventData);
      await this.client.xAck(this.streamName, this.consumerGroup, id);
    } catch (error) {
      console.error(`[ProfileEventBroadcaster] Erreur traitement message ${id}:`, error.message);
    }
  }

  isPhotoEvent(eventData) {
    const type = eventData.type;
    const field = eventData.field;
    const expectedType = process.env.EVENT_IDENTITY_USERUPDATED || 'identity.userupdated';

    return type === expectedType && (field === 'photo' || field === 'photo_deleted');
  }

  async broadcastPhotoUpdate(eventData) {
    const { matricule, field, photoUrl, thumbnailUrl } = eventData;

    const payload = {
      matricule,
      photoUrl: field === 'photo_deleted' ? null : (photoUrl || null),
      thumbnailUrl: field === 'photo_deleted' ? null : (thumbnailUrl || null),
      updatedAt: new Date().toISOString()
    };

    // Emettre a l'utilisateur lui-meme (toutes ses connexions)
    this.io.to(`user_${matricule}`).emit('profile:photo_updated', payload);

    // Emettre a tous les contacts via OnlineUserManager
    if (this.onlineUserManager) {
      await this.onlineUserManager.emitPresenceToContacts(
        matricule,
        'profile:photo_updated',
        payload
      );
    }

    // Invalider le cache avatar pour forcer un refresh au prochain chargement
    if (this.userCacheService) {
      await this.userCacheService.invalidateAvatarCache(matricule);
    }

    // ✅ Persister le nouvel avatar (thumbnailUrl) dans userMetadata de toutes les conversations
    if (this.conversationRepository) {
      try {
        const avatarUrl = field === 'photo_deleted' ? null : (thumbnailUrl || null);
        await this.conversationRepository.updateAvatarForUser(matricule, avatarUrl);
      } catch (avatarErr) {
        console.error('[ProfileEventBroadcaster] Erreur maj avatar en base:', avatarErr.message);
      }
    }

    // Mettre en pending queue pour les contacts offline
    if (this.messageDeliveryService && this.onlineUserManager) {
      try {
        const offlineContacts = await this.getOfflineContacts(matricule);
        for (const contactId of offlineContacts) {
          await this.messageDeliveryService.addToPendingQueue(
            contactId,
            payload,
            'profilePhotoUpdated',
          );
        }
        if (offlineContacts.length > 0) {
          console.log(
            `[ProfileEventBroadcaster] profile:photo_updated mis en attente pour ${offlineContacts.length} contact(s) offline`,
          );
        }
      } catch (offlineErr) {
        console.error(
          '[ProfileEventBroadcaster] Erreur pending queue offline:',
          offlineErr.message,
        );
      }
    }

    console.log(`[ProfileEventBroadcaster] Event profile:photo_updated emis pour ${matricule} (${field})`);
  }

  /**
   * Recuperer les contacts offline d'un utilisateur via les rooms Redis
   * Reproduit la logique de OnlineUserManager.emitPresenceToContacts
   * mais filtre pour ne garder que les contacts offline
   */
  async getOfflineContacts(matricule) {
    const offlineContacts = [];
    try {
      const userRoomsKey = `chat:cache:user_rooms:${matricule}`;
      const userRooms = await this.client.sMembers(userRoomsKey);

      if (!userRooms || userRooms.length === 0) return offlineContacts;

      const allContactIds = new Set();
      for (const roomName of userRooms) {
        const roomUsersKey = `chat:cache:room_users:${roomName}`;
        const roomUsers = await this.client.sMembers(roomUsersKey);
        if (roomUsers) {
          roomUsers.forEach((id) => {
            if (String(id) !== String(matricule)) {
              allContactIds.add(String(id));
            }
          });
        }
      }

      for (const contactId of allContactIds) {
        const isOnline = await this.onlineUserManager.isUserOnline(contactId);
        if (!isOnline) {
          offlineContacts.push(contactId);
        }
      }
    } catch (err) {
      console.error('[ProfileEventBroadcaster] Erreur getOfflineContacts:', err.message);
    }
    return offlineContacts;
  }

  parseMessage(data) {
    const result = {};
    for (const [key, value] of Object.entries(data)) {
      try {
        result[key] = JSON.parse(value);
      } catch (e) {
        result[key] = value;
      }
    }
    return result;
  }

  async stop() {
    console.log('[ProfileEventBroadcaster] Arret du consumer...');
    this.isRunning = false;
    // ✅ Fermer le client dupliqué dédié
    if (this.client && typeof this.client.quit === 'function') {
      try {
        await this.client.quit();
        console.log('[ProfileEventBroadcaster] Client Redis dédié fermé');
      } catch (err) {
        console.warn('[ProfileEventBroadcaster] Erreur fermeture client dédié:', err.message);
      }
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ProfileEventBroadcaster;
