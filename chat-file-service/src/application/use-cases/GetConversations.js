class GetConversations {
  constructor(conversationRepository, messageRepository, redisClient = null) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.redisClient = redisClient;
    this.cacheTimeout = 180; // 3 minutes (plus court car données fréquemment mises à jour)
  }

  async execute(userId, useCache = true) {
    try {
      if (!userId) {
        throw new Error("userId est requis");
      }

      const cacheKey = `conversations:${userId}`;

      // 🚀 TENTATIVE DE RÉCUPÉRATION DEPUIS REDIS
      if (this.redisClient && useCache) {
        try {
          const cachedConversations = await this.redisClient.get(cacheKey);
          if (cachedConversations) {
            console.log(`📦 Conversations récupérées depuis Redis: ${userId}`);
            const parsed = JSON.parse(cachedConversations);
            return {
              ...parsed,
              fromCache: true,
              retrievedAt: new Date().toISOString(),
            };
          }
        } catch (redisError) {
          console.warn(
            "⚠️ Erreur lecture cache conversations Redis:",
            redisError.message
          );
        }
      }

      // Récupération depuis la base de données - CORRECTION DU NOM DE MÉTHODE
      const conversationsResult = await this.conversationRepository.findByUserId(userId, {
        page: 1,
        limit: 50,
        useCache: false, // On gère déjà le cache ici
        includeArchived: false
      });

      const conversations = conversationsResult.conversations || [];

      // Pour chaque conversation, ajouter le nombre de messages non lus et autres métadonnées
      const conversationsWithMetadata = await Promise.all(
        conversations.map(async (conversation) => {
          try {
            // Utiliser les données déjà enrichies du repository
            const unreadCount = conversation.userMetadata?.unreadCount || 0;
            
            // Récupérer le dernier message si pas déjà présent
            let lastMessage = conversation.lastMessage;
            if (!lastMessage && this.messageRepository.getLastMessage) {
              try {
                lastMessage = await this.messageRepository.getLastMessage(conversation._id);
              } catch (error) {
                console.warn(`⚠️ Erreur récupération dernier message ${conversation._id}:`, error.message);
                lastMessage = null;
              }
            }

            return {
              ...conversation,
              unreadCount,
              lastMessage,
              isActive:
                unreadCount > 0 ||
                (lastMessage &&
                  new Date(lastMessage.createdAt || lastMessage.timestamp) >
                    new Date(Date.now() - 24 * 60 * 60 * 1000)), // Actif si message dans les 24h
              lastActivity: lastMessage?.createdAt || lastMessage?.timestamp || conversation.updatedAt,
              participantCount: conversation.participants?.length || 0,
            };
          } catch (error) {
            console.warn(
              `⚠️ Erreur métadonnées conversation ${conversation._id}:`,
              error.message
            );
            return {
              ...conversation,
              unreadCount: 0,
              lastMessage: null,
              isActive: false,
              lastActivity: conversation.updatedAt,
              participantCount: conversation.participants?.length || 0,
            };
          }
        })
      );

      // Trier par dernière activité
      const sortedConversations = conversationsWithMetadata.sort(
        (a, b) => new Date(b.lastActivity) - new Date(a.lastActivity)
      );

      const result = {
        conversations: sortedConversations,
        totalCount: sortedConversations.length,
        unreadConversations: sortedConversations.filter(
          (c) => c.unreadCount > 0
        ).length,
        totalUnreadMessages: sortedConversations.reduce(
          (sum, c) => sum + (c.unreadCount || 0),
          0
        ),
        retrievedAt: new Date().toISOString(),
        fromCache: false,
      };

      // 🚀 MISE EN CACHE REDIS
      if (this.redisClient && sortedConversations.length > 0) {
        try {
          await this.redisClient.setex(
            cacheKey,
            this.cacheTimeout,
            JSON.stringify(result)
          );
          console.log(`💾 Conversations mises en cache Redis: ${userId}`);
        } catch (redisError) {
          console.warn(
            "⚠️ Erreur mise en cache conversations Redis:",
            redisError.message
          );
        }
      }

      console.log(`✅ GetConversations réussi: ${userId} (${sortedConversations.length} conversations)`);
      return result;
    } catch (error) {
      console.error("❌ Erreur GetConversations:", error);
      throw error;
    }
  }

  // Méthode pour invalider le cache d'un utilisateur
  async invalidateUserCache(userId) {
    if (!this.redisClient) return;

    try {
      const cacheKey = `conversations:${userId}`;
      await this.redisClient.del(cacheKey);
      console.log(`🗑️ Cache conversations invalidé pour ${userId}`);
    } catch (error) {
      console.warn(
        "⚠️ Erreur invalidation cache conversations:",
        error.message
      );
    }
  }

  // Méthode pour invalider le cache de tous les participants d'une conversation
  async invalidateConversationCache(conversationId) {
    if (!this.redisClient) return;

    try {
      const conversation = await this.conversationRepository.findById(conversationId);
      if (conversation && conversation.participants) {
        const deletePromises = conversation.participants.map((userId) =>
          this.redisClient.del(`conversations:${userId}`)
        );
        await Promise.all(deletePromises);
        console.log(
          `🗑️ Cache invalidé pour ${conversation.participants.length} participants`
        );
      }
    } catch (error) {
      console.warn("⚠️ Erreur invalidation cache conversation:", error.message);
    }
  }
}

module.exports = GetConversations;
