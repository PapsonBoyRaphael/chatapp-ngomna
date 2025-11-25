class GetConversations {
  constructor(conversationRepository, messageRepository) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
  }

  async execute(userId, options = {}) {
    const startTime = Date.now();

    // ✅ RÉCUPÉRER LES OPTIONS DE PAGINATION
    const {
      page = 1,
      limit = 20,
      offset = (page - 1) * limit,
      includeArchived = false,
    } = options;

    try {
      console.log(
        `🔍 Récupération conversations page ${page} (limit: ${limit}) pour utilisateur: ${userId}`
      );

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
}

module.exports = GetConversations;
