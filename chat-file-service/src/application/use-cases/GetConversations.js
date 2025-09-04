class GetConversations {
  constructor(conversationRepository, messageRepository, cacheService = null) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
    this.cacheService = cacheService;
    this.cacheTimeout = 300; // Réduit à 5 minutes pour plus de fraîcheur
  }

  async execute(userId, useCache = true) {
    const startTime = Date.now();

    try {
      console.log(`🔍 Récupération conversations pour utilisateur: ${userId}`);

      const cacheKey = `conversations:${userId}`;

      // 1. Vérification et validation du cache
      if (useCache && this.cacheService) {
        try {
          const cached = await this.cacheService.get(cacheKey);
          console.log(`🔍 Vérification cache pour ${userId}:`, cached);
          if (cached && this._isValidCache(cached)) {
            console.log("✅ Cache valide trouvé");
            console.log(
              `📦 Conversations depuis cache: ${userId} (${
                Date.now() - startTime
              }ms)`
            );
            return JSON.parse(cached); // Parse explicite du JSON
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur lecture cache:", cacheError.message);
          await this.invalidateUserCache(userId); // Invalider en cas d'erreur
        }
      }

      // 2. Récupération depuis MongoDB avec vérification
      const conversationsResult =
        await this.conversationRepository.findByParticipant(userId, {
          page: 1,
          limit: 50,
          useCache: false,
          includeArchived: false,
        });

      if (
        !conversationsResult ||
        !Array.isArray(conversationsResult.conversations)
      ) {
        throw new Error("Format de données invalide depuis le repository");
      }

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

      // 3. Mise en cache améliorée
      if (useCache && this.cacheService && result.conversations.length > 0) {
        try {
          const cacheData = JSON.stringify({
            ...result,
            cachedAt: Date.now(),
            version: "1.0",
          });

          await this.cacheService.set(cacheKey, this.cacheTimeout, cacheData);
          console.log(
            `💾 ${result.conversations.length} conversations mises en cache pour ${userId}`
          );
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

  // Nouvelle méthode de validation du cache
  _isValidCache(cachedData) {
    try {
      const parsed = JSON.parse(cachedData);
      const now = Date.now();
      const cachedAt = parsed.cachedAt || 0;

      // Vérifier si le cache n'est pas trop vieux (5 minutes max)
      if (now - cachedAt > this.cacheTimeout * 1000) {
        return false;
      }

      // Vérifier la structure minimale des données
      return Array.isArray(parsed.conversations) && parsed.version === "1.0";
    } catch {
      return false;
    }
  }

  // Méthode d'invalidation améliorée
  async invalidateUserCache(userId) {
    if (!this.cacheService) return;

    const cacheKey = `conversations:${userId}`;
    try {
      const deleted = await this.cacheService.del(cacheKey);
      console.log(
        `🗑️ Cache conversations ${
          deleted ? "invalidé" : "déjà absent"
        } pour ${userId}`
      );
    } catch (error) {
      console.warn(
        "⚠️ Erreur invalidation cache conversations:",
        error.message
      );
    }
  }
}

module.exports = GetConversations;
