/**
 * Use Case: Récupérer les fichiers
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const { AuthorizationException } = require('../../../shared/exceptions/AuthorizationException');
const FileResponse = require('../../dto/responses/FileResponse');
const PaginatedResponse = require('../../dto/responses/PaginatedResponse');

const logger = createLogger('GetFilesUseCase');

class GetFilesUseCase {
  constructor(dependencies) {
    this.fileRepository = dependencies.fileRepository;
    this.conversationRepository = dependencies.conversationRepository;
    this.userRepository = dependencies.userRepository;
  }

  async execute(params) {
    try {
      const { 
        userId, 
        conversationId = null,
        filters = {},
        pagination = { page: 1, limit: 20 },
        includeMetadata = false,
        includeOwner = false
      } = params;

      logger.info('Récupération des fichiers:', { 
        userId, 
        conversationId, 
        filters, 
        pagination 
      });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Vérifier les permissions
      await this.checkPermissions(userId, conversationId);

      // 3. Construire les filtres de recherche
      const searchFilters = await this.buildSearchFilters(userId, conversationId, filters);

      // 4. Récupérer les fichiers avec pagination
      const result = await this.fileRepository.findPaginated(searchFilters, pagination);

      // 5. Enrichir les données si nécessaire
      const enrichedFiles = await this.enrichFiles(
        result.files, 
        { includeMetadata, includeOwner }
      );

      // 6. Formater la réponse
      const fileResponses = enrichedFiles.map(file => new FileResponse(file));
      const paginatedResponse = new PaginatedResponse(fileResponses, result.pagination);

      logger.info('Fichiers récupérés avec succès:', { 
        userId, 
        count: fileResponses.length,
        total: result.pagination.total 
      });

      return paginatedResponse;

    } catch (error) {
      logger.error('Erreur lors de la récupération des fichiers:', { 
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

    if (pagination.limit < 1 || pagination.limit > 100) {
      throw new ValidationException('La limite doit être entre 1 et 100');
    }
  }

  async checkPermissions(userId, conversationId) {
    // Si c'est pour une conversation spécifique, vérifier la participation
    if (conversationId) {
      if (!this.conversationRepository) {
        throw new AuthorizationException('Impossible de vérifier les permissions de conversation');
      }

      const isParticipant = await this.conversationRepository.isParticipant(conversationId, userId);
      if (!isParticipant) {
        throw new AuthorizationException('Vous n\'êtes pas autorisé à voir les fichiers de cette conversation');
      }
    }
  }

  async buildSearchFilters(userId, conversationId, filters) {
    const searchFilters = {
      status: { $ne: 'deleted' } // Exclure les fichiers supprimés
    };

    // Filtrage par conversation ou utilisateur
    if (conversationId) {
      searchFilters.conversationId = conversationId;
    } else {
      // Si pas de conversation spécifique, montrer les fichiers accessibles à l'utilisateur
      searchFilters.$or = [
        { uploadedBy: userId }, // Fichiers uploadés par l'utilisateur
        { isPublic: true }, // Fichiers publics
        { 
          conversationId: { 
            $in: await this.getUserConversationIds(userId) 
          } 
        } // Fichiers des conversations de l'utilisateur
      ];
    }

    // Filtrer par type de fichier
    if (filters.type) {
      const validTypes = ['image', 'document', 'video', 'audio', 'other'];
      if (validTypes.includes(filters.type)) {
        searchFilters.type = filters.type;
      }
    }

    // Filtrer par extension
    if (filters.extension) {
      searchFilters.extension = filters.extension.toLowerCase();
    }

    // Filtrer par taille
    if (filters.minSize || filters.maxSize) {
      searchFilters.size = {};
      if (filters.minSize) {
        searchFilters.size.$gte = parseInt(filters.minSize);
      }
      if (filters.maxSize) {
        searchFilters.size.$lte = parseInt(filters.maxSize);
      }
    }

    // Recherche par nom de fichier
    if (filters.search) {
      searchFilters.$or = [
        { filename: { $regex: filters.search, $options: 'i' } },
        { originalName: { $regex: filters.search, $options: 'i' } }
      ];
    }

    // Filtrer par période de création
    if (filters.createdAfter || filters.createdBefore) {
      searchFilters.createdAt = {};
      if (filters.createdAfter) {
        searchFilters.createdAt.$gte = new Date(filters.createdAfter);
      }
      if (filters.createdBefore) {
        searchFilters.createdAt.$lte = new Date(filters.createdBefore);
      }
    }

    // Filtrer par utilisateur qui a uploadé (pour les admins)
    if (filters.uploadedBy) {
      searchFilters.uploadedBy = filters.uploadedBy;
    }

    return searchFilters;
  }

  async getUserConversationIds(userId) {
    try {
      if (!this.conversationRepository) {
        return [];
      }

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

  async enrichFiles(files, options) {
    if (!options.includeOwner && !options.includeMetadata) {
      return files;
    }

    const enrichedFiles = await Promise.all(
      files.map(file => this.enrichSingleFile(file, options))
    );

    return enrichedFiles;
  }

  async enrichSingleFile(file, options) {
    try {
      const enrichedFile = { ...file };

      // Ajouter les informations du propriétaire
      if (options.includeOwner && file.uploadedBy) {
        enrichedFile.owner = await this.getFileOwner(file.uploadedBy);
      }

      // Ajouter des métadonnées calculées
      if (options.includeMetadata) {
        enrichedFile.calculatedMetadata = {
          downloadCount: file.downloadCount || 0,
          isImage: file.type === 'image',
          isRecent: this.isRecentFile(file.createdAt),
          sizeCategory: this.getSizeCategory(file.size),
          ageInDays: this.getFileAgeInDays(file.createdAt)
        };
      }

      return enrichedFile;

    } catch (error) {
      logger.warn('Erreur lors de l\'enrichissement du fichier:', { 
        fileId: file.id, 
        error: error.message 
      });
      return file;
    }
  }

  async getFileOwner(userId) {
    try {
      if (!this.userRepository) {
        return null;
      }

      const user = await this.userRepository.findById(userId);
      if (!user) {
        return null;
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      };

    } catch (error) {
      logger.warn('Impossible de récupérer les informations du propriétaire:', { 
        userId, 
        error: error.message 
      });
      return null;
    }
  }

  isRecentFile(createdAt) {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    return new Date(createdAt) > oneDayAgo;
  }

  getSizeCategory(size) {
    if (size < 1024 * 1024) { // < 1MB
      return 'small';
    } else if (size < 10 * 1024 * 1024) { // < 10MB
      return 'medium';
    } else if (size < 100 * 1024 * 1024) { // < 100MB
      return 'large';
    } else {
      return 'very_large';
    }
  }

  getFileAgeInDays(createdAt) {
    const now = new Date();
    const fileDate = new Date(createdAt);
    const diffTime = Math.abs(now - fileDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

module.exports = GetFilesUseCase;
