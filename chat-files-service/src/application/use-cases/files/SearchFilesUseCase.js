/**
 * Use Case: Rechercher des fichiers
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const FileResponse = require('../../dto/responses/FileResponse');
const PaginatedResponse = require('../../dto/responses/PaginatedResponse');

const logger = createLogger('SearchFilesUseCase');

class SearchFilesUseCase {
  constructor(dependencies) {
    this.fileRepository = dependencies.fileRepository;
    this.conversationRepository = dependencies.conversationRepository;
    this.searchEngine = dependencies.searchEngine;
    this.userRepository = dependencies.userRepository;
  }

  async execute(params) {
    try {
      const { 
        userId, 
        query,
        filters = {},
        pagination = { page: 1, limit: 20 },
        sortBy = 'relevance', // 'relevance', 'date', 'size', 'name'
        sortOrder = 'desc',
        includeContent = false,
        highlightMatches = true
      } = params;

      logger.info('Recherche de fichiers:', { 
        userId, 
        query: query?.substring(0, 50), 
        filters, 
        sortBy 
      });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Construire la requête de recherche
      const searchQuery = await this.buildSearchQuery(userId, query, filters);

      // 3. Effectuer la recherche
      const searchResults = await this.performSearch(searchQuery, {
        pagination,
        sortBy,
        sortOrder,
        includeContent,
        highlightMatches
      });

      // 4. Enrichir les résultats
      const enrichedResults = await this.enrichSearchResults(searchResults, {
        highlightMatches,
        includeOwner: filters.includeOwner
      });

      // 5. Formater la réponse
      const fileResponses = enrichedResults.files.map(file => new FileResponse(file));
      const paginatedResponse = new PaginatedResponse(fileResponses, {
        ...enrichedResults.pagination,
        searchQuery: query,
        searchTime: enrichedResults.searchTime,
        totalMatches: enrichedResults.totalMatches
      });

      logger.info('Recherche terminée:', { 
        userId, 
        query: query?.substring(0, 50),
        resultsCount: fileResponses.length,
        searchTime: enrichedResults.searchTime 
      });

      return paginatedResponse;

    } catch (error) {
      logger.error('Erreur lors de la recherche de fichiers:', { 
        error: error.message, 
        params 
      });
      throw error;
    }
  }

  async validateInput(params) {
    const { userId, query, pagination, sortBy, sortOrder } = params;

    if (!userId) {
      throw new ValidationException('ID utilisateur requis');
    }

    if (!query || query.trim().length === 0) {
      throw new ValidationException('Requête de recherche requise');
    }

    if (query.length > 200) {
      throw new ValidationException('Requête de recherche trop longue (200 caractères maximum)');
    }

    if (pagination.page < 1) {
      throw new ValidationException('Le numéro de page doit être supérieur à 0');
    }

    if (pagination.limit < 1 || pagination.limit > 50) {
      throw new ValidationException('La limite doit être entre 1 et 50');
    }

    const validSortBy = ['relevance', 'date', 'size', 'name', 'downloads'];
    if (!validSortBy.includes(sortBy)) {
      throw new ValidationException(`Tri invalide. Options: ${validSortBy.join(', ')}`);
    }

    const validSortOrder = ['asc', 'desc'];
    if (!validSortOrder.includes(sortOrder)) {
      throw new ValidationException(`Ordre de tri invalide. Options: ${validSortOrder.join(', ')}`);
    }
  }

  async buildSearchQuery(userId, query, filters) {
    const searchQuery = {
      text: query.trim(),
      userId,
      filters: {}
    };

    // Construire les filtres de base (fichiers accessibles à l'utilisateur)
    const userConversationIds = await this.getUserConversationIds(userId);
    
    searchQuery.accessFilter = {
      $or: [
        { uploadedBy: userId }, // Fichiers de l'utilisateur
        { isPublic: true }, // Fichiers publics
        { 
          conversationId: { 
            $in: userConversationIds 
          } 
        } // Fichiers des conversations de l'utilisateur
      ]
    };

    // Exclure les fichiers supprimés
    searchQuery.filters.status = { $ne: 'deleted' };

    // Filtrer par conversation spécifique
    if (filters.conversationId) {
      // Vérifier que l'utilisateur a accès à cette conversation
      if (userConversationIds.includes(filters.conversationId)) {
        searchQuery.filters.conversationId = filters.conversationId;
      } else {
        throw new ValidationException('Accès non autorisé à cette conversation');
      }
    }

    // Filtrer par type de fichier
    if (filters.types && Array.isArray(filters.types)) {
      const validTypes = ['image', 'document', 'video', 'audio', 'other'];
      const filteredTypes = filters.types.filter(type => validTypes.includes(type));
      if (filteredTypes.length > 0) {
        searchQuery.filters.type = { $in: filteredTypes };
      }
    }

    // Filtrer par taille
    if (filters.sizeRange) {
      const { min, max } = filters.sizeRange;
      if (min || max) {
        searchQuery.filters.size = {};
        if (min) searchQuery.filters.size.$gte = parseInt(min);
        if (max) searchQuery.filters.size.$lte = parseInt(max);
      }
    }

    // Filtrer par période
    if (filters.dateRange) {
      const { start, end } = filters.dateRange;
      if (start || end) {
        searchQuery.filters.createdAt = {};
        if (start) searchQuery.filters.createdAt.$gte = new Date(start);
        if (end) searchQuery.filters.createdAt.$lte = new Date(end);
      }
    }

    // Filtrer par utilisateur spécifique
    if (filters.uploadedBy) {
      searchQuery.filters.uploadedBy = filters.uploadedBy;
    }

    // Filtrer par extension
    if (filters.extensions && Array.isArray(filters.extensions)) {
      searchQuery.filters.extension = { $in: filters.extensions };
    }

    return searchQuery;
  }

  async performSearch(searchQuery, options) {
    const startTime = Date.now();

    try {
      let results;

      // Utiliser le moteur de recherche avancé si disponible
      if (this.searchEngine) {
        results = await this.searchEngine.search(searchQuery, options);
      } else {
        // Recherche basique via le repository
        results = await this.performBasicSearch(searchQuery, options);
      }

      const searchTime = Date.now() - startTime;

      return {
        ...results,
        searchTime
      };

    } catch (error) {
      logger.error('Erreur lors de l\'exécution de la recherche:', { 
        error: error.message,
        query: searchQuery.text 
      });
      throw new ValidationException('Erreur lors de la recherche');
    }
  }

  async performBasicSearch(searchQuery, options) {
    // Recherche basique sans moteur de recherche externe
    const { pagination, sortBy, sortOrder } = options;

    // Construire les filtres MongoDB
    const mongoFilters = {
      ...searchQuery.filters,
      ...searchQuery.accessFilter
    };

    // Ajouter la recherche textuelle
    if (searchQuery.text) {
      mongoFilters.$or = [
        { filename: { $regex: searchQuery.text, $options: 'i' } },
        { originalName: { $regex: searchQuery.text, $options: 'i' } },
        { 'metadata.description': { $regex: searchQuery.text, $options: 'i' } }
      ];
    }

    // Construire le tri
    const sort = this.buildSortOptions(sortBy, sortOrder);

    // Exécuter la requête
    const result = await this.fileRepository.findPaginated(mongoFilters, pagination, sort);

    return {
      files: result.files,
      pagination: result.pagination,
      totalMatches: result.pagination.total
    };
  }

  buildSortOptions(sortBy, sortOrder) {
    const sortOptions = {};
    const direction = sortOrder === 'desc' ? -1 : 1;

    switch (sortBy) {
      case 'date':
        sortOptions.createdAt = direction;
        break;
      case 'size':
        sortOptions.size = direction;
        break;
      case 'name':
        sortOptions.filename = direction;
        break;
      case 'downloads':
        sortOptions.downloadCount = direction;
        break;
      case 'relevance':
      default:
        // Pour la pertinence, trier par score puis par date
        sortOptions.score = -1;
        sortOptions.createdAt = -1;
        break;
    }

    return sortOptions;
  }

  async enrichSearchResults(searchResults, options) {
    const enrichedFiles = await Promise.all(
      searchResults.files.map(file => this.enrichSearchResult(file, options))
    );

    return {
      ...searchResults,
      files: enrichedFiles
    };
  }

  async enrichSearchResult(file, options) {
    try {
      const enrichedFile = { ...file };

      // Ajouter les informations du propriétaire
      if (options.includeOwner && file.uploadedBy) {
        enrichedFile.owner = await this.getFileOwner(file.uploadedBy);
      }

      // Ajouter les extraits mis en évidence
      if (options.highlightMatches && file._highlights) {
        enrichedFile.highlights = file._highlights;
      }

      // Ajouter des métadonnées de recherche
      enrichedFile.searchMetadata = {
        score: file._score || 0,
        matchedFields: file._matchedFields || [],
        isRecentlyAccessed: this.isRecentlyAccessed(file),
        popularityScore: this.calculatePopularityScore(file)
      };

      return enrichedFile;

    } catch (error) {
      logger.warn('Erreur lors de l\'enrichissement du résultat de recherche:', { 
        fileId: file.id, 
        error: error.message 
      });
      return file;
    }
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

  isRecentlyAccessed(file) {
    if (!file.lastAccessedAt) {
      return false;
    }

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return new Date(file.lastAccessedAt) > oneWeekAgo;
  }

  calculatePopularityScore(file) {
    const downloadCount = file.downloadCount || 0;
    const ageInDays = this.getFileAgeInDays(file.createdAt);
    
    // Score basé sur les téléchargements et l'âge
    return downloadCount / Math.max(ageInDays, 1);
  }

  getFileAgeInDays(createdAt) {
    const now = new Date();
    const fileDate = new Date(createdAt);
    const diffTime = Math.abs(now - fileDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

module.exports = SearchFilesUseCase;
