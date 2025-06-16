/**
 * Use Case: Suppression de Fichier
 * CENADI Chat-Files-Service
 */

const BaseUseCase = require('../BaseUseCase');
const { BusinessException } = require('../../../shared/exceptions/BusinessException');

class DeleteFileUseCase extends BaseUseCase {
  constructor({
    fileRepository,
    storageService,
    cacheManager,
    eventPublisher,
    permissionService
  }) {
    super();
    this.fileRepository = fileRepository;
    this.storageService = storageService;
    this.cacheManager = cacheManager;
    this.eventPublisher = eventPublisher;
    this.permissionService = permissionService;
  }

  async execute(input) {
    const timer = this.startTimer();
    this.logStart('DeleteFileUseCase', input);

    try {
      // 1. Validation des entrées
      this.validateInput(input);

      // 2. Récupération du fichier
      const file = await this.getFile(input.fileId);

      // 3. Vérification des permissions
      await this.checkDeletePermissions(file, input.user);

      // 4. Vérification des contraintes métier
      await this.checkBusinessConstraints(file, input);

      // 5. Suppression logique ou physique
      const deletionResult = await this.performDeletion(file, input);

      // 6. Nettoyage du cache et mise à jour des quotas
      await this.cleanupCacheAndQuota(file, input.user);

      // 7. Publication des événements
      await this.publishEvents(file, input.user, deletionResult);

      const result = this.createSuccessResponse(deletionResult, 'Fichier supprimé avec succès');
      this.logSuccess('DeleteFileUseCase', result);
      this.endTimer(timer, 'DeleteFileUseCase');

      return result;

    } catch (error) {
      this.logError('DeleteFileUseCase', error, input);
      throw error;
    }
  }

  validateInput(input) {
    this.validateId(input.fileId, 'fileId');
    
    if (!input.user) {
      throw new ValidationException('Utilisateur requis');
    }

    // Valider le type de suppression
    const validDeletionTypes = ['soft', 'hard'];
    if (input.deletionType && !validDeletionTypes.includes(input.deletionType)) {
      throw new ValidationException('Type de suppression invalide');
    }
  }

  async getFile(fileId) {
    try {
      const file = await this.fileRepository.findById(fileId);
      
      if (!file) {
        throw new BusinessException('Fichier non trouvé', 'FILE_NOT_FOUND');
      }

      if (file.status === 'deleted') {
        throw new BusinessException('Fichier déjà supprimé', 'FILE_ALREADY_DELETED');
      }

      return file;

    } catch (error) {
      this.handleRepositoryError(error, 'getFile');
    }
  }

  async checkDeletePermissions(file, user) {
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
        permissions = this.getDefaultDeletePermissions(file, user);
      }

      if (!permissions.canDelete) {
        throw new BusinessException('Permission de suppression refusée', 'DELETE_FORBIDDEN');
      }

      return permissions;

    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      
      throw new BusinessException('Erreur lors de la vérification des permissions');
    }
  }

  getDefaultDeletePermissions(file, user) {
    // Seul l'utilisateur qui a uploadé peut supprimer par défaut
    return {
      canDelete: file.uploadedBy === user.id
    };
  }

  async checkBusinessConstraints(file, input) {
    // Vérifier si le fichier est lié à des messages/conversations actifs
    if (file.messageId && !input.force) {
      throw new BusinessException(
        'Impossible de supprimer un fichier lié à un message. Utilisez force=true si nécessaire',
        'FILE_LINKED_TO_MESSAGE'
      );
    }

    // Vérifier s'il s'agit d'un fichier système
    if (file.metadata?.isSystem && !input.user.isAdmin) {
      throw new BusinessException(
        'Seuls les administrateurs peuvent supprimer les fichiers système',
        'SYSTEM_FILE_DELETE_FORBIDDEN'
      );
    }

    // Vérifier les dépendances (autres fichiers qui référencent celui-ci)
    if (file.metadata?.hasReferences && !input.force) {
      const references = await this.fileRepository.findReferences(file.id);
      if (references.length > 0) {
        throw new BusinessException(
          `Fichier référencé par ${references.length} autre(s) élément(s). Utilisez force=true pour supprimer quand même`,
          'FILE_HAS_REFERENCES'
        );
      }
    }
  }

  async performDeletion(file, input) {
    const deletionType = input.deletionType || (input.force ? 'hard' : 'soft');
    
    if (deletionType === 'soft') {
      return await this.performSoftDeletion(file, input);
    } else {
      return await this.performHardDeletion(file, input);
    }
  }

  async performSoftDeletion(file, input) {
    try {
      // Marquer le fichier comme supprimé
      const updateData = {
        status: 'deleted',
        deletedAt: new Date(),
        deletedBy: input.user.id,
        deletionReason: input.reason || 'User deletion',
        updatedAt: new Date()
      };

      const updatedFile = await this.fileRepository.update(file.id, updateData);

      this.logger.info('Suppression logique effectuée:', { fileId: file.id });

      return {
        fileId: file.id,
        deletionType: 'soft',
        deletedAt: updateData.deletedAt,
        canRestore: true
      };

    } catch (error) {
      this.logger.error('Erreur suppression logique:', { error: error.message });
      throw new BusinessException('Erreur lors de la suppression logique');
    }
  }

  async performHardDeletion(file, input) {
    try {
      // 1. Supprimer les fichiers du stockage
      await this.deleteFromStorage(file);

      // 2. Supprimer de la base de données
      await this.fileRepository.delete(file.id);

      this.logger.info('Suppression physique effectuée:', { fileId: file.id });

      return {
        fileId: file.id,
        deletionType: 'hard',
        deletedAt: new Date(),
        canRestore: false
      };

    } catch (error) {
      this.logger.error('Erreur suppression physique:', { error: error.message });
      throw new BusinessException('Erreur lors de la suppression physique');
    }
  }

  async deleteFromStorage(file) {
    try {
      // Supprimer le fichier principal
      if (file.storagePath) {
        await this.storageService.deleteFile(file.storagePath);
      }

      // Supprimer toutes les versions (thumbnails, previews, etc.)
      if (file.versions && file.versions.length > 0) {
        for (const version of file.versions) {
          if (version.storageKey) {
            await this.storageService.deleteFile(version.storageKey);
          }
        }
      }

    } catch (error) {
      this.logger.error('Erreur suppression stockage:', { 
        error: error.message, 
        fileId: file.id 
      });
      
      // Ne pas faire échouer la suppression si le fichier n'existe plus en stockage
      if (!error.message.includes('not found') && !error.message.includes('404')) {
        throw error;
      }
    }
  }

  async cleanupCacheAndQuota(file, user) {
    try {
      if (this.cacheManager) {
        // Supprimer du cache
        await this.cacheManager.invalidateFileCache(file.id);

        // Mettre à jour le quota utilisateur (seulement pour suppression physique)
        if (file.status === 'deleted') { // Suppression physique
          await this.cacheManager.decrementUserStorage(user.id, file.size);
        }

        // Invalider les caches liés
        if (file.conversationId) {
          await this.cacheManager.invalidateConversationCache(file.conversationId);
        }
      }

    } catch (error) {
      this.logger.warn('Erreur nettoyage cache:', { error: error.message });
      // Ne pas faire échouer la suppression pour ça
    }
  }

  async publishEvents(file, user, deletionResult) {
    try {
      await this.publishEvent(this.eventPublisher, 'file.deleted', {
        fileId: file.id,
        fileName: file.originalName,
        deletedBy: user.id,
        deletedAt: deletionResult.deletedAt,
        deletionType: deletionResult.deletionType,
        size: file.size,
        conversationId: file.conversationId,
        messageId: file.messageId
      });

      if (file.conversationId) {
        await this.publishEvent(this.eventPublisher, 'conversation.file.removed', {
          conversationId: file.conversationId,
          fileId: file.id,
          removedBy: user.id
        });
      }

    } catch (error) {
      this.logger.warn('Erreur publication événements:', { error: error.message });
    }
  }
}

module.exports = DeleteFileUseCase;
