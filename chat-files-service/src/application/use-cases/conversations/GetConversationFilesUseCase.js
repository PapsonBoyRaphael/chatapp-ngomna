/**
 * Use Case: Récupération des Fichiers d'une Conversation
 * CENADI Chat-Files-Service
 */

const BaseUseCase = require('../BaseUseCase');
const { BusinessException } = require('../../../shared/exceptions/BusinessException');

class GetConversationFilesUseCase extends BaseUseCase {
  constructor({
    fileRepository,
    conversationRepository,
    cacheManager,
    permissionService
  }) {
    super();
    this.fileRepository = fileRepository;
    this.conversationRepository = conversationRepository;
    this.cacheManager = cacheManager;
    this.permissionService = permissionService;
  }

  async execute(input) {
    const timer = this.startTimer();
    this.logStart('GetConversationFilesUseCase', input);

    try {
      // 1. Validation des entrées
      this.validateInput(input);

      // 2. Vérification des permissions conversation
      await this.checkConversationPermissions(input.conversationId, input.user);

      // 3. Récupération des fichiers avec cache
      const files = await this.getConversationFilesWithCache(input);

      // 4. Filtrage et enrichissement des données
      const enrichedFiles = await this.enrichFilesData(files, input.user);

      // 5. Application de la pagination
      const paginatedResult = this.applyPagination(enrichedFiles, input.pagination);

      const result = this.createSuccessResponse(paginatedResult, 'Fichiers de conversation récupérés');
      this.logSuccess('GetConversationFilesUseCase', result);
      this.endTimer(timer, 'GetConversationFilesUseCase');

      return result;

    } catch (error) {
      this.logError('GetConversationFilesUseCase', error, input);
      throw error;
    }
  }

  validateInput(input) {
    this.validateId(input.conversationId, 'conversationId');
    
    if (!input.user) {
      throw new ValidationException('Utilisateur requis');
    }

    // Normaliser la pagination
    input.pagination = this.normalizePagination(input.pagination);

    // Valider les filtres
    if (input.filters) {
      this.validateFilters(input.filters);
    }
  }

  validateFilters(filters) {
    const validCategories = ['image', 'video', 'audio', 'document', 'archive', 'text', 'other'];
    
    if (filters.category && !validCategories.includes(filters.category)) {
      throw new ValidationException('Catégorie de fichier invalide');
    }

    if (filters.mimeType && typeof filters.mimeType !== 'string') {
      throw new ValidationException('Type MIME invalide');
    }

    if (filters.sizeMin && (isNaN(filters.sizeMin) || filters.sizeMin < 0)) {
      throw new ValidationException('Taille minimum invalide');
    }

    if (filters.sizeMax && (isNaN(filters.sizeMax) || filters.sizeMax < 0)) {
      throw new ValidationException('Taille maximum invalide');
    }

    if (filters.uploadedBy) {
      this.validateId(filters.uploadedBy, 'uploadedBy');
    }
  }

  async checkConversationPermissions(conversationId, user) {
    try {
      // Vérifier les permissions en cache
      let permissions = null;
      
      if (this.cacheManager) {
        permissions = await this.cacheManager.getUserConversationPermissions(conversationId, user.id);
      }

      // Si pas en cache, vérifier via le service
      if (!permissions && this.permissionService) {
        permissions = await this.permissionService.getUserConversationPermissions(conversationId, user.id);
        
        // Mettre en cache
        if (this.cacheManager) {
          await this.cacheManager.cacheUserConversationPermissions(conversationId, user.id, permissions);
        }
      }

      // Permissions par défaut basiques
      if (!permissions) {
        permissions = { canViewFiles: true }; // Assumé par défaut
      }

      if (!permissions.canViewFiles) {
        throw new BusinessException('Permission de voir les fichiers refusée', 'VIEW_FILES_FORBIDDEN');
      }

      return permissions;

    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      
      throw new BusinessException('Erreur lors de la vérification des permissions');
    }
  }

  async getConversationFilesWithCache(input) {
    try {
      let files = null;

      // Essayer le cache en premier (sans filtres complexes)
      if (this.cacheManager && this.isSimpleQuery(input)) {
        files = await this.cacheManager.getConversationFiles(input.conversationId);
      }

      // Si pas en cache ou requête complexe, récupérer depuis la base
      if (!files) {
        const queryOptions = this.buildQueryOptions(input);
        files = await this.fileRepository.findByConversationId(input.conversationId, queryOptions);
        
        // Mettre en cache si requête simple
        if (this.cacheManager && this.isSimpleQuery(input) && files.length <= 50) {
          await this.cacheManager.cacheConversationFiles(input.conversationId, files);
        }
      }

      return files;

    } catch (error) {
      this.handleRepositoryError(error, 'getConversationFiles');
    }
  }

  isSimpleQuery(input) {
    return !input.filters || 
           Object.keys(input.filters).length === 0 ||
           (Object.keys(input.filters).length === 1 && input.filters.category);
  }

  buildQueryOptions(input) {
    const options = {
      pagination: input.pagination,
      sort: input.sort || { uploadedAt: -1 }, // Plus récents en premier
      filters: {}
    };

    // Appliquer les filtres
    if (input.filters) {
      if (input.filters.category) {
        options.filters.category = input.filters.category;
      }

      if (input.filters.mimeType) {
        options.filters.mimeType = { $regex: input.filters.mimeType, $options: 'i' };
      }

      if (input.filters.sizeMin || input.filters.sizeMax) {
        options.filters.size = {};
        if (input.filters.sizeMin) options.filters.size.$gte = parseInt(input.filters.sizeMin);
        if (input.filters.sizeMax) options.filters.size.$lte = parseInt(input.filters.sizeMax);
      }

      if (input.filters.uploadedBy) {
        options.filters.uploadedBy = input.filters.uploadedBy;
      }

      if (input.filters.dateFrom || input.filters.dateTo) {
        options.filters.uploadedAt = {};
        if (input.filters.dateFrom) options.filters.uploadedAt.$gte = new Date(input.filters.dateFrom);
        if (input.filters.dateTo) options.filters.uploadedAt.$lte = new Date(input.filters.dateTo);
      }

      if (input.filters.search) {
        options.filters.$or = [
          { originalName: { $regex: input.filters.search, $options: 'i' } },
          { description: { $regex: input.filters.search, $options: 'i' } }
        ];
      }
    }

    // Toujours filtrer les fichiers actifs
    options.filters.status = 'active';

    return options;
  }

  async enrichFilesData(files, user) {
    const enrichedFiles = [];

    for (const file of files) {
      try {
        // Récupérer les permissions pour ce fichier
        const permissions = await this.getFilePermissions(file.id, user.id);
        
        // Ne pas inclure les fichiers sans permission de vue
        if (!permissions.canView) {
          continue;
        }

        // Enrichir les données du fichier
        const enrichedFile = {
          id: file.id,
          originalName: file.originalName,
          mimeType: file.mimeType,
          size: file.size,
          category: file.category,
          extension: file.extension,
          
          // Informations d'upload
          uploadedBy: file.uploadedBy,
          uploadedAt: file.uploadedAt,
          
          // Informations de traitement
          processingStatus: file.processingStatus,
          
          // Versions disponibles (filtrées)
          versions: this.filterVersions(file.versions || [], permissions),
          
          // Permissions utilisateur
          permissions,
          
          // Métadonnées basiques
          metadata: {
            contentHash: file.metadata?.contentHash,
            isSystem: file.metadata?.isSystem || false
          },
          
          // Statistiques publiques
          stats: {
            downloadCount: file.stats?.downloadCount || 0,
            viewCount: file.stats?.viewCount || 0
          }
        };

        // Ajouter des informations supplémentaires pour le propriétaire
        if (file.uploadedBy === user.id) {
          enrichedFile.description = file.description;
          enrichedFile.tags = file.tags || [];
          enrichedFile.isPublic = file.isPublic;
          enrichedFile.expiresAt = file.expiresAt;
        }

        enrichedFiles.push(enrichedFile);

      } catch (error) {
        this.logger.warn('Erreur enrichissement fichier:', { 
          fileId: file.id, 
          error: error.message 
        });
        // Continuer avec les autres fichiers
      }
    }

    return enrichedFiles;
  }

  async getFilePermissions(fileId, userId) {
    try {
      let permissions = null;
      
      if (this.cacheManager) {
        permissions = await this.cacheManager.getFilePermissions(fileId, userId);
      }

      if (!permissions && this.permissionService) {
        permissions = await this.permissionService.getUserFilePermissions(fileId, userId);
        
        if (this.cacheManager) {
          await this.cacheManager.cacheFilePermissions(fileId, userId, permissions);
        }
      }

      // Permissions par défaut
      if (!permissions) {
        permissions = {
          canView: true,
          canDownload: true,
          canShare: false,
          canDelete: false
        };
      }

      return permissions;

    } catch (error) {
      this.logger.warn('Erreur récupération permissions fichier:', { 
        fileId, 
        error: error.message 
      });
      
      return {
        canView: true,
        canDownload: false,
        canShare: false,
        canDelete: false
      };
    }
  }

  filterVersions(versions, permissions) {
    return versions.filter(version => {
      if (version.type === 'thumbnail') return true;
      if (version.type === 'preview') return permissions.canView;
      return permissions.canDownload;
    });
  }

  applyPagination(files, pagination) {
    const { page, limit, offset } = pagination;
    const totalCount = files.length;
    const paginatedFiles = files.slice(offset, offset + limit);

    return this.createPaginatedResponse(paginatedFiles, totalCount, pagination);
  }
}

module.exports = GetConversationFilesUseCase;
