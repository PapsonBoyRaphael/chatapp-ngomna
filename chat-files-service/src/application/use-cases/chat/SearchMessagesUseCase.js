/**
 * Use Case: Rechercher des messages
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const MessageResponse = require('../../dto/responses/MessageResponse');
const PaginatedResponse = require('../../dto/responses/PaginatedResponse');

const logger = createLogger('SearchMessagesUseCase');

class SearchMessagesUseCase {
  constructor(dependencies) {
    this.messageRepository = dependencies.messageRepository;
    this.conversationRepository = dependencies.conversationRepository;
    this.authenticationService = dependencies.authenticationService;
  }

  async execute(params) {
    try {
      const { 
        userId, 
        searchQuery, 
        filters = {}, 
        pagination = { page: 1, limit: 20 },
        sortBy = 'relevance' 
      } = params;

      logger.info('Recherche de messages:', { userId, searchQuery, filters });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Construire les filtres de recherche
      const searchFilters = await this.buildSearchFilters(userId, searchQuery, filters);

      // 3. Effectuer la recherche
      const result = await this.performSearch(searchFilters, pagination, sortBy);

      // 4. Filtrer selon les permissions
      const filteredMessages = await this.filterByPermissions(result.messages, userId);

      // 5. Enrichir les résultats
      const enrichedMessages = await this.enrichResults(filteredMessages);

      // 6. Formater la réponse
      const messageResponses = enrichedMessages.map(message => new MessageResponse(message));
      const paginatedResponse = new PaginatedResponse(messageResponses, {
        ...result.pagination,
        total: filteredMessages.length
      });

      logger.info('Recherche terminée:', { 
        userId, 
        searchQuery, 
        resultCount: messageResponses.length 
      });

      return paginatedResponse;

    } catch (error) {
      logger.error('Erreur lors de la recherche de messages:', { error: error.message, params });
      throw error;
    }
  }

  async validateInput(params) {
    const { userId, searchQuery, pagination } = params;

    if (!userId) {
      throw new ValidationException('ID utilisateur requis');
    }

    if (!searchQuery || searchQuery.trim().length < 2) {
      throw new ValidationException('La recherche doit contenir au moins 2 caractères');
    }

    if (searchQuery.length > 100) {
      throw new ValidationException('La recherche ne peut pas dépasser 100 caractères');
    }

    if (pagination.page < 1) {
      throw new ValidationException('Le numéro de page doit être supérieur à 0');
    }

    if (pagination.limit < 1 || pagination.limit > 50) {
      throw new ValidationException('La limite doit être entre 1 et 50');
    }
  }

  async buildSearchFilters(userId, searchQuery, filters) {
    const searchFilters = {
      // Recherche textuelle
      $text: { $search: searchQuery },
      
      // Exclure les messages supprimés
      deletedAt: { $exists: false }
    };

    // Filtrer par conversation spécifique
    if (filters.conversationId) {
      searchFilters.conversationId = filters.conversationId;
    } else {
      // Limiter aux conversations où l'utilisateur est participant
      const userConversations = await this.getUserConversations(userId);
      searchFilters.conversationId = { $in: userConversations };
    }

    // Filtrer par type de message
    if (filters.type) {
      searchFilters.type = filters.type;
    }

    // Filtrer par période
    if (filters.dateFrom || filters.dateTo) {
      searchFilters.createdAt = {};
      if (filters.dateFrom) {
        searchFilters.createdAt.$gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        searchFilters.createdAt.$lte = new Date(filters.dateTo);
      }
    }

    // Filtrer par expéditeur
    if (filters.senderId) {
      searchFilters.senderId = filters.senderId;
    }

    return searchFilters;
  }

  async getUserConversations(userId) {
    try {
      const conversations = await this.conversationRepository.findByParticipant(userId);
      return conversations.map(conv => conv.id);
    } catch (error) {
      logger.warn('Impossible de récupérer les conversations de l\'utilisateur:', { 
        userId, 
        error: error.message 
      });
      return [];
    }
  }

  async performSearch(searchFilters, pagination, sortBy) {
    // Définir le tri
    let sort = {};
    switch (sortBy) {
      case 'newest':
        sort = { createdAt: -1 };
        break;
      case 'oldest':
        sort = { createdAt: 1 };
        break;
      case 'relevance':
      default:
        sort = { score: { $meta: 'textScore' }, createdAt: -1 };
        break;
    }

    // Effectuer la recherche avec projection du score de pertinence
    const projection = sortBy === 'relevance' ? 
      { score: { $meta: 'textScore' } } : 
      {};

    return await this.messageRepository.searchPaginated(
      searchFilters, 
      pagination, 
      sort, 
      projection
    );
  }

  async filterByPermissions(messages, userId) {
    // Filtrer les messages selon les permissions de l'utilisateur
    const filteredMessages = [];

    for (const message of messages) {
      try {
        const canRead = await this.conversationRepository.isParticipant(
          message.conversationId, 
          userId
        );
        
        if (canRead) {
          filteredMessages.push(message);
        }
      } catch (error) {
        logger.warn('Erreur lors de la vérification des permissions:', { 
          messageId: message.id, 
          error: error.message 
        });
      }
    }

    return filteredMessages;
  }

  async enrichResults(messages) {
    // Enrichir les résultats avec des informations supplémentaires
    return Promise.all(messages.map(async (message) => {
      try {
        // Ajouter des extraits de contexte pour la recherche
        if (message.content && message.content.length > 200) {
          message.searchExcerpt = this.generateExcerpt(message.content, 200);
        }

        // Ajouter des informations sur la conversation
        if (message.conversationId) {
          const conversation = await this.conversationRepository.findById(message.conversationId);
          if (conversation) {
            message.conversationInfo = {
              id: conversation.id,
              name: conversation.name,
              type: conversation.type
            };
          }
        }

        return message;
      } catch (error) {
        logger.warn('Erreur lors de l\'enrichissement du message:', { 
          messageId: message.id, 
          error: error.message 
        });
        return message;
      }
    }));
  }

  generateExcerpt(content, maxLength) {
    if (content.length <= maxLength) {
      return content;
    }

    const excerpt = content.substring(0, maxLength);
    const lastSpaceIndex = excerpt.lastIndexOf(' ');
    
    return lastSpaceIndex > 0 ? 
      excerpt.substring(0, lastSpaceIndex) + '...' : 
      excerpt + '...';
  }
}

module.exports = SearchMessagesUseCase;
