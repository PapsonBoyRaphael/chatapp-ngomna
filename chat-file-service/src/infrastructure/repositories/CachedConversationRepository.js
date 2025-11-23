/**
 * CachedConversationRepository - Repository pattern avec cache Redis
 * Gère la cohérence entre MongoDB et Redis pour les conversations
 * Wrapper autour du primaryStore (MongoConversationRepository) pour ajouter la logique de cache
 * Toutes les méthodes du primaryStore sont wrappées ici pour ajouter cache/invalidation
 */
class CachedConversationRepository {
  constructor(conversationRepository, cacheService) {
    this.primaryStore = conversationRepository; // Le pur Mongo repo
    this.cache = cacheService;
    this.cachePrefix = "conv:";
    this.defaultTTL = 3600; // 1 heure
    this.shortTTL = 300; // 5 minutes
  }

  // Sauvegarder une conversation avec cache et invalidation (déjà présent, conservé)
  async save(conversationData) {
    try {
      // 1. Sauvegarde dans MongoDB via primaryStore
      const savedConversation = await this.primaryStore.save(conversationData);

      // 2. Mise en cache de la conversation individuelle
      const conversationCacheKey = `${this.cachePrefix}${savedConversation._id}`;
      await this.cache.set(
        conversationCacheKey,
        savedConversation,
        this.defaultTTL
      );

      // 3. Invalider les caches liés aux conversations
      await this.invalidateConversationCaches(savedConversation._id);

      return savedConversation;
    } catch (error) {
      console.error("❌ Erreur save (cached):", error);
      throw error;
    }
  }

  // Récupérer une conversation par ID avec cache (déjà présent, conservé)
  async findById(id) {
    try {
      const cacheKey = `${this.cachePrefix}${id}`;
      let cached = await this.cache.get(cacheKey);
      if (cached) {
        console.log(`📦 Conversation depuis cache: ${id}`);
        return cached;
      }

      const conversation = await this.primaryStore.findById(id);

      if (conversation) {
        await this.cache.set(cacheKey, conversation, this.defaultTTL);
      }

      return conversation;
    } catch (error) {
      console.error("❌ Erreur findById (cached):", error);
      throw error;
    }
  }

  // Récupérer les conversations d'un utilisateur avec cache
  async findByUser(userId, options = {}) {
    const cacheKey = `${this.cachePrefix}user:${userId}`;

    try {
      let cached = await this.cache.get(cacheKey);
      if (cached) {
        console.log(`📦 Conversations user depuis cache: ${userId}`);
        return cached;
      }

      const conversations = await this.primaryStore.findByUser(userId, options);

      if (conversations.length > 0) {
        await this.cache.set(cacheKey, conversations, this.shortTTL);
      }

      return conversations;
    } catch (error) {
      console.error("❌ Erreur findByUser (cached):", error);
      throw error;
    }
  }

  // Récupérer une conversation par participants avec cache
  async findByParticipants(participants) {
    const sortedParticipants = participants.sort().join(":");
    const cacheKey = `${this.cachePrefix}participants:${sortedParticipants}`;

    try {
      let cached = await this.cache.get(cacheKey);
      if (cached) {
        console.log(
          `📦 Conversation participants depuis cache: ${sortedParticipants}`
        );
        return cached;
      }

      const conversation = await this.primaryStore.findByParticipants(
        participants
      );

      if (conversation) {
        await this.cache.set(cacheKey, conversation, this.defaultTTL);
      }

      return conversation;
    } catch (error) {
      console.error("❌ Erreur findByParticipants (cached):", error);
      throw error;
    }
  }

  // Rechercher des conversations avec cache
  async searchConversations(query) {
    const cacheKey = `${this.cachePrefix}search:${JSON.stringify(query)}`;

    try {
      let cached = await this.cache.get(cacheKey);
      if (cached) {
        console.log(`📦 Search conversations depuis cache: ${query}`);
        return cached;
      }

      const result = await this.primaryStore.searchConversations(query);

      if (result.conversations.length > 0) {
        await this.cache.set(cacheKey, result, this.shortTTL);
      }

      return result;
    } catch (error) {
      console.error("❌ Erreur searchConversations (cached):", error);
      throw error;
    }
  }

  // Mettre à jour le dernier message d'une conversation avec invalidation
  async updateLastMessage(conversationId, messageData) {
    try {
      const result = await this.primaryStore.updateLastMessage(
        conversationId,
        messageData
      );

      // Invalider les caches liés
      await this.invalidateConversationCaches(conversationId);

      return result;
    } catch (error) {
      console.error("❌ Erreur updateLastMessage (cached):", error);
      throw error;
    }
  }

  // Ajouter un participant avec invalidation
  async addParticipant(conversationId, userData) {
    try {
      const result = await this.primaryStore.addParticipant(
        conversationId,
        userData
      );

      // Invalider les caches liés
      await this.invalidateConversationCaches(conversationId);

      return result;
    } catch (error) {
      console.error("❌ Erreur addParticipant (cached):", error);
      throw error;
    }
  }

  // Supprimer un participant avec invalidation
  async removeParticipant(conversationId, userId) {
    try {
      const result = await this.primaryStore.removeParticipant(
        conversationId,
        userId
      );

      // Invalider les caches liés
      await this.invalidateConversationCaches(conversationId);

      return result;
    } catch (error) {
      console.error("❌ Erreur removeParticipant (cached):", error);
      throw error;
    }
  }

  // Archiver une conversation avec invalidation
  async archiveConversation(conversationId, archiveData) {
    try {
      const result = await this.primaryStore.archiveConversation(
        conversationId,
        archiveData
      );

      // Invalider les caches liés
      await this.invalidateConversationCaches(conversationId);

      return result;
    } catch (error) {
      console.error("❌ Erreur archiveConversation (cached):", error);
      throw error;
    }
  }

  // Mettre à jour les paramètres d'une conversation avec invalidation
  async updateConversationSettings(conversationId, settings) {
    try {
      const result = await this.primaryStore.updateConversationSettings(
        conversationId,
        settings
      );

      // Invalider les caches liés
      await this.invalidateConversationCaches(conversationId);

      return result;
    } catch (error) {
      console.error("❌ Erreur updateConversationSettings (cached):", error);
      throw error;
    }
  }

  // Mettre à jour les métadonnées utilisateur avec invalidation
  async updateUserMetadata(conversationId, userId, metadata) {
    try {
      const result = await this.primaryStore.updateUserMetadata(
        conversationId,
        userId,
        metadata
      );

      // Invalider les caches liés
      await this.invalidateConversationCaches(conversationId);

      return result;
    } catch (error) {
      console.error("❌ Erreur updateUserMetadata (cached):", error);
      throw error;
    }
  }

  // Incrémenter le compteur non-lus dans userMetadata avec invalidation
  async incrementUnreadCountInUserMetadata(conversationId, userId, amount = 1) {
    try {
      const result = await this.primaryStore.incrementUnreadCountInUserMetadata(
        conversationId,
        userId,
        amount
      );

      // Invalider les caches liés
      await this.invalidateConversationCaches(conversationId);

      return result;
    } catch (error) {
      console.error(
        "❌ Erreur incrementUnreadCountInUserMetadata (cached):",
        error
      );
      throw error;
    }
  }

  // Réinitialiser le compteur non-lus dans userMetadata avec invalidation
  async resetUnreadCountInUserMetadata(conversationId, userId) {
    try {
      const result = await this.primaryStore.resetUnreadCountInUserMetadata(
        conversationId,
        userId
      );

      // Invalider les caches liés
      await this.invalidateConversationCaches(conversationId);

      return result;
    } catch (error) {
      console.error(
        "❌ Erreur resetUnreadCountInUserMetadata (cached):",
        error
      );
      throw error;
    }
  }

  // Invalidation des caches liés à une conversation (adapté pour conversations)
  async invalidateConversationCaches(conversationId) {
    if (!this.cache) return;

    const patterns = [
      `${this.cachePrefix}${conversationId}`,
      `conv:user:*`, // Invalide les caches user-related si needed
      `conv:participants:*`,
      `conv:search:*`,
      `conversations:*`,
    ];

    for (const pattern of patterns) {
      try {
        await this.cache.delete(pattern);
      } catch (error) {
        console.warn(`⚠️ Erreur invalidation ${pattern}:`, error.message);
      }
    }
  }

  // Nettoyage du cache pour les conversations
  async clearCache() {
    if (!this.cache) return;

    try {
      await this.cache.delete(`${this.cachePrefix}*`);
      await this.cache.delete("conversations:*");
    } catch (error) {
      console.error("❌ Erreur clearCache:", error);
    }
  }
}

module.exports = CachedConversationRepository;
