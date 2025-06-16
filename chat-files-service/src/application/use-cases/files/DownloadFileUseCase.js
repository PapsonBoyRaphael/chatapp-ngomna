/**
 * Use Case: Téléchargement de Fichier
 * CENADI Chat-Files-Service
 */

const BaseUseCase = require('../BaseUseCase');
const { BusinessException } = require('../../../shared/exceptions/BusinessException');

class DownloadFileUseCase extends BaseUseCase {
  constructor({
    fileRepository,
    storageService,
    cacheManager,
    eventPublisher,
    securityService,
    permissionService
  }) {
    super();
    this.fileRepository = fileRepository;
    this.storageService = storageService;
    this.cacheManager = cacheManager;
    this.eventPublisher = eventPublisher;
    this.securityService = securityService;
    this.permissionService = permissionService;
  }

  async execute(input) {
    const timer = this.startTimer();
    this.logStart('DownloadFileUseCase', input);

    try {
      // 1. Validation des entrées
      this.validateInput(input);

      // 2. Récupération du fichier
      const file = await this.getFile(input.fileId);

      // 3. Vérification des permissions
      await this.checkPermissions(file, input.user);

      // 4. Rate limiting
      await this.checkRateLimit(input.user);

      // 5. Vérification de sécurité
      await this.checkFileSecurity(file);

      // 6. Génération de l'URL de téléchargement ou récupération du contenu
      const downloadResult = await this.generateDownload(file, input);

      // 7. Mise à jour des statistiques
      await this.updateStats(file, input.user);

      // 8. Publication des événements
      await this.publishEvents(file, input.user);

      const result = this.createSuccessResponse(downloadResult, 'Fichier prêt pour téléchargement');
      this.logSuccess('DownloadFileUseCase', result);
      this.endTimer(timer, 'DownloadFileUseCase');

      return result;

    } catch (error) {
      this.logError('DownloadFileUseCase', error, input);
      throw error;
    }
  }

  validateInput(input) {
    this.validateId(input.fileId, 'fileId');
    
    if (!input.user) {
      throw new ValidationException('Utilisateur requis');
    }
  }

  async getFile(fileId) {
    try {
      // Essayer le cache d'abord
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

        // Mettre en cache pour les prochaines fois
        if (this.cacheManager) {
          await this.cacheManager.cacheFileMetadata(fileId, file);
        }
      }

      // Vérifier que le fichier est actif
      if (file.status !== 'active') {
        throw new BusinessException('Fichier non disponible', 'FILE_UNAVAILABLE');
      }

      // Vérifier l'expiration
      if (file.expiresAt && new Date() > new Date(file.expiresAt)) {
        throw new BusinessException('Fichier expiré', 'FILE_EXPIRED');
      }

      return file;

    } catch (error) {
      this.handleRepositoryError(error, 'getFile');
    }
  }

  async checkPermissions(file, user) {
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

      // Permissions par défaut si pas de service de permissions
      if (!permissions) {
        permissions = this.getDefaultPermissions(file, user);
      }

      // Vérifier la permission de téléchargement
      if (!permissions.canDownload) {
        throw new BusinessException('Permission de téléchargement refusée', 'DOWNLOAD_FORBIDDEN');
      }

      return permissions;

    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      
      this.logger.error('Erreur vérification permissions:', { error: error.message });
      throw new BusinessException('Erreur lors de la vérification des permissions');
    }
  }

  getDefaultPermissions(file, user) {
    // L'utilisateur qui a uploadé le fichier a tous les droits
    if (file.uploadedBy === user.id) {
      return {
        canView: true,
        canDownload: true,
        canShare: true,
        canDelete: true
      };
    }

    // Pour les autres, permissions limitées par défaut
    return {
      canView: !file.isPrivate,
      canDownload: !file.isPrivate,
      canShare: false,
      canDelete: false
    };
  }

  async checkRateLimit(user) {
    if (!this.cacheManager) {
      return;
    }

    try {
      const rateLimit = await this.cacheManager.checkDownloadRateLimit(
        user.id,
        100, // 100 téléchargements
        3600 // par heure
      );

      if (!rateLimit.allowed) {
        throw new BusinessException(
          `Limite de téléchargement atteinte. Réessayez dans ${Math.ceil(rateLimit.resetIn / 60)} minutes`,
          'RATE_LIMIT_EXCEEDED'
        );
      }

    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      
      this.logger.warn('Erreur rate limiting:', { error: error.message });
      // Continuer sans rate limiting en cas d'erreur
    }
  }

  async checkFileSecurity(file) {
    // Vérifier si le fichier a été scanné
    if (!file.security?.isScanned) {
      this.logger.warn('Fichier non scanné en cours de téléchargement:', { fileId: file.id });
      // Optionnel : bloquer ou permettre avec avertissement
    }

    // Vérifier si le fichier est marqué comme dangereux
    if (file.security?.isSafe === false) {
      throw new BusinessException(
        'Fichier bloqué pour des raisons de sécurité',
        'FILE_SECURITY_BLOCKED'
      );
    }

    // Vérifier les menaces détectées
    if (file.security?.threats && file.security.threats.length > 0) {
      this.logger.warn('Fichier avec menaces détectées:', {
        fileId: file.id,
        threats: file.security.threats
      });
      
      // Décision basée sur la gravité des menaces
      const highSeverityThreats = file.security.threats.filter(t => t.severity === 'high');
      if (highSeverityThreats.length > 0) {
        throw new BusinessException(
          'Fichier bloqué: menaces de sécurité détectées',
          'FILE_THREATS_DETECTED'
        );
      }
    }
  }

  async generateDownload(file, input) {
    try {
      const downloadOptions = {
        userId: input.user.id,
        downloadType: input.downloadType || 'original', // original, thumbnail, preview
        disposition: input.disposition || 'attachment', // attachment, inline
        expiresIn: input.expiresIn || 3600 // 1 heure par défaut
      };

      // Choisir la version à télécharger
      const version = this.selectFileVersion(file, downloadOptions.downloadType);

      // Générer l'URL de téléchargement ou récupérer le contenu
      const downloadResult = await this.storageService.generateDownloadUrl(
        version.storageKey || file.storagePath,
        downloadOptions
      );

      return {
        fileId: file.id,
        fileName: file.originalName,
        mimeType: version.mimeType || file.mimeType,
        size: version.size || file.size,
        downloadUrl: downloadResult.url,
        expiresAt: downloadResult.expiresAt,
        downloadType: downloadOptions.downloadType,
        disposition: downloadOptions.disposition
      };

    } catch (error) {
      this.logger.error('Erreur génération téléchargement:', { error: error.message });
      throw new BusinessException(`Erreur lors de la génération du téléchargement: ${error.message}`);
    }
  }

  selectFileVersion(file, downloadType) {
    if (downloadType === 'original' || !file.versions || file.versions.length === 0) {
      return {
        storageKey: file.storagePath,
        mimeType: file.mimeType,
        size: file.size
      };
    }

    // Chercher la version demandée
    const version = file.versions.find(v => v.type === downloadType);
    
    if (version) {
      return version;
    }

    // Fallback vers l'original si la version n'existe pas
    this.logger.warn('Version demandée non trouvée, fallback vers original:', {
      fileId: file.id,
      requestedType: downloadType
    });

    return {
      storageKey: file.storagePath,
      mimeType: file.mimeType,
      size: file.size
    };
  }

  async updateStats(file, user) {
    try {
      // Mettre à jour les statistiques du fichier
      await this.fileRepository.incrementDownloadCount(file.id);

      // Mettre à jour le cache Redis
      if (this.cacheManager) {
        await this.cacheManager.incrementFileDownloads(file.id);
      }

      // Mettre à jour la dernière date d'accès
      await this.fileRepository.updateLastAccessed(file.id, new Date());

    } catch (error) {
      this.logger.warn('Erreur mise à jour statistiques:', { error: error.message });
      // Ne pas faire échouer le téléchargement pour ça
    }
  }

  async publishEvents(file, user) {
    try {
      await this.publishEvent(this.eventPublisher, 'file.downloaded', {
        fileId: file.id,
        fileName: file.originalName,
        downloadedBy: user.id,
        downloadedAt: new Date().toISOString(),
        size: file.size,
        mimeType: file.mimeType
      });

    } catch (error) {
      this.logger.warn('Erreur publication événements:', { error: error.message });
    }
  }
}

module.exports = DownloadFileUseCase;
