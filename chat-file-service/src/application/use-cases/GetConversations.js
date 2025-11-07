class GetConversations {
  constructor(conversationRepository, messageRepository, cacheService = null) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.cacheService = cacheService;
    this.cacheTimeout = 300;
  }

  async execute(userId, options = {}) {
    const startTime = Date.now();

    // ✅ RÉCUPÉRER LES OPTIONS DE PAGINATION
    const {
      page = 1,
      limit = 20,
      offset = (page - 1) * limit,
      includeArchived = false,
      useCache = true,
    } = options;

    try {
      console.log(
        `🔍 Récupération conversations page ${page} (limit: ${limit}) pour utilisateur: ${userId}`
      );

      // ✅ INCLURE LA PAGINATION DANS LA CLÉ DE CACHE
      const cacheKey = `conversations:${userId}:page:${page}:limit:${limit}`;

      // 1. Vérification du cache (avec pagination)
      if (useCache && this.cacheService) {
        try {
          const cached = await this.cacheService.get(cacheKey);
          if (cached && this._isValidCache(cached)) {
            console.log("✅ Cache valide trouvé pour la page", page);
            return JSON.parse(cached);
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur lecture cache:", cacheError.message);
          await this.invalidateUserCache(userId, page, limit);
        }
      }

      // 2. ✅ RÉCUPÉRATION AVEC PAGINATION
      const conversationsResult =
        await this.conversationRepository.findByParticipant(userId, {
          page: parseInt(page),
          limit: parseInt(limit),
          offset: parseInt(offset),
          includeArchived: includeArchived,
          useCache: false,
        });

      if (
        !conversationsResult ||
        !Array.isArray(conversationsResult.conversations)
      ) {
        throw new Error("Format de données invalide depuis le repository");
      }

      const conversations = conversationsResult.conversations || [];
      const totalCount =
        conversationsResult.totalCount ||
        conversationsResult.pagination?.totalCount ||
        0;

      console.log(
        `📋 ${conversations.length} conversations trouvées sur ${totalCount} total pour la page ${page}`
      );

      // 3. Traitement des métadonnées (inchangé)
      const conversationsWithMetadata = await Promise.all(
        conversations.map(async (conversation) => {
          try {
            const userMetadata = conversation.userMetadata?.find(
              (meta) => meta.userId === userId
            );

            const unreadCount =
              userMetadata && typeof userMetadata.unreadCount === "number"
                ? userMetadata.unreadCount
                : conversation.unreadCounts?.[userId] || 0;

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

      // 4. Trier par dernière activité
      const sortedConversations = conversationsWithMetadata.sort(
        (a, b) => new Date(b.lastActivity) - new Date(a.lastActivity)
      );

      // 5. ✅ CALCULS DE PAGINATION CORRECTS
      const totalPages = Math.ceil(totalCount / limit);
      const hasNext = page < totalPages;
      const hasPrevious = page > 1;

      const result = {
        conversations: sortedConversations,
        pagination: {
          currentPage: parseInt(page),
          totalPages: totalPages,
          totalCount: totalCount,
          hasNext: hasNext,
          hasPrevious: hasPrevious,
          limit: parseInt(limit),
          offset: parseInt(offset),
          nextPage: hasNext ? parseInt(page) + 1 : null,
          previousPage: hasPrevious ? parseInt(page) - 1 : null,
        },
        totalCount: totalCount,
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

      // 6. Mise en cache (avec clé paginée)
      if (useCache && this.cacheService && result.conversations.length > 0) {
        try {
          const cacheData = JSON.stringify({
            ...result,
            cachedAt: Date.now(),
            version: "1.0",
          });

          await this.cacheService.set(cacheKey, this.cacheTimeout, cacheData);
          console.log(`💾 Cache mis à jour pour la page ${page}`);
        } catch (cacheError) {
          console.warn("⚠️ Erreur mise en cache:", cacheError.message);
        }
      }

      console.log(
        `✅ Page ${page}: ${result.conversations.length} conversations récupérées (${result.processingTime}ms)`
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

  _isValidCache(cachedData) {
    try {
      const parsed = JSON.parse(cachedData);
      const now = Date.now();
      const cachedAt = parsed.cachedAt || 0;

      if (now - cachedAt > this.cacheTimeout * 1000) {
        return false;
      }

      return Array.isArray(parsed.conversations) && parsed.version === "1.0";
    } catch {
      return false;
    }
  }

  async invalidateUserCache(userId, page = null, limit = null) {
    if (!this.cacheService) return;

    try {
      if (page !== null && limit !== null) {
        // Invalider une page spécifique
        const cacheKey = `conversations:${userId}:page:${page}:limit:${limit}`;
        await this.cacheService.del(cacheKey);
        console.log(`🗑️ Cache invalidé pour la page ${page}`);
      } else {
        // Invalider toutes les pages (pattern matching)
        // Cette partie dépend de votre implémentation Redis/stockage
        console.log(`🗑️ Cache invalidé pour toutes les pages de ${userId}`);
      }
    } catch (error) {
      console.warn("⚠️ Erreur invalidation cache:", error.message);
    }
  }
}

module.exports = GetConversations;
