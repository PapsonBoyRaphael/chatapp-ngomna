/**
 * CachedConversationRepository - Pattern Repository avec cache Redis
 * ✅ UNIFIÉE : Utilise RoomManager comme source unique pour conversations
 * Gère la cohérence entre MongoDB et Redis
 */
class CachedConversationRepository {
  constructor(conversationRepository, cacheService, roomManager = null) {
    this.primaryStore = conversationRepository; // MongoDB
    this.cache = cacheService; // Redis basique
    this.roomManager = roomManager; // ✅ Source unique temps-réel

    this.defaultTTL = 3600;
    this.shortTTL = 300;
  }

  // ===== SAUVEGARDER UNE CONVERSATION =====
  /**
   * ✅ MongoDB + Initialiser dans RoomManager
   */
  async save(conversationData) {
    try {
      // 1. Sauvegarder dans MongoDB
      const savedConversation = await this.primaryStore.save(conversationData);

      if (!savedConversation) {
        throw new Error("Conversation not saved");
      }

      // 2. ✅ INITIALISER DANS ROOM MANAGER (source unique)
      if (this.roomManager) {
        await this.roomManager.initializeConversationRoom(savedConversation);
      }

      // 3. Invalider les caches de liste
      await this.invalidateListCaches();

      console.log(`✅ Conversation sauvegardée: ${savedConversation._id}`);
      return savedConversation;
    } catch (error) {
      console.error("❌ Erreur save:", error.message);
      throw error;
    }
  }

  // ===== RÉCUPÉRER UNE CONVERSATION =====
  /**
   * ✅ Stratégie :
   * 1. Si RoomManager existe → données complètes + temps-réel
   * 2. Sinon → MongoDB + créer room
   */
  async findById(conversationId) {
    try {
      // 1. ✅ D'ABORD RoomManager (données unifiées)
      if (this.roomManager) {
        const roomData = await this.roomManager.getConversationData(
          conversationId
        );

        if (roomData) {
          console.log(`📦 Conversation depuis RoomManager: ${conversationId}`);
          return roomData;
        }
      }

      // 2. FALLBACK → MongoDB
      console.log(`🔍 Room n'existe pas → MongoDB: ${conversationId}`);
      const mongoData = await this.primaryStore.findById(conversationId);

      if (mongoData && this.roomManager) {
        // 3. Créer la room pour synchroniser
        await this.roomManager.initializeConversationRoom(mongoData);
      }

      return mongoData;
    } catch (error) {
      console.error("❌ Erreur findById:", error.message);
      throw error;
    }
  }

  // ===== RÉCUPÉRER LES CONVERSATIONS D'UN UTILISATEUR =====
  /**
   * ✅ Utiliser cache CacheService (liste changue rarement)
   */
  async findByParticipant(userId, options = {}) {
    const cacheKey = `conversations:${userId}`;

    try {
      // 1. Vérifier le cache
      let cached = await this.cache.get(cacheKey);
      if (cached) {
        console.log(`📦 Conversations depuis cache: ${userId}`);
        return cached;
      }

      // 2. MongoDB
      console.log(`🔍 Lectures conversations: ${userId}`);
      const conversations = await this.primaryStore.findByParticipant(
        userId,
        options
      );

      // 3. Mettre en cache
      if (conversations.length > 0) {
        await this.cache.set(cacheKey, conversations, this.shortTTL);
      }

      return conversations;
    } catch (error) {
      console.error("❌ Erreur findByParticipant:", error.message);
      throw error;
    }
  }

  // ===== METTRE À JOUR UNE CONVERSATION =====
  /**
   * ✅ MongoDB + Synchroniser RoomManager
   */
  async update(conversationId, updateData) {
    try {
      // 1. Mettre à jour MongoDB
      const result = await this.primaryStore.update(conversationId, updateData);

      // 2. Synchroniser RoomManager
      if (this.roomManager && result) {
        await this.roomManager.updateConversationMetadata(
          conversationId,
          updateData
        );
      }

      // 3. Invalider les caches
      await this.invalidateConversationCaches(conversationId);

      console.log(`✅ Conversation mise à jour: ${conversationId}`);
      return result;
    } catch (error) {
      console.error("❌ Erreur update:", error.message);
      throw error;
    }
  }

  // ===== METTRE À JOUR LE DERNIER MESSAGE =====
  async updateLastMessage(conversationId, messageData) {
    try {
      const result = await this.primaryStore.updateLastMessage(
        conversationId,
        messageData
      );

      if (this.roomManager && result) {
        await this.roomManager.updateConversationMetadata(conversationId, {
          lastMessage: messageData,
          updatedAt: new Date(),
        });
      }

      await this.invalidateConversationCaches(conversationId);

      return result;
    } catch (error) {
      console.error("❌ Erreur updateLastMessage:", error.message);
      throw error;
    }
  }

  // ===== AJOUTER UN PARTICIPANT =====
  /**
   * ✅ Ajouter en MongoDB + Ajouter à la room temps-réel
   */
  async addParticipant(conversationId, userData) {
    try {
      // 1. Ajouter dans MongoDB
      const result = await this.primaryStore.addParticipant(
        conversationId,
        userData
      );

      if (this.roomManager && result) {
        const roomName = `conv_${conversationId}`;

        // 2. Ajouter à la room temps-réel
        await this.roomManager.addUserToRoom(roomName, userData.userId, {
          matricule: userData.matricule,
          conversationId: conversationId,
        });

        // 3. Mettre à jour métadonnées participants
        const conversation = await this.primaryStore.findById(conversationId);
        if (conversation) {
          await this.roomManager.updateConversationMetadata(conversationId, {
            participants: conversation.participants,
          });
        }
      }

      await this.invalidateConversationCaches(conversationId);

      return result;
    } catch (error) {
      console.error("❌ Erreur addParticipant:", error.message);
      throw error;
    }
  }

  // ===== SUPPRIMER UN PARTICIPANT =====
  /**
   * ✅ Supprimer de MongoDB + Retirer de la room temps-réel
   */
  async removeParticipant(conversationId, userId) {
    try {
      // 1. Supprimer de MongoDB
      const result = await this.primaryStore.removeParticipant(
        conversationId,
        userId
      );

      if (this.roomManager && result) {
        const roomName = `conv_${conversationId}`;

        // 2. Retirer de la room temps-réel
        await this.roomManager.removeUserFromRoom(roomName, userId);

        // 3. Mettre à jour métadonnées participants
        const conversation = await this.primaryStore.findById(conversationId);
        if (conversation) {
          await this.roomManager.updateConversationMetadata(conversationId, {
            participants: conversation.participants,
          });
        }
      }

      await this.invalidateConversationCaches(conversationId);

      return result;
    } catch (error) {
      console.error("❌ Erreur removeParticipant:", error.message);
      throw error;
    }
  }

  // ===== ARCHIVER UNE CONVERSATION =====
  async archiveConversation(conversationId, archiveData) {
    try {
      const result = await this.primaryStore.archiveConversation(
        conversationId,
        archiveData
      );

      if (this.roomManager) {
        await this.roomManager.updateConversationMetadata(conversationId, {
          archived: true,
          archivedAt: new Date(),
        });
      }

      await this.invalidateConversationCaches(conversationId);

      return result;
    } catch (error) {
      console.error("❌ Erreur archiveConversation:", error.message);
      throw error;
    }
  }

  // ===== INCRÉMENTER COMPTEUR UNREAD =====
  async incrementUnreadCountInUserMetadata(conversationId, userId, amount = 1) {
    try {
      const result = await this.primaryStore.incrementUnreadCountInUserMetadata(
        conversationId,
        userId,
        amount
      );

      if (this.roomManager && result) {
        const conversation = await this.primaryStore.findById(conversationId);
        if (conversation) {
          await this.roomManager.updateConversationMetadata(conversationId, {
            unreadCounts: conversation.unreadCounts,
            userMetadata: conversation.userMetadata,
          });
        }
      }

      return result;
    } catch (error) {
      console.error(
        "❌ Erreur incrementUnreadCountInUserMetadata:",
        error.message
      );
      throw error;
    }
  }

  // ===== RÉINITIALISER COMPTEUR UNREAD =====
  async resetUnreadCountInUserMetadata(conversationId, userId) {
    try {
      const result = await this.primaryStore.resetUnreadCountInUserMetadata(
        conversationId,
        userId
      );

      if (this.roomManager && result) {
        const conversation = await this.primaryStore.findById(conversationId);
        if (conversation) {
          await this.roomManager.updateConversationMetadata(conversationId, {
            unreadCounts: conversation.unreadCounts,
            userMetadata: conversation.userMetadata,
          });
        }
      }

      await this.invalidateConversationCaches(conversationId);

      return result;
    } catch (error) {
      console.error("❌ Erreur resetUnreadCountInUserMetadata:", error.message);
      throw error;
    }
  }

  // ===== INVALIDER LES CACHES =====
  /**
   * ✅ SIMPLIFIÉ : Supprimer cache liste + laisser RoomManager comme source
   */
  async invalidateConversationCaches(conversationId) {
    if (!this.cache) return;

    const patterns = [
      `conversations:*`, // Listes d'utilisateurs
      `conversation:*`, // Recherches
    ];

    for (const pattern of patterns) {
      try {
        await this.cache.delete(pattern);
      } catch (error) {
        console.warn(`⚠️ Erreur invalidation ${pattern}:`, error.message);
      }
    }
  }

  async invalidateListCaches() {
    if (!this.cache) return;

    try {
      await this.cache.delete("conversations:*");
    } catch (error) {
      console.warn("⚠️ Erreur invalidation listes:", error.message);
    }
  }

  async clearCache() {
    if (!this.cache) return;

    try {
      await this.cache.delete("conversations:*");
      console.log("✅ Caches conversations nettoyés");
    } catch (error) {
      console.error("❌ Erreur clearCache:", error.message);
    }
  }
}

module.exports = CachedConversationRepository;
