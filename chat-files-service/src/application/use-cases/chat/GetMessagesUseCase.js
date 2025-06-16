/**
 * Use Case: Récupérer les messages d'une conversation
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const { AuthorizationException } = require('../../../shared/exceptions/AuthorizationException');
const MessageResponse = require('../../dto/responses/MessageResponse');
const PaginatedResponse = require('../../dto/responses/PaginatedResponse');

const logger = createLogger('GetMessagesUseCase');

class GetMessagesUseCase {
  constructor(dependencies) {
    this.messageRepository = dependencies.messageRepository;
    this.conversationRepository = dependencies.conversationRepository;
    this.fileRepository = dependencies.fileRepository;
    this.authenticationService = dependencies.authenticationService;
  }

  async execute(params) {
    try {
      const { 
        conversationId, 
        userId, 
        pagination = { page: 1, limit: 50 },
        filters = {},
        includeFiles = true 
      } = params;

      logger.info('Récupération des messages:', { userId, conversationId, pagination });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Vérifier les permissions
      await this.checkPermissions(userId, conversationId);

      // 3. Construire les filtres de recherche
      const searchFilters = await this.buildSearchFilters(conversationId, filters);

      // 4. Récupérer les messages
      const result = await this.messageRepository.findPaginated(searchFilters, pagination);

      // 5. Enrichir avec les informations de fichiers si nécessaire
      if (includeFiles) {
        result.messages = await this.enrichWithFileInfo(result.messages);
      }

      // 6. Marquer les messages comme lus
      await this.markMessagesAsRead(result.messages, userId);

      // 7. Formater la réponse
      const messageResponses = result.messages.map(message => new MessageResponse(message));
      const paginatedResponse = new PaginatedResponse(messageResponses, result.pagination);

      logger.info('Messages récupérés avec succès:', { 
        conversationId, 
        userId, 
        count: messageResponses.length 
      });

      return paginatedResponse;

    } catch (error) {
      logger.error('Erreur lors de la récupération des messages:', { error: error.message, params });
      throw error;
    }
  }

  async validateInput(params) {
    const { conversationId, userId, pagination } = params;

    if (!conversationId) {
      throw new ValidationException('ID de conversation requis');
    }

    if (!userId) {
      throw new ValidationException('ID utilisateur requis');
    }

    if (pagination.page < 1) {
      throw new ValidationException('Le numéro de page doit être supérieur à 0');
    }

    if (pagination.limit < 1 || pagination.limit > 100) {
      throw new ValidationException('La limite doit être entre 1 et 100');
    }
  }

  async checkPermissions(userId, conversationId) {
    // Vérifier que l'utilisateur peut lire cette conversation
    const hasPermission = await this.conversationRepository.isParticipant(conversationId, userId);
    
    if (!hasPermission) {
      throw new AuthorizationException('Vous n\'êtes pas autorisé à lire cette conversation');
    }
  }

  async buildSearchFilters(conversationId, filters) {
    const searchFilters = {
      conversationId,
      deletedAt: { $exists: false } // Exclure les messages supprimés par défaut
    };

    // Filtrer par type de message
    if (filters.type) {
      searchFilters.type = filters.type;
    }

    // Filtrer par période
    if (filters.before || filters.after) {
      searchFilters.createdAt = {};
      if (filters.before) {
        searchFilters.createdAt.$lt = new Date(filters.before);
      }
      if (filters.after) {
        searchFilters.createdAt.$gt = new Date(filters.after);
      }
    }

    // Filtrer par expéditeur
    if (filters.senderId) {
      searchFilters.senderId = filters.senderId;
    }

    // Inclure les messages supprimés si demandé (pour les admins)
    if (filters.includeDeleted) {
      delete searchFilters.deletedAt;
    }

    return searchFilters;
  }

  async enrichWithFileInfo(messages) {
    try {
      const fileIds = messages
        .filter(message => message.fileId)
        .map(message => message.fileId);

      if (fileIds.length === 0) {
        return messages;
      }

      const files = await this.fileRepository.findByIds(fileIds);
      const fileMap = new Map(files.map(file => [file.id, file]));

      return messages.map(message => {
        if (message.fileId && fileMap.has(message.fileId)) {
          message.fileInfo = fileMap.get(message.fileId);
        }
        return message;
      });

    } catch (error) {
      logger.warn('Impossible d\'enrichir avec les informations de fichiers:', { 
        error: error.message 
      });
      return messages;
    }
  }

  async markMessagesAsRead(messages, userId) {
    try {
      const unreadMessageIds = messages
        .filter(message => 
          message.senderId !== userId && 
          !message.readBy?.includes(userId)
        )
        .map(message => message.id);

      if (unreadMessageIds.length > 0) {
        await this.messageRepository.markAsRead(unreadMessageIds, userId);
      }

    } catch (error) {
      logger.warn('Impossible de marquer les messages comme lus:', { 
        userId, 
        error: error.message 
      });
    }
  }
}

module.exports = GetMessagesUseCase;
