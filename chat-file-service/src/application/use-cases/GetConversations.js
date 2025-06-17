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

      // Vérifier le cache Redis d'abord
      if (useCache && this.redisClient) {
        try {
          const cacheKey = `conversations:${userId}`;
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
        } catch (cacheError) {
          console.warn("⚠️ Erreur lecture cache:", cacheError.message);
        }
      }

      // ✅ UTILISER LA MÉTHODE findByUserId QUI EXISTE MAINTENANT
      const conversationsResult =
        await this.conversationRepository.findByUserId(userId, {
          page: 1,
          limit: 50,
          useCache: false, // On gère déjà le cache ici
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

      // Mettre en cache pour 5 minutes
      if (useCache && this.redisClient) {
        try {
          await this.redisClient.setex(
            `conversations:${userId}`,
            300,
            JSON.stringify({
              conversations: result.conversations,
              totalCount: result.totalCount,
              unreadConversations: result.unreadConversations,
              totalUnreadMessages: result.totalUnreadMessages,
              cachedAt: new Date().toISOString(),
            })
          );
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

  // ✅ MÉTHODES UTILITAIRES INCHANGÉES...
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

  async invalidateConversationCache(conversationId) {
    if (!this.redisClient) return;

    try {
      const conversation = await this.conversationRepository.findById(
        conversationId
      );
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
