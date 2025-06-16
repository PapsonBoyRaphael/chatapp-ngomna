/**
 * Repository MongoDB : File
 * CENADI Chat-Files-Service
 */

const MongoBaseRepository = require('./MongoBaseRepository');
const { FileRepository } = require('../../../domain/repositories');
const { createLogger } = require('../../../../shared/utils/logger');
const { NotFoundException } = require('../../../../shared/exceptions/NotFoundException');
const { ValidationException } = require('../../../../shared/exceptions/ValidationException');

const logger = createLogger('MongoFileRepository');

class MongoFileRepository extends MongoBaseRepository {
  constructor(fileModel, fileEntityClass) {
    super(fileModel, fileEntityClass);
  }

  // Méthodes spécifiques aux fichiers

  async findByUploader(uploadedBy, options = {}) {
    try {
      logger.debug('Recherche fichiers par uploadeur:', { uploadedBy });

      const filters = {
        uploadedBy,
        status: { $ne: 'deleted' }
      };

      if (options.category) {
        filters.category = options.category;
      }

      if (options.mimeType) {
        filters.mimeType = options.mimeType;
      }

      if (options.processingStatus) {
        filters.processingStatus = options.processingStatus;
      }

      if (options.isPublic !== undefined) {
        filters.isPublic = options.isPublic;
      }

      // Filtres de taille
      if (options.minSize || options.maxSize) {
        filters.size = {};
        if (options.minSize) filters.size.$gte = options.minSize;
        if (options.maxSize) filters.size.$lte = options.maxSize;
      }

      // Filtres de date
      if (options.uploadedAfter || options.uploadedBefore) {
        filters.uploadedAt = {};
        if (options.uploadedAfter) filters.uploadedAt.$gte = options.uploadedAfter;
        if (options.uploadedBefore) filters.uploadedAt.$lte = options.uploadedBefore;
      }

      const pagination = options.pagination || {};
      const sort = options.sort || { uploadedAt: -1 };

      return await this.findPaginated(filters, pagination, sort);

    } catch (error) {
      logger.error('Erreur recherche fichiers par uploadeur:', { 
        error: error.message, 
        uploadedBy 
      });
      throw this.handleError(error);
    }
  }

  async findByConversation(conversationId, options = {}) {
    try {
      logger.debug('Recherche fichiers par conversation:', { conversationId });

      const filters = {
        conversationId,
        status: { $ne: 'deleted' }
      };

      if (options.category) {
        filters.category = options.category;
      }

      if (options.uploadedBy) {
        filters.uploadedBy = options.uploadedBy;
      }

      return await this.findAll({
        filters,
        sort: options.sort || { uploadedAt: -1 },
        limit: options.limit || 50,
        populate: options.populate
      });

    } catch (error) {
      logger.error('Erreur recherche fichiers par conversation:', { 
        error: error.message, 
        conversationId 
      });
      throw this.handleError(error);
    }
  }

  async findByMessage(messageId) {
    try {
      logger.debug('Recherche fichier par message:', { messageId });

      const file = await this.model.findOne({
        messageId,
        status: { $ne: 'deleted' }
      });

      return file ? this.toEntity(file) : null;

    } catch (error) {
      logger.error('Erreur recherche fichier par message:', { 
        error: error.message, 
        messageId 
      });
      throw this.handleError(error);
    }
  }

  async findByCategory(category, options = {}) {
    try {
      logger.debug('Recherche fichiers par catégorie:', { category });

      const filters = {
        category,
        status: { $ne: 'deleted' }
      };

      if (options.uploadedBy) {
        filters.uploadedBy = options.uploadedBy;
      }

      if (options.isPublic !== undefined) {
        filters.isPublic = options.isPublic;
      }

      return await this.findAll({
        filters,
        sort: options.sort || { uploadedAt: -1 },
        limit: options.limit || 100,
        populate: options.populate
      });

    } catch (error) {
      logger.error('Erreur recherche fichiers par catégorie:', { 
        error: error.message, 
        category 
      });
      throw this.handleError(error);
    }
  }

  async findByContentHash(contentHash) {
    try {
      logger.debug('Recherche fichier par hash:', { contentHash });

      const file = await this.model.findOne({
        'metadata.contentHash': contentHash,
        status: { $ne: 'deleted' }
      });

      return file ? this.toEntity(file) : null;

    } catch (error) {
      logger.error('Erreur recherche fichier par hash:', { 
        error: error.message, 
        contentHash 
      });
      throw this.handleError(error);
    }
  }

  async findDuplicates(contentHash, excludeId = null) {
    try {
      logger.debug('Recherche doublons:', { contentHash, excludeId });

      const filters = {
        'metadata.contentHash': contentHash,
        status: { $ne: 'deleted' }
      };

      if (excludeId) {
        filters._id = { $ne: excludeId };
      }

      const duplicates = await this.model.find(filters);
      return duplicates.map(file => this.toEntity(file));

    } catch (error) {
      logger.error('Erreur recherche doublons:', { 
        error: error.message, 
        contentHash 
      });
      throw this.handleError(error);
    }
  }

  async findExpiredFiles() {
    try {
      logger.debug('Recherche fichiers expirés');

      const files = await this.model.find({
        expiresAt: { $lt: new Date() },
        status: { $ne: 'deleted' }
      });

      return files.map(file => this.toEntity(file));

    } catch (error) {
      logger.error('Erreur recherche fichiers expirés:', { error: error.message });
      throw this.handleError(error);
    }
  }

  async findUnscannedFiles(limit = 50) {
    try {
      logger.debug('Recherche fichiers non scannés:', { limit });

      const files = await this.model.find({
        'security.isScanned': false,
        status: 'active'
      })
      .sort({ uploadedAt: 1 })
      .limit(limit);

      return files.map(file => this.toEntity(file));

    } catch (error) {
      logger.error('Erreur recherche fichiers non scannés:', { error: error.message });
      throw this.handleError(error);
    }
  }

  async findPendingProcessing(limit = 20) {
    try {
      logger.debug('Recherche fichiers en attente de traitement:', { limit });

      const files = await this.model.find({
        processingStatus: 'pending',
        status: 'active'
      })
      .sort({ uploadedAt: 1 })
      .limit(limit);

      return files.map(file => this.toEntity(file));

    } catch (error) {
      logger.error('Erreur recherche fichiers en attente:', { error: error.message });
      throw this.handleError(error);
    }
  }

  async findLargeFiles(minSizeMB = 50, options = {}) {
    try {
      logger.debug('Recherche gros fichiers:', { minSizeMB });

      const minSizeBytes = minSizeMB * 1024 * 1024;
      const filters = {
        size: { $gte: minSizeBytes },
        status: { $ne: 'deleted' }
      };

      if (options.uploadedBy) {
        filters.uploadedBy = options.uploadedBy;
      }

      return await this.findAll({
        filters,
        sort: { size: -1 },
        limit: options.limit || 100
      });

    } catch (error) {
      logger.error('Erreur recherche gros fichiers:', { 
        error: error.message, 
        minSizeMB 
      });
      throw this.handleError(error);
    }
  }

  async searchFiles(query, uploadedBy = null, options = {}) {
    try {
      logger.debug('Recherche fichiers:', { query, uploadedBy });

      const searchFilters = {
        status: { $ne: 'deleted' },
        $text: { $search: query }
      };

      if (uploadedBy) {
        searchFilters.uploadedBy = uploadedBy;
      }

      if (options.category) {
        searchFilters.category = options.category;
      }

      const files = await this.model.find(searchFilters, {
        score: { $meta: 'textScore' }
      })
      .sort({ score: { $meta: 'textScore' } })
      .limit(options.limit || 20);

      return files.map(file => this.toEntity(file));

    } catch (error) {
      logger.error('Erreur recherche fichiers:', { 
        error: error.message, 
        query, 
        uploadedBy 
      });
      throw this.handleError(error);
    }
  }

  // Méthodes de gestion des versions et métadonnées

  async addVersion(fileId, versionData) {
    try {
      logger.debug('Ajout version fichier:', { fileId, versionData });

      const updatedFile = await this.model.findByIdAndUpdate(
        fileId,
        {
          $push: {
            versions: {
              type: versionData.type,
              format: versionData.format,
              size: versionData.size,
              dimensions: versionData.dimensions,
              quality: versionData.quality,
              url: versionData.url,
              path: versionData.path,
              createdAt: new Date()
            }
          },
          $set: { updatedAt: new Date() }
        },
        { new: true, runValidators: true }
      );

      if (!updatedFile) {
        throw new NotFoundException('Fichier non trouvé');
      }

      logger.info('Version ajoutée:', { fileId, type: versionData.type });
      return this.toEntity(updatedFile);

    } catch (error) {
      logger.error('Erreur ajout version:', { 
        error: error.message, 
        fileId, 
        versionData 
      });
      throw this.handleError(error);
    }
  }

  async updateMetadata(fileId, metadata) {
    try {
      logger.debug('Mise à jour métadonnées:', { fileId });

      const updatedFile = await this.model.findByIdAndUpdate(
        fileId,
        {
          $set: {
            metadata: { ...metadata },
            updatedAt: new Date()
          }
        },
        { new: true, runValidators: true }
      );

      if (!updatedFile) {
        throw new NotFoundException('Fichier non trouvé');
      }

      logger.info('Métadonnées mises à jour:', { fileId });
      return this.toEntity(updatedFile);

    } catch (error) {
      logger.error('Erreur mise à jour métadonnées:', { 
        error: error.message, 
        fileId 
      });
      throw this.handleError(error);
    }
  }

  async updateProcessingStatus(fileId, status, error = null) {
    try {
      logger.debug('Mise à jour statut traitement:', { fileId, status, error });

      const updateData = {
        processingStatus: status,
        updatedAt: new Date()
      };

      if (error) {
        updateData.processingError = error;
      } else {
        updateData.$unset = { processingError: 1 };
      }

      const updatedFile = await this.model.findByIdAndUpdate(
        fileId,
        updateData,
        { new: true }
      );

      if (!updatedFile) {
        throw new NotFoundException('Fichier non trouvé');
      }

      logger.info('Statut traitement mis à jour:', { fileId, status });
      return this.toEntity(updatedFile);

    } catch (error) {
      logger.error('Erreur mise à jour statut traitement:', { 
        error: error.message, 
        fileId, 
        status 
      });
      throw this.handleError(error);
    }
  }

  // Méthodes de sécurité et scan

  async markAsSafe(fileId, scanProvider, scanResults = {}) {
    try {
      logger.debug('Marquage fichier comme sûr:', { fileId, scanProvider });

      const updatedFile = await this.model.findByIdAndUpdate(
        fileId,
        {
          $set: {
            'security.isScanned': true,
            'security.scannedAt': new Date(),
            'security.scanProvider': scanProvider,
            'security.isSafe': true,
            'security.threats': [],
            'security.scanResults': scanResults,
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedFile) {
        throw new NotFoundException('Fichier non trouvé');
      }

      logger.info('Fichier marqué comme sûr:', { fileId, scanProvider });
      return this.toEntity(updatedFile);

    } catch (error) {
      logger.error('Erreur marquage fichier sûr:', { 
        error: error.message, 
        fileId, 
        scanProvider 
      });
      throw this.handleError(error);
    }
  }

  async markAsUnsafe(fileId, threats, scanProvider, scanResults = {}) {
    try {
      logger.debug('Marquage fichier comme dangereux:', { fileId, threats, scanProvider });

      const updatedFile = await this.model.findByIdAndUpdate(
        fileId,
        {
          $set: {
            'security.isScanned': true,
            'security.scannedAt': new Date(),
            'security.scanProvider': scanProvider,
            'security.isSafe': false,
            'security.threats': threats,
            'security.scanResults': scanResults,
            status: 'inactive', // Désactiver le fichier dangereux
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedFile) {
        throw new NotFoundException('Fichier non trouvé');
      }

      logger.warn('Fichier marqué comme dangereux:', { 
        fileId, 
        threatCount: threats.length, 
        scanProvider 
      });
      return this.toEntity(updatedFile);

    } catch (error) {
      logger.error('Erreur marquage fichier dangereux:', { 
        error: error.message, 
        fileId, 
        threats 
      });
      throw this.handleError(error);
    }
  }

  // Méthodes de partage et permissions

  async shareWith(fileId, userId, permission, sharedBy) {
    try {
      logger.debug('Partage fichier:', { fileId, userId, permission, sharedBy });

      // Supprimer le partage existant
      await this.model.updateOne(
        { _id: fileId },
        { $pull: { sharedWith: { userId } } }
      );

      // Ajouter le nouveau partage
      const updatedFile = await this.model.findByIdAndUpdate(
        fileId,
        {
          $push: {
            sharedWith: {
              userId,
              permission,
              sharedBy,
              sharedAt: new Date()
            }
          },
          $inc: { 'stats.shareCount': 1 },
          $set: { updatedAt: new Date() }
        },
        { new: true }
      );

      if (!updatedFile) {
        throw new NotFoundException('Fichier non trouvé');
      }

      logger.info('Fichier partagé:', { fileId, userId, permission });
      return this.toEntity(updatedFile);

    } catch (error) {
      logger.error('Erreur partage fichier:', { 
        error: error.message, 
        fileId, 
        userId, 
        permission 
      });
      throw this.handleError(error);
    }
  }

  async unshareWith(fileId, userId) {
    try {
      logger.debug('Annulation partage fichier:', { fileId, userId });

      const updatedFile = await this.model.findByIdAndUpdate(
        fileId,
        {
          $pull: { sharedWith: { userId } },
          $set: { updatedAt: new Date() }
        },
        { new: true }
      );

      if (!updatedFile) {
        throw new NotFoundException('Fichier non trouvé');
      }

      logger.info('Partage annulé:', { fileId, userId });
      return this.toEntity(updatedFile);

    } catch (error) {
      logger.error('Erreur annulation partage:', { 
        error: error.message, 
        fileId, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  async findSharedWithUser(userId, options = {}) {
    try {
      logger.debug('Recherche fichiers partagés avec utilisateur:', { userId });

      const filters = {
        'sharedWith.userId': userId,
        status: { $ne: 'deleted' }
      };

      if (options.permission) {
        filters['sharedWith.permission'] = options.permission;
      }

      return await this.findAll({
        filters,
        sort: options.sort || { 'sharedWith.sharedAt': -1 },
        limit: options.limit || 50
      });

    } catch (error) {
      logger.error('Erreur recherche fichiers partagés:', { 
        error: error.message, 
        userId 
      });
      throw this.handleError(error);
    }
  }

  // Méthodes de statistiques et accès

  async incrementDownloadCount(fileId) {
    try {
      logger.debug('Incrémentation compteur téléchargement:', { fileId });

      const updatedFile = await this.model.findByIdAndUpdate(
        fileId,
        {
          $inc: { 'stats.downloadCount': 1 },
          $set: { 
            'stats.lastAccessed': new Date(),
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedFile) {
        throw new NotFoundException('Fichier non trouvé');
      }

      return this.toEntity(updatedFile);

    } catch (error) {
      logger.error('Erreur incrémentation téléchargement:', { 
        error: error.message, 
        fileId 
      });
      throw this.handleError(error);
    }
  }

  async incrementViewCount(fileId) {
    try {
      logger.debug('Incrémentation compteur vue:', { fileId });

      const updatedFile = await this.model.findByIdAndUpdate(
        fileId,
        {
          $inc: { 'stats.viewCount': 1 },
          $set: { 
            'stats.lastAccessed': new Date(),
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedFile) {
        throw new NotFoundException('Fichier non trouvé');
      }

      return this.toEntity(updatedFile);

    } catch (error) {
      logger.error('Erreur incrémentation vue:', { 
        error: error.message, 
        fileId 
      });
      throw this.handleError(error);
    }
  }

  async getStorageStats(uploadedBy) {
    try {
      logger.debug('Récupération statistiques stockage:', { uploadedBy });

      const stats = await this.model.aggregate([
        {
          $match: {
            uploadedBy,
            status: { $ne: 'deleted' }
          }
        },
        {
          $group: {
            _id: '$category',
            totalSize: { $sum: '$size' },
            count: { $sum: 1 },
            avgSize: { $avg: '$size' }
          }
        }
      ]);

      const totalStats = await this.model.aggregate([
        {
          $match: {
            uploadedBy,
            status: { $ne: 'deleted' }
          }
        },
        {
          $group: {
            _id: null,
            totalSize: { $sum: '$size' },
            totalFiles: { $sum: 1 },
            avgSize: { $avg: '$size' }
          }
        }
      ]);

      return {
        byCategory: stats,
        total: totalStats[0] || { totalSize: 0, totalFiles: 0, avgSize: 0 }
      };

    } catch (error) {
      logger.error('Erreur récupération statistiques:', { 
        error: error.message, 
        uploadedBy 
      });
      throw this.handleError(error);
    }
  }

  async getSystemStorageStats() {
    try {
      logger.debug('Récupération statistiques système');

      const stats = await this.model.aggregate([
        {
          $match: { status: { $ne: 'deleted' } }
        },
        {
          $group: {
            _id: {
              category: '$category',
              storageProvider: '$storageProvider'
            },
            totalSize: { $sum: '$size' },
            count: { $sum: 1 }
          }
        }
      ]);

      const totalStats = await this.model.aggregate([
        {
          $match: { status: { $ne: 'deleted' } }
        },
        {
          $group: {
            _id: null,
            totalSize: { $sum: '$size' },
            totalFiles: { $sum: 1 }
          }
        }
      ]);

      return {
        detailed: stats,
        total: totalStats[0] || { totalSize: 0, totalFiles: 0 }
      };

    } catch (error) {
      logger.error('Erreur récupération statistiques système:', { error: error.message });
      throw this.handleError(error);
    }
  }

  // Méthodes de maintenance

  async setExpiration(fileId, expirationDate) {
    try {
      logger.debug('Définition expiration fichier:', { fileId, expirationDate });

      const updatedFile = await this.model.findByIdAndUpdate(
        fileId,
        {
          $set: {
            expiresAt: expirationDate,
            retentionPolicy: 'temporary',
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedFile) {
        throw new NotFoundException('Fichier non trouvé');
      }

      logger.info('Expiration définie:', { fileId, expirationDate });
      return this.toEntity(updatedFile);

    } catch (error) {
      logger.error('Erreur définition expiration:', { 
        error: error.message, 
        fileId, 
        expirationDate 
      });
      throw this.handleError(error);
    }
  }

  async makePublic(fileId) {
    try {
      logger.debug('Fichier rendu public:', { fileId });

      const updatedFile = await this.model.findByIdAndUpdate(
        fileId,
        {
          $set: {
            isPublic: true,
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedFile) {
        throw new NotFoundException('Fichier non trouvé');
      }

      logger.info('Fichier rendu public:', { fileId });
      return this.toEntity(updatedFile);

    } catch (error) {
      logger.error('Erreur fichier public:', { 
        error: error.message, 
        fileId 
      });
      throw this.handleError(error);
    }
  }

  async makePrivate(fileId) {
    try {
      logger.debug('Fichier rendu privé:', { fileId });

      const updatedFile = await this.model.findByIdAndUpdate(
        fileId,
        {
          $set: {
            isPublic: false,
            updatedAt: new Date()
          }
        },
        { new: true }
      );

      if (!updatedFile) {
        throw new NotFoundException('Fichier non trouvé');
      }

      logger.info('Fichier rendu privé:', { fileId });
      return this.toEntity(updatedFile);

    } catch (error) {
      logger.error('Erreur fichier privé:', { 
        error: error.message, 
        fileId 
      });
      throw this.handleError(error);
    }
  }

  async findFilesForCleanup(retentionDays) {
    try {
      logger.debug('Recherche fichiers à nettoyer:', { retentionDays });

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const filters = {
        $or: [
          { expiresAt: { $lt: new Date() } },
          { 
            'stats.lastAccessed': { $lt: cutoffDate },
            retentionPolicy: 'auto_delete'
          }
        ],
        status: { $ne: 'deleted' }
      };

      const files = await this.model.find(filters);
      return files.map(file => this.toEntity(file));

    } catch (error) {
      logger.error('Erreur recherche fichiers à nettoyer:', { 
        error: error.message, 
        retentionDays 
      });
      throw this.handleError(error);
    }
  }

  async bulkUpdateProcessingStatus(fileIds, status, error = null) {
    try {
      logger.debug('Mise à jour statut traitement en lot:', { 
        fileIds, 
        status, 
        count: fileIds.length 
      });

      const updateData = {
        processingStatus: status,
        updatedAt: new Date()
      };

      if (error) {
        updateData.processingError = error;
      }

      const result = await this.model.updateMany(
        { _id: { $in: fileIds } },
        { $set: updateData }
      );

      logger.info('Statut traitement mis à jour en lot:', { 
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount 
      });

      return result;

    } catch (error) {
      logger.error('Erreur mise à jour statut en lot:', { 
        error: error.message, 
        fileIds, 
        status 
      });
      throw this.handleError(error);
    }
  }

  async findOrphanedFiles() {
    try {
      logger.debug('Recherche fichiers orphelins');

      // Fichiers sans message ni conversation
      const orphanedFiles = await this.model.find({
        messageId: null,
        conversationId: null,
        status: { $ne: 'deleted' }
      });

      return orphanedFiles.map(file => this.toEntity(file));

    } catch (error) {
      logger.error('Erreur recherche fichiers orphelins:', { error: error.message });
      throw this.handleError(error);
    }
  }

  async findFilesByStorageProvider(storageProvider, options = {}) {
    try {
      logger.debug('Recherche fichiers par fournisseur de stockage:', { storageProvider });

      const filters = {
        storageProvider,
        status: { $ne: 'deleted' }
      };

      return await this.findAll({
        filters,
        sort: options.sort || { uploadedAt: -1 },
        limit: options.limit || 100
      });

    } catch (error) {
      logger.error('Erreur recherche par fournisseur stockage:', { 
        error: error.message, 
        storageProvider 
      });
      throw this.handleError(error);
    }
  }
}

// Hériter des méthodes de FileRepository
Object.setPrototypeOf(MongoFileRepository.prototype, FileRepository.prototype);

module.exports = MongoFileRepository;
