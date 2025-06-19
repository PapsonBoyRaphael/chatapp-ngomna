class GetConversations {
  constructor(conversationRepository, messageRepository, redisClient = null) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.redisClient = redisClient;
  }

  async execute(userId, useCache = true) {
    const startTime = Date.now();

    try {
      console.log(`🔍 Récupération conversations pour utilisateur: ${userId}`);

      // ✅ AMÉLIORER LA VÉRIFICATION DU CACHE REDIS
      if (useCache && this.redisClient) {
        try {
          const cacheKey = `conversations:${userId}`;

          // ✅ VÉRIFIER SI setex EXISTE AVANT DE L'UTILISER
          if (typeof this.redisClient.get === "function") {
            const cached = await this.redisClient.get(cacheKey);

            if (cached) {
              const result = JSON.parse(cached);
              console.log(
                `📦 Conversations depuis cache: ${userId} (${
                  Date.now() - startTime
                }ms)`
              );
              return {
                ...result,
                fromCache: true,
                processingTime: Date.now() - startTime,
              };
            }
          } else {
            console.warn("⚠️ Redis client invalide - méthodes manquantes");
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur lecture cache:", cacheError.message);
        }
      }

      // ✅ UTILISER LA MÉTHODE findByUserId AVEC DÉSACTIVATION DU CACHE INTERNE
      const conversationsResult =
        await this.conversationRepository.findByUserId(userId, {
          page: 1,
          limit: 50,
          useCache: false, // ✅ DÉSACTIVER LE CACHE INTERNE POUR ÉVITER DUPLICATION
          includeArchived: false,
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
                lastMessage = await this.messageRepository.getLastMessage(
                  conversation._id
                );
              } catch (error) {
                console.warn(
                  `⚠️ Erreur dernier message ${conversation._id}:`,
                  error.message
                );
              }
            }

            return {
              ...conversation,
              unreadCount,
              lastMessage,
              isActive: true,
              lastActivity: conversation.lastActivity || conversation.updatedAt,
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
        fromCache: false,
        processingTime: Date.now() - startTime,
      };

      // ✅ AMÉLIORER LA MISE EN CACHE AVEC VÉRIFICATION DES MÉTHODES
      if (useCache && this.redisClient) {
        try {
          // ✅ VÉRIFIER QUE LES MÉTHODES EXISTENT
          if (typeof this.redisClient.setex === "function") {
            await this.redisClient.setex(
              `conversations:${userId}`,
              300, // 5 minutes
              JSON.stringify({
                conversations: result.conversations,
                totalCount: result.totalCount,
                unreadConversations: result.unreadConversations,
                totalUnreadMessages: result.totalUnreadMessages,
                cachedAt: new Date().toISOString(),
              })
            );
            console.log(`💾 Conversations mises en cache pour ${userId}`);
          } else if (typeof this.redisClient.set === "function") {
            // ✅ FALLBACK AVEC set + expire
            const cacheKey = `conversations:${userId}`;
            const cacheData = JSON.stringify({
              conversations: result.conversations,
              totalCount: result.totalCount,
              unreadConversations: result.unreadConversations,
              totalUnreadMessages: result.totalUnreadMessages,
              cachedAt: new Date().toISOString(),
            });

            await this.redisClient.set(cacheKey, cacheData);

            if (typeof this.redisClient.expire === "function") {
              await this.redisClient.expire(cacheKey, 300);
            }

            console.log(
              `💾 Conversations mises en cache pour ${userId} (fallback)`
            );
          } else {
            console.warn(
              "⚠️ Méthodes Redis non disponibles pour la mise en cache"
            );
          }
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur mise en cache conversations:",
            cacheError.message
          );
        }
      }

      console.log(
        `✅ ${result.conversations.length} conversations récupérées pour ${userId} (${result.processingTime}ms)`
      );
      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(
        `❌ Erreur GetConversations: ${error.message} (${processingTime}ms)`
      );
      throw error;
    }
  }

  // ✅ AMÉLIORER invalidateUserCache AVEC VÉRIFICATION
  async invalidateUserCache(userId) {
    if (!this.redisClient) return;

    try {
      const cacheKey = `conversations:${userId}`;

      if (typeof this.redisClient.del === "function") {
        await this.redisClient.del(cacheKey);
        console.log(`🗑️ Cache conversations invalidé pour ${userId}`);
      } else {
        console.warn("⚠️ Méthode del non disponible sur Redis client");
      }
    } catch (error) {
      console.warn(
        "⚠️ Erreur invalidation cache conversations:",
        error.message
      );
    }
  }

  async invalidateConversationCache(conversationId) {
    if (!this.redisClient) return;

    try {
      const conversation = await this.conversationRepository.findById(
        conversationId
      );
      if (conversation && conversation.participants) {
        const deletePromises = conversation.participants.map((userId) =>
          this.invalidateUserCache(userId)
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
