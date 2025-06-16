/**
 * Use Case: Partage de Fichier
 * CENADI Chat-Files-Service
 */

const BaseUseCase = require('../BaseUseCase');
const { BusinessException } = require('../../../shared/exceptions/BusinessException');
const { v4: uuidv4 } = require('uuid');

class ShareFileUseCase extends BaseUseCase {
  constructor({
    fileRepository,
    shareRepository,
    cacheManager,
    eventPublisher,
    permissionService,
    notificationService
  }) {
    super();
    this.fileRepository = fileRepository;
    this.shareRepository = shareRepository;
    this.cacheManager = cacheManager;
    this.eventPublisher = eventPublisher;
    this.permissionService = permissionService;
    this.notificationService = notificationService;
  }

  async execute(input) {
    const timer = this.startTimer();
    this.logStart('ShareFileUseCase', input);

    try {
      // 1. Validation des entrées
      this.validateInput(input);

      // 2. Récupération du fichier
      const file = await this.getFile(input.fileId);

      // 3. Vérification des permissions de partage
      await this.checkSharePermissions(file, input.user);

      // 4. Création du partage
      const share = await this.createShare(file, input);

      // 5. Mise à jour du cache
      await this.updateCache(share, file);

      // 6. Envoi des notifications
      await this.sendNotifications(share, file, input.user);

      // 7. Publication des événements
      await this.publishEvents(share, file, input.user);

      const result = this.createSuccessResponse(share, 'Fichier partagé avec succès');
      this.logSuccess('ShareFileUseCase', result);
      this.endTimer(timer, 'ShareFileUseCase');

      return result;

    } catch (error) {
      this.logError('ShareFileUseCase', error, input);
      throw error;
    }
  }

  validateInput(input) {
    this.validateId(input.fileId, 'fileId');
    
    if (!input.user) {
      throw new ValidationException('Utilisateur requis');
    }

    // Validation du type de partage
    const validShareTypes = ['public', 'private', 'conversation', 'direct'];
    if (!input.shareType || !validShareTypes.includes(input.shareType)) {
      throw new ValidationException('Type de partage invalide');
    }

    // Validation selon le type de partage
    this.validateShareTypeSpecific(input);

    // Validation des permissions
    if (input.permissions) {
      this.validateSharePermissions(input.permissions);
    }

    // Validation de l'expiration
    if (input.expiresAt) {
      const expirationDate = new Date(input.expiresAt);
      if (expirationDate <= new Date()) {
        throw new ValidationException('Date d\'expiration invalide');
      }
    }
  }

  validateShareTypeSpecific(input) {
    switch (input.shareType) {
      case 'conversation':
        if (!input.conversationId) {
          throw new ValidationException('ID de conversation requis pour le partage conversation');
        }
        this.validateId(input.conversationId, 'conversationId');
        break;

      case 'direct':
        if (!input.recipients || !Array.isArray(input.recipients) || input.recipients.length === 0) {
          throw new ValidationException('Destinataires requis pour le partage direct');
        }
        input.recipients.forEach(recipientId => {
          this.validateId(recipientId, 'recipient');
        });
        break;

      case 'private':
        if (!input.shareCode && !input.generateShareCode) {
          throw new ValidationException('Code de partage requis pour le partage privé');
        }
        break;
    }
  }

  validateSharePermissions(permissions) {
    const validPermissions = ['view', 'download', 'comment'];
    const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
    
    if (invalidPermissions.length > 0) {
      throw new ValidationException(`Permissions invalides: ${invalidPermissions.join(', ')}`);
    }
  }

  async getFile(fileId) {
    try {
      const file = await this.fileRepository.findById(fileId);
      
      if (!file) {
        throw new BusinessException('Fichier non trouvé', 'FILE_NOT_FOUND');
      }

      if (file.status !== 'active') {
        throw new BusinessException('Fichier non disponible pour partage', 'FILE_UNAVAILABLE');
      }

      return file;

    } catch (error) {
      this.handleRepositoryError(error, 'getFile');
    }
  }

  async checkSharePermissions(file, user) {
    try {
      // Vérifier les permissions en cache
      let permissions = null;
      
      if (this.cacheManager) {
        permissions = await this.cacheManager.getFilePermissions(file.id, user.id);
      }

      if (!permissions && this.permissionService) {
        permissions = await this.permissionService.getUserFilePermissions(file.id, user.id);
      }

      if (!permissions) {
        permissions = this.getDefaultSharePermissions(file, user);
      }

      if (!permissions.canShare) {
        throw new BusinessException('Permission de partage refusée', 'SHARE_FORBIDDEN');
      }

      // Vérifier les restrictions de partage du fichier
      if (file.shareRestrictions) {
        this.checkFileShareRestrictions(file.shareRestrictions, user);
      }

      return permissions;

    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      
      throw new BusinessException('Erreur lors de la vérification des permissions');
    }
  }

  getDefaultSharePermissions(file, user) {
    return {
      canShare: file.uploadedBy === user.id
    };
  }

  checkFileShareRestrictions(restrictions, user) {
    if (restrictions.disabled) {
      throw new BusinessException('Partage désactivé pour ce fichier', 'SHARING_DISABLED');
    }

    if (restrictions.allowedUsers && !restrictions.allowedUsers.includes(user.id)) {
      throw new BusinessException('Utilisateur non autorisé à partager ce fichier', 'USER_NOT_ALLOWED_TO_SHARE');
    }

    if (restrictions.maxShares && restrictions.currentShares >= restrictions.maxShares) {
      throw new BusinessException('Nombre maximum de partages atteint', 'MAX_SHARES_REACHED');
    }
  }

  async createShare(file, input) {
    try {
      const shareData = {
        id: uuidv4(),
        fileId: file.id,
        sharedBy: input.user.id,
        shareType: input.shareType,
        
        // Permissions du partage
        permissions: input.permissions || ['view', 'download'],
        
        // Configuration du partage
        title: input.title || `Partage de ${file.originalName}`,
        description: input.description || null,
        
        // Expiration
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : this.getDefaultExpiration(),
        
        // Limites
        maxDownloads: input.maxDownloads || null,
        maxViews: input.maxViews || null,
        
        // État
        isActive: true,
        
        // Statistiques
        stats: {
          viewCount: 0,
          downloadCount: 0,
          uniqueViewers: []
        },
        
        // Dates
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Configuration selon le type de partage
      this.configureShareByType(shareData, input);

      // Sauvegarde
      const share = await this.shareRepository.create(shareData);

      // Mettre à jour les statistiques du fichier
      await this.fileRepository.incrementShareCount(file.id);

      return share;

    } catch (error) {
      this.logger.error('Erreur création partage:', { error: error.message });
      throw new BusinessException('Erreur lors de la création du partage');
    }
  }

  configureShareByType(shareData, input) {
    switch (input.shareType) {
      case 'public':
        shareData.isPublic = true;
        shareData.publicUrl = this.generatePublicUrl(shareData.id);
        break;

      case 'private':
        shareData.shareCode = input.shareCode || this.generateShareCode();
        shareData.privateUrl = this.generatePrivateUrl(shareData.id, shareData.shareCode);
        break;

      case 'conversation':
        shareData.conversationId = input.conversationId;
        break;

      case 'direct':
        shareData.recipients = input.recipients;
        shareData.individualUrls = this.generateIndividualUrls(shareData.id, input.recipients);
        break;
    }
  }

  generateShareCode(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  generatePublicUrl(shareId) {
    return `${process.env.BASE_URL}/share/public/${shareId}`;
  }

  generatePrivateUrl(shareId, shareCode) {
    return `${process.env.BASE_URL}/share/private/${shareId}/${shareCode}`;
  }

  generateIndividualUrls(shareId, recipients) {
    return recipients.reduce((urls, recipientId) => {
      const token = this.generateShareCode(16);
      urls[recipientId] = `${process.env.BASE_URL}/share/direct/${shareId}/${token}`;
      return urls;
    }, {});
  }

  getDefaultExpiration() {
    // 7 jours par défaut
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + 7);
    return expiration;
  }

  async updateCache(share, file) {
    try {
      if (this.cacheManager) {
        // Invalider le cache du fichier pour forcer le refresh
        await this.cacheManager.invalidateFileCache(file.id);
        
        // Cacher les informations de partage
        await this.cacheManager.set(
          `share:${share.id}`,
          {
            id: share.id,
            fileId: share.fileId,
            shareType: share.shareType,
            permissions: share.permissions,
            isActive: share.isActive,
            expiresAt: share.expiresAt
          },
          3600 // 1 heure
        );
      }

    } catch (error) {
      this.logger.warn('Erreur mise à jour cache partage:', { error: error.message });
    }
  }

  async sendNotifications(share, file, user) {
    try {
      if (!this.notificationService) {
        return;
      }

      const notificationData = {
        type: 'file_shared',
        title: 'Fichier partagé avec vous',
        message: `${user.name || user.email} a partagé le fichier "${file.originalName}" avec vous`,
        data: {
          shareId: share.id,
          fileId: file.id,
          fileName: file.originalName,
          sharedBy: user.id
        }
      };

      // Envoyer selon le type de partage
      switch (share.shareType) {
        case 'direct':
          for (const recipientId of share.recipients) {
            await this.notificationService.sendToUser(recipientId, notificationData);
          }
          break;

        case 'conversation':
          await this.notificationService.sendToConversation(share.conversationId, notificationData);
          break;
      }

    } catch (error) {
      this.logger.warn('Erreur envoi notifications:', { error: error.message });
    }
  }

  async publishEvents(share, file, user) {
    try {
      await this.publishEvent(this.eventPublisher, 'file.shared', {
        shareId: share.id,
        fileId: file.id,
        fileName: file.originalName,
        sharedBy: user.id,
        shareType: share.shareType,
        recipients: share.recipients || null,
        conversationId: share.conversationId || null,
        createdAt: share.createdAt
      });

    } catch (error) {
      this.logger.warn('Erreur publication événements:', { error: error.message });
    }
  }
}

module.exports = ShareFileUseCase;
