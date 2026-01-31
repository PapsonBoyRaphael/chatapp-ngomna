class GetConversations {
  constructor(conversationRepository, messageRepository) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
  }

  // ✅ HELPER: Extract unread count from userMetadata (authoritative source)
  _getUnreadCountFromUserMetadata(conversation, userId) {
    if (Array.isArray(conversation.userMetadata)) {
      const userMeta = conversation.userMetadata.find(
        (meta) => meta.userId === userId,
      );
      return userMeta?.unreadCount || 0;
    }
    // Fallback to legacy unreadCounts if userMetadata unavailable
    return conversation.unreadCounts?.[userId] || 0;
  }

  async execute(userId, options = {}) {
    const startTime = Date.now();

    const {
      page = 1,
      limit = 20,
      cursor = null,
      direction = "newer",
      includeArchived = false,
      useCache = true,
      userDepartement = null,
      userMinistere = null,
    } = options;

    try {
      console.log(
        `🔍 GetConversations: userId=${userId}, page=${page}, limit=${limit}, cursor=${cursor}, useCache=${useCache}`,
      );

      // ✅ APPEL REPOSITORY avec cursor ET cache
      const result = await this.conversationRepository.findByParticipant(
        userId,
        {
          page: parseInt(page),
          limit: parseInt(limit),
          cursor,
          direction,
          includeArchived,
          useCache,
        },
      );

      if (!result || !Array.isArray(result.conversations)) {
        throw new Error("Format de données invalide depuis le repository");
      }

      const conversations = result.conversations || [];
      const totalCount =
        result.totalCount || result.pagination?.totalCount || 0;

      console.log(
        `📋 ${
          conversations.length
        } conversations trouvées sur ${totalCount} total pour la page ${page} (${
          result.fromCache ? "cache" : "MongoDB"
        })`,
      );

      // Trier par dernière activité
      const sortedConversations = conversations.sort(
        (a, b) =>
          new Date(b.lastMessageAt || b.updatedAt) -
          new Date(a.lastMessageAt || a.updatedAt),
      );

      // ✅ SÉPARER LES CONVERSATIONS PAR CATÉGORIE
      // Conversations non lues
      const unreadConversations = sortedConversations.filter(
        (c) => this._getUnreadCountFromUserMetadata(c, userId) > 0,
      );

      // Conversations de groupe
      const groupConversations = sortedConversations.filter(
        (c) => c.type === "GROUP",
      );

      // Conversations de diffusion
      const broadcastConversations = sortedConversations.filter(
        (c) => c.type === "BROADCAST",
      );

      // Conversations du département (PRIVATE où tous les participants ont le même département)
      const departementConversations = sortedConversations.filter((c) => {
        if (c.type !== "PRIVATE") return false;
        if (!userDepartement) return false;

        // userMetadata est un TABLEAU de participants
        if (!Array.isArray(c.userMetadata) || c.userMetadata.length === 0) {
          return false;
        }

        // Vérifier que TOUS les participants ont un département ET que c'est le même que l'utilisateur
        const allSameDepartement = c.userMetadata.every(
          (meta) => meta.departement && meta.departement === userDepartement,
        );

        return allSameDepartement;
      });

      // Conversations privées (autres)
      const privateConversations = sortedConversations.filter(
        (c) =>
          c.type === "PRIVATE" &&
          !departementConversations.some((dc) => dc._id === c._id),
      );

      // ✅ CALCULS DE PAGINATION CORRECTS
      const totalPages = Math.ceil(totalCount / limit);
      const hasNext = page < totalPages;
      const hasPrevious = page > 1;

      const finalResult = {
        conversations: sortedConversations,

        // ✅ CONVERSATIONS PAR CATÉGORIE
        categorized: {
          unread: unreadConversations,
          groups: groupConversations,
          broadcasts: broadcastConversations,
          departement: departementConversations,
          private: privateConversations,
        },

        // ✅ STATISTIQUES PAR CATÉGORIE
        stats: {
          total: sortedConversations.length,
          unread: unreadConversations.length,
          groups: groupConversations.length,
          broadcasts: broadcastConversations.length,
          departement: departementConversations.length,
          private: privateConversations.length,
          unreadMessagesInGroups: groupConversations.reduce(
            (sum, c) => sum + this._getUnreadCountFromUserMetadata(c, userId),
            0,
          ),
          unreadMessagesInBroadcasts: broadcastConversations.reduce(
            (sum, c) => sum + this._getUnreadCountFromUserMetadata(c, userId),
            0,
          ),
          unreadMessagesInDepartement: departementConversations.reduce(
            (sum, c) => sum + this._getUnreadCountFromUserMetadata(c, userId),
            0,
          ),
          unreadMessagesInPrivate: privateConversations.reduce(
            (sum, c) => sum + this._getUnreadCountFromUserMetadata(c, userId),
            0,
          ),
        },

        // ✅ CONTEXTE UTILISATEUR
        userContext: {
          userId,
          departement: userDepartement,
          ministere: userMinistere,
        },

        pagination: {
          currentPage: parseInt(page),
          totalPages: totalPages,
          totalCount: totalCount,
          hasNext: hasNext,
          hasPrevious: hasPrevious,
          limit: parseInt(limit),
          offset: (page - 1) * limit,
          nextPage: hasNext ? parseInt(page) + 1 : null,
          previousPage: hasPrevious ? parseInt(page) - 1 : null,
        },
        totalCount: totalCount,
        unreadConversations: unreadConversations.length,
        totalUnreadMessages: sortedConversations.reduce(
          (sum, c) => sum + this._getUnreadCountFromUserMetadata(c, userId),
          0,
        ),
        fromCache: result.fromCache || false,
        nextCursor: result.nextCursor || null,
        hasMore: result.hasMore || false,
        processingTime: Date.now() - startTime,
      };

      console.log(
        `✅ Page ${page}: ${
          finalResult.conversations.length
        } conversations récupérées (${finalResult.processingTime}ms) - ${
          result.fromCache ? "CACHE" : "DB"
        }`,
      );
      console.log(
        `📊 Catégories: ${finalResult.stats.unread} non-lues, ${finalResult.stats.groups} groupes, ${finalResult.stats.broadcasts} broadcasts, ${finalResult.stats.private} privées`,
      );

      return finalResult;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(
        `❌ Erreur GetConversations: ${error.message} (${processingTime}ms)`,
      );
      throw error;
    }
  }
}

module.exports = GetConversations;
