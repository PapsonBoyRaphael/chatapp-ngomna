/**
 * Use Case: Récupérer les conversations d'un utilisateur
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const ConversationResponse = require('../../dto/responses/ConversationResponse');
const PaginatedResponse = require('../../dto/responses/PaginatedResponse');

const logger = createLogger('GetConversationsUseCase');

class GetConversationsUseCase {
  constructor(dependencies) {
    this.conversationRepository = dependencies.conversationRepository;
    this.messageRepository = dependencies.messageRepository;
    this.userRepository = dependencies.userRepository;
  }

  async execute(params) {
    try {
      const { 
        userId, 
        pagination = { page: 1, limit: 20 },
        filters = {},
        includeLastMessage = true,
        includeUnreadCount = true,
        includeParticipants = false
      } = params;

      logger.info('Récupération des conversations:', { userId, pagination, filters });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Construire les filtres de recherche
      const searchFilters = this.buildSearchFilters(userId, filters);

      // 3. Récupérer les conversations
      const result = await this.conversationRepository.findPaginated(searchFilters, pagination);

      // 4. Enrichir avec les données supplémentaires
      const enrichedConversations = await this.enrichConversations(
        result.conversations, 
        userId, 
        { includeLastMessage, includeUnreadCount, includeParticipants }
      );

      // 5. Formater la réponse
      const conversationResponses = enrichedConversations.map(conv => 
        new ConversationResponse(conv)
      );

      const paginatedResponse = new PaginatedResponse(conversationResponses, result.pagination);

      logger.info('Conversations récupérées avec succès:', { 
        userId, 
        count: conversationResponses.length,
        total: result.pagination.total 
      });

      return paginatedResponse;

    } catch (error) {
      logger.error('Erreur lors de la récupération des conversations:', { 
        error: error.message, 
        params 
      });
      throw error;
    }
  }

  async validateInput(params) {
    const { userId, pagination } = params;

    if (!userId) {
      throw new ValidationException('ID utilisateur requis');
    }

    if (pagination.page < 1) {
      throw new ValidationException('Le numéro de page doit être supérieur à 0');
    }

    if (pagination.limit < 1 || pagination.limit > 50) {
      throw new ValidationException('La limite doit être entre 1 et 50');
    }
  }

  buildSearchFilters(userId, filters) {
    const searchFilters = {
      participants: userId, // L'utilisateur doit être participant
      status: { $ne: 'deleted' } // Exclure les conversations supprimées
    };

    // Filtrer par type
    if (filters.type) {
      const validTypes = ['private', 'group', 'channel'];
      if (validTypes.includes(filters.type)) {
        searchFilters.type = filters.type;
      }
    }

    // Filtrer par statut
    if (filters.status) {
      const validStatuses = ['active', 'archived', 'muted'];
      if (validStatuses.includes(filters.status)) {
        searchFilters.status = filters.status;
      }
    }

    // Recherche par nom
    if (filters.search) {
      searchFilters.name = {
        $regex: filters.search,
        $options: 'i'
      };
    }

    // Filtrer par période d'activité
    if (filters.lastActivityBefore || filters.lastActivityAfter) {
      searchFilters.lastActivity = {};
      if (filters.lastActivityBefore) {
        searchFilters.lastActivity.$lt = new Date(filters.lastActivityBefore);
      }
      if (filters.lastActivityAfter) {
        searchFilters.lastActivity.$gt = new Date(filters.lastActivityAfter);
      }
    }

    return searchFilters;
  }

  async enrichConversations(conversations, userId, options) {
    const enriched = await Promise.all(
      conversations.map(conversation => this.enrichSingleConversation(conversation, userId, options))
    );

    return enriched;
  }

  async enrichSingleConversation(conversation, userId, options) {
    try {
      const enrichedConversation = { ...conversation };

      // Ajouter le dernier message
      if (options.includeLastMessage) {
        enrichedConversation.lastMessage = await this.getLastMessage(conversation.id);
      }

      // Ajouter le nombre de messages non lus
      if (options.includeUnreadCount) {
        enrichedConversation.unreadCount = await this.getUnreadCount(conversation.id, userId);
      }

      // Ajouter les informations des participants
      if (options.includeParticipants) {
        enrichedConversation.participantDetails = await this.getParticipantDetails(
          conversation.participants
        );
      }

      // Ajouter des métadonnées pour l'utilisateur
      enrichedConversation.userMetadata = {
        isAdmin: this.isUserAdmin(conversation, userId),
        isMuted: this.isConversationMuted(conversation, userId),
        joinedAt: this.getUserJoinDate(conversation, userId)
      };

      return enrichedConversation;

    } catch (error) {
      logger.warn('Erreur lors de l\'enrichissement de la conversation:', { 
        conversationId: conversation.id, 
        error: error.message 
      });
      return conversation;
    }
  }

  async getLastMessage(conversationId) {
    try {
      const lastMessage = await this.messageRepository.findLastByConversation(conversationId);
      
      if (!lastMessage) {
        return null;
      }

      return {
        id: lastMessage.id,
        content: lastMessage.content,
        type: lastMessage.type,
        senderId: lastMessage.senderId,
        createdAt: lastMessage.createdAt,
        fileId: lastMessage.fileId
      };

    } catch (error) {
      logger.warn('Impossible de récupérer le dernier message:', { 
        conversationId, 
        error: error.message 
      });
      return null;
    }
  }

  async getUnreadCount(conversationId, userId) {
    try {
      return await this.messageRepository.countUnreadByConversation(conversationId, userId);
    } catch (error) {
      logger.warn('Impossible de compter les messages non lus:', { 
        conversationId, 
        userId, 
        error: error.message 
      });
      return 0;
    }
  }

  async getParticipantDetails(participantIds) {
    try {
      const participants = await this.userRepository.findByIds(participantIds);
      
      return participants.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        status: user.status,
        lastSeen: user.lastSeen
      }));

    } catch (error) {
      logger.warn('Impossible de récupérer les détails des participants:', { 
        participantIds, 
        error: error.message 
      });
      return [];
    }
  }

  isUserAdmin(conversation, userId) {
    // Vérifier si l'utilisateur est admin de la conversation
    if (conversation.createdBy === userId) {
      return true;
    }

    if (conversation.metadata?.admins && conversation.metadata.admins.includes(userId)) {
      return true;
    }

    return false;
  }

  isConversationMuted(conversation, userId) {
    // Vérifier si l'utilisateur a mis en sourdine cette conversation
    if (conversation.metadata?.mutedBy && conversation.metadata.mutedBy.includes(userId)) {
      return true;
    }

    return false;
  }

  getUserJoinDate(conversation, userId) {
    // Récupérer la date de jointure de l'utilisateur
    if (conversation.metadata?.joinDates && conversation.metadata.joinDates[userId]) {
      return conversation.metadata.joinDates[userId];
    }

    // Par défaut, considérer la date de création
    return conversation.createdAt;
  }
}

module.exports = GetConversationsUseCase;
