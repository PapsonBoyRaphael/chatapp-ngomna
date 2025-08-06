class GetConversations {
  constructor(conversationRepository, messageRepository, cacheService = null) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.cacheService = cacheService;
    this.cacheTimeout = 600; // 10 min
  }

  async execute(userId, useCache = true) {
    const startTime = Date.now();

    try {
      console.log(`🔍 Récupération conversations pour utilisateur: ${userId}`);

      const cacheKey = `conversations:${userId}`;
      if (useCache && this.cacheService) {
        try {
          const cached = await this.cacheService.get(cacheKey);
          if (cached) {
            console.log(
              `📦 Conversations depuis cache: ${userId} (${
                Date.now() - startTime
              }ms)`
            );
            return {
              ...cached,
              fromCache: true,
              processingTime: Date.now() - startTime,
            };
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur lecture cache:", cacheError.message);
        }
      }

      // Désactiver le cache interne du repository pour éviter la duplication
      const conversationsResult =
        await this.conversationRepository.findByParticipant(userId, {
          page: 1,
          limit: 50,
          useCache: false,
          includeArchived: false,
        });

      const conversations = conversationsResult.conversations || [];

      console.log(
        `📋 ${conversations.length} conversations trouvées pour ${userId}`
      );

      // Pour chaque conversation, ajouter le nombre de messages non lus et autres métadonnées
      const conversationsWithMetadata = await Promise.all(
        conversations.map(async (conversation) => {
          try {
            // ✅ OBTENIR LES MÉTADONNÉES UTILISATEUR DEPUIS LA CONVERSATION
            const userMetadata = conversation.userMetadata?.find(
              (meta) => meta.userId === userId
            ) || {
              userId: userId,
              unreadCount: 0,
              lastReadAt: null,
              isMuted: false,
              isPinned: false,
            };

            // ✅ UTILISER LES COMPTEURS UNREADCOUNTS SI DISPONIBLES
            const unreadCount =
              conversation.unreadCounts?.[userId] ||
              userMetadata.unreadCount ||
              0;

            // ✅ RÉCUPÉRER LE DERNIER MESSAGE SI PAS DÉJÀ PRÉSENT
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
              userMetadata,
              isActive: true,
              lastActivity:
                conversation.lastMessageAt || conversation.updatedAt,
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
              userMetadata: { userId, unreadCount: 0 },
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
        pagination: conversationsResult.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalCount: sortedConversations.length,
          hasNext: false,
          hasPrevious: false,
          limit: 50,
        },
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

      // Mise en cache
      if (useCache && this.cacheService) {
        try {
          await this.cacheService.set(cacheKey, result, this.cacheTimeout);
          console.log(`💾 Conversations mises en cache pour ${userId}`);
        } catch (cacheError) {
          console.warn("⚠️ Erreur mise en cache:", cacheError.message);
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

  async invalidateUserCache(userId) {
    if (!this.cacheService) return;
    try {
      await this.cacheService.del(`conversations:${userId}`);
      console.log(`🗑️ Cache conversations invalidé pour ${userId}`);
    } catch (error) {
      console.warn(
        "⚠️ Erreur invalidation cache conversations:",
        error.message
      );
    }
  }
}

module.exports = GetConversations;
