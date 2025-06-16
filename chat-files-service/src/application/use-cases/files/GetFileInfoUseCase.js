/**
 * Use Case: Récupération d'informations de Fichier
 * CENADI Chat-Files-Service
 */

const BaseUseCase = require('../BaseUseCase');
const { BusinessException } = require('../../../shared/exceptions/BusinessException');

class GetFileInfoUseCase extends BaseUseCase {
  constructor({
    fileRepository,
    cacheManager,
    permissionService,
    eventPublisher
  }) {
    super();
    this.fileRepository = fileRepository;
    this.cacheManager = cacheManager;
    this.permissionService = permissionService;
    this.eventPublisher = eventPublisher;
  }

  async execute(input) {
    const timer = this.startTimer();
    this.logStart('GetFileInfoUseCase', input);

    try {
      // 1. Validation des entrées
      this.validateInput(input);

      // 2. Récupération du fichier avec cache
      const file = await this.getFileWithCache(input.fileId);

      // 3. Vérification des permissions
      const permissions = await this.checkViewPermissions(file, input.user);

      // 4. Enrichissement des données selon les permissions
      const enrichedFile = await this.enrichFileData(file, input.user, permissions);

      // 5. Mise à jour des statistiques de vue
      await this.updateViewStats(file, input.user);

      // 6. Publication des événements
      await this.publishEvents(file, input.user);

      const result = this.createSuccessResponse(enrichedFile, 'Informations fichier récupérées');
      this.logSuccess('GetFileInfoUseCase', result);
      this.endTimer(timer, 'GetFileInfoUseCase');

      return result;

    } catch (error) {
      this.logError('GetFileInfoUseCase', error, input);
      throw error;
    }
  }

  validateInput(input) {
    this.validateId(input.fileId, 'fileId');
    
    if (!input.user) {
      throw new ValidationException('Utilisateur requis');
    }
  }

  async getFileWithCache(fileId) {
    try {
      // Essayer le cache en premier
      let file = null;
      
      if (this.cacheManager) {
        file = await this.cacheManager.getFileMetadata(fileId);
      }

      // Si pas en cache, récupérer depuis la base
      if (!file) {
        file = await this.fileRepository.findById(fileId);
        
        if (!file) {
          throw new BusinessException('Fichier non trouvé', 'FILE_NOT_FOUND');
        }

        // Mettre en cache
        if (this.cacheManager) {
          await this.cacheManager.cacheFileMetadata(fileId, file);
        }
      }

      // Vérifier l'état du fichier
      if (file.status === 'deleted') {
        throw new BusinessException('Fichier supprimé', 'FILE_DELETED');
      }

      if (file.status === 'processing') {
        // Fichier en cours de traitement, récupérer les infos fraîches
        const freshFile = await this.fileRepository.findById(fileId);
        if (freshFile && freshFile.status !== 'processing') {
          file = freshFile;
          // Mettre à jour le cache
          if (this.cacheManager) {
            await this.cacheManager.cacheFileMetadata(fileId, file);
          }
        }
      }

      return file;

    } catch (error) {
      this.handleRepositoryError(error, 'getFileWithCache');
    }
  }

  async checkViewPermissions(file, user) {
    try {
      // Vérifier les permissions en cache
      let permissions = null;
      
      if (this.cacheManager) {
        permissions = await this.cacheManager.getFilePermissions(file.id, user.id);
      }

      // Si pas en cache, calculer les permissions
      if (!permissions && this.permissionService) {
        permissions = await this.permissionService.getUserFilePermissions(file.id, user.id);
        
        // Mettre en cache
        if (this.cacheManager) {
          await this.cacheManager.cacheFilePermissions(file.id, user.id, permissions);
        }
      }

      // Permissions par défaut
      if (!permissions) {
        permissions = this.getDefaultViewPermissions(file, user);
      }

      // Vérifier la permission de vue
      if (!permissions.canView) {
        throw new BusinessException('Permission de visualisation refusée', 'VIEW_FORBIDDEN');
      }

      return permissions;

    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      
      throw new BusinessException('Erreur lors de la vérification des permissions');
    }
  }

  getDefaultViewPermissions(file, user) {
    // L'utilisateur qui a uploadé le fichier a tous les droits
    if (file.uploadedBy === user.id) {
      return {
        canView: true,
        canDownload: true,
        canShare: true,
        canDelete: true,
        canEdit: true
      };
    }

    // Pour les autres, permissions basées sur la visibilité
    return {
      canView: !file.isPrivate,
      canDownload: !file.isPrivate && !file.downloadRestricted,
      canShare: false,
      canDelete: false,
      canEdit: false
    };
  }

  async enrichFileData(file, user, permissions) {
    const enrichedFile = {
      // Informations de base (toujours visibles)
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      category: file.category,
      extension: file.extension,
      status: file.status,
      
      // Dates
      uploadedAt: file.uploadedAt,
      updatedAt: file.updatedAt,
      
      // Permissions de l'utilisateur
      permissions,
      
      // Informations conditionnelles selon les permissions
      ...(permissions.canView && {
        description: file.description,
        tags: file.tags || [],
        isPublic: file.isPublic,
        
        // Versions disponibles
        versions: this.filterVersionsByPermissions(file.versions || [], permissions),
        
        // Informations de traitement
        processingStatus: file.processingStatus,
        processingProgress: file.processingProgress
      }),

      // Informations détaillées pour le propriétaire ou admin
      ...(this.canViewDetailedInfo(file, user, permissions) && {
        uploadedBy: file.uploadedBy,
        conversationId: file.conversationId,
        messageId: file.messageId,
        storageProvider: file.storageProvider,
        
        // Métadonnées
        metadata: this.filterMetadata(file.metadata, permissions),
        
        // Sécurité
        security: this.filterSecurityInfo(file.security, permissions),
        
        // Statistiques
        stats: await this.getFileStats(file.id, permissions),
        
        // Expiration
        expiresAt: file.expiresAt
      })
    };

    return enrichedFile;
  }

  canViewDetailedInfo(file, user, permissions) {
    return file.uploadedBy === user.id || 
           user.isAdmin || 
           permissions.canEdit ||
           permissions.isOwner;
  }

  filterVersionsByPermissions(versions, permissions) {
    // Filtrer les versions selon les permissions
    return versions.filter(version => {
      if (version.type === 'thumbnail') return true; // Thumbnails toujours visibles
      if (version.type === 'preview') return permissions.canView;
      if (version.type === 'compressed') return permissions.canDownload;
      return permissions.canDownload;
    });
  }

  filterMetadata(metadata, permissions) {
    if (!metadata) return {};

    const filtered = {
      contentHash: metadata.contentHash,
      uploadMethod: metadata.uploadMethod
    };

    // Informations détaillées seulement pour certaines permissions
    if (permissions.canEdit || permissions.isOwner) {
      filtered.userAgent = metadata.userAgent;
      filtered.ipAddress = metadata.ipAddress;
      filtered.processingLogs = metadata.processingLogs;
    }

    return filtered;
  }

  filterSecurityInfo(security, permissions) {
    if (!security) return {};

    const filtered = {
      isScanned: security.isScanned,
      isSafe: security.isSafe
    };

    // Détails des menaces seulement pour le propriétaire
    if (permissions.isOwner || permissions.canEdit) {
      filtered.threats = security.threats;
      filtered.scanProvider = security.scanProvider;
      filtered.scannedAt = security.scannedAt;
    }

    return filtered;
  }

  async getFileStats(fileId, permissions) {
    try {
      if (!permissions.canEdit && !permissions.isOwner) {
        return null;
      }

      let stats = null;

      // Essayer le cache en premier
      if (this.cacheManager) {
        stats = await this.cacheManager.getFileStats(fileId);
      }

      // Si pas en cache, récupérer depuis la base
      if (!stats) {
        const file = await this.fileRepository.findById(fileId);
        stats = file?.stats || {
          downloadCount: 0,
          viewCount: 0,
          shareCount: 0
        };
      }

      return stats;

    } catch (error) {
      this.logger.warn('Erreur récupération stats:', { error: error.message });
      return null;
    }
  }

  async updateViewStats(file, user) {
    try {
      // Ne pas compter les vues du propriétaire
      if (file.uploadedBy === user.id) {
        return;
      }

      // Mettre à jour les statistiques
      await this.fileRepository.incrementViewCount(file.id);

      // Mettre à jour le cache
      if (this.cacheManager) {
        await this.cacheManager.incrementFileViews(file.id);
      }

    } catch (error) {
      this.logger.warn('Erreur mise à jour stats vue:', { error: error.message });
      // Ne pas faire échouer l'opération pour ça
    }
  }

  async publishEvents(file, user) {
    try {
      // Ne publier l'événement que si ce n'est pas le propriétaire
      if (file.uploadedBy !== user.id) {
        await this.publishEvent(this.eventPublisher, 'file.viewed', {
          fileId: file.id,
          fileName: file.originalName,
          viewedBy: user.id,
          viewedAt: new Date().toISOString()
        });
      }

    } catch (error) {
      this.logger.warn('Erreur publication événements:', { error: error.message });
    }
  }
}

module.exports = GetFileInfoUseCase;
