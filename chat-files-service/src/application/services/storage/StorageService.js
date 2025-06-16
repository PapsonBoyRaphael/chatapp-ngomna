/**
 * Service: Gestion du Stockage
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { BusinessException } = require('../../../shared/exceptions/BusinessException');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const logger = createLogger('StorageService');

class StorageService {
  constructor({
    localStorageProvider,
    cloudStorageProvider,
    cacheManager,
    config
  }) {
    this.localStorageProvider = localStorageProvider;
    this.cloudStorageProvider = cloudStorageProvider;
    this.cacheManager = cacheManager;
    this.config = config;
    this.defaultProvider = config.storage?.defaultProvider || 'local';
  }

  async uploadFile(file, options = {}) {
    logger.info('📤 Début upload fichier:', { 
      originalName: file.originalname || file.originalName,
      size: file.size,
      provider: options.provider || this.defaultProvider
    });

    try {
      // 1. Préparation du fichier
      const preparedFile = await this.prepareFile(file, options);

      // 2. Choix du provider
      const provider = this.selectProvider(options.provider, file.size);

      // 3. Upload vers le provider
      const uploadResult = await this.uploadToProvider(provider, preparedFile, options);

      // 4. Post-traitement
      const finalResult = await this.postProcessUpload(uploadResult, preparedFile, options);

      logger.info('✅ Upload fichier réussi:', { 
        fileName: finalResult.fileName,
        provider: finalResult.provider,
        size: finalResult.size
      });

      return finalResult;

    } catch (error) {
      logger.error('❌ Erreur upload fichier:', { 
        error: error.message,
        fileName: file.originalname || file.originalName
      });
      throw new BusinessException(`Erreur upload: ${error.message}`);
    }
  }

  async prepareFile(file, options) {
    const fileId = crypto.randomUUID();
    const extension = path.extname(file.originalname || file.originalName);
    const baseName = path.basename(file.originalname || file.originalName, extension);
    
    // Générer un nom de fichier unique
    const fileName = options.preserveOriginalName 
      ? `${fileId}_${this.sanitizeFileName(baseName)}${extension}`
      : `${fileId}${extension}`;

    // Préparer le chemin de stockage
    const storagePath = this.generateStoragePath(fileName, options.userId);

    return {
      id: fileId,
      originalName: file.originalname || file.originalName,
      fileName,
      storagePath,
      size: file.size,
      mimeType: file.mimetype || file.mimeType,
      buffer: file.buffer,
      stream: file.stream,
      tempPath: file.path,
      metadata: {
        uploadId: fileId,
        uploadedAt: new Date().toISOString(),
        userId: options.userId,
        userAgent: options.userAgent,
        ipAddress: options.ipAddress
      }
    };
  }

  sanitizeFileName(fileName) {
    return fileName
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 100); // Limiter la longueur
  }

  generateStoragePath(fileName, userId) {
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    return `uploads/${year}/${month}/${day}/${userId}/${fileName}`;
  }

  selectProvider(preferredProvider, fileSize) {
    if (preferredProvider) {
      return preferredProvider;
    }

    // Logique de sélection automatique
    const cloudThreshold = this.config.storage?.cloudThreshold || 50 * 1024 * 1024; // 50MB

    if (fileSize > cloudThreshold && this.cloudStorageProvider) {
      return 'cloud';
    }

    return this.localStorageProvider ? 'local' : 'cloud';
  }

  async uploadToProvider(providerType, file, options) {
    const provider = this.getProvider(providerType);
    
    if (!provider) {
      throw new BusinessException(`Provider de stockage non disponible: ${providerType}`);
    }

    try {
      // Upload avec retry
      return await this.executeWithRetry(
        () => provider.uploadFile(file, options),
        3,
        1000
      );

    } catch (error) {
      logger.error(`Erreur upload ${providerType}:`, { error: error.message });
      
      // Fallback vers un autre provider si possible
      if (providerType === 'cloud' && this.localStorageProvider) {
        logger.info('Fallback vers stockage local');
        return await this.localStorageProvider.uploadFile(file, options);
      }
      
      throw error;
    }
  }

  getProvider(providerType) {
    switch (providerType) {
      case 'local':
        return this.localStorageProvider;
      case 'cloud':
        return this.cloudStorageProvider;
      default:
        return null;
    }
  }

  async postProcessUpload(uploadResult, file, options) {
    const result = {
      ...uploadResult,
      id: file.id,
      originalName: file.originalName,
      fileName: file.fileName,
      size: file.size,
      mimeType: file.mimeType,
      metadata: file.metadata,
      versions: []
    };

    // Générer les versions si demandé
    if (options.generateThumbnail || options.generatePreview) {
      try {
        const versions = await this.generateVersions(file, uploadResult, options);
        result.versions = versions;
      } catch (error) {
        logger.warn('Erreur génération versions:', { error: error.message });
        // Ne pas faire échouer l'upload pour ça
      }
    }

    // Scanner la sécurité si demandé
    if (options.securityScan) {
      try {
        await this.scheduleSSecurityScan(result);
      } catch (error) {
        logger.warn('Erreur programmation scan sécurité:', { error: error.message });
      }
    }

    return result;
  }

  async generateVersions(file, uploadResult, options) {
    const versions = [];

    // Cette logique sera déléguée au FileProcessingService
    // Ici on programme juste le traitement asynchrone
    if (this.cacheManager) {
      await this.cacheManager.queueFileProcessing(
        file.id, 
        this.getFileCategory(file.mimeType),
        10 // priorité normale
      );
    }

    return versions;
  }

  getFileCategory(mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || mimeType.includes('document')) return 'document';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return 'archive';
    if (mimeType.startsWith('text/')) return 'text';
    return 'other';
  }

  async scheduleSSecurityScan(fileInfo) {
    if (this.cacheManager) {
      await this.cacheManager.queueSecurityScan(fileInfo.id, fileInfo.storagePath);
    }
  }

  // Téléchargement de fichiers

  async generateDownloadUrl(storagePath, options = {}) {
    logger.debug('🔗 Génération URL téléchargement:', { storagePath });

    try {
      // Déterminer le provider à partir du chemin
      const provider = this.getProviderFromPath(storagePath);
      
      if (!provider) {
        throw new BusinessException('Provider de stockage non trouvé pour ce fichier');
      }

      // Générer l'URL avec expiration
      const url = await provider.generateDownloadUrl(storagePath, {
        expiresIn: options.expiresIn || 3600, // 1 heure par défaut
        disposition: options.disposition || 'attachment',
        filename: options.filename,
        userId: options.userId
      });

      // Logger l'accès
      await this.logFileAccess(storagePath, options.userId, 'download_url_generated');

      return {
        url,
        expiresAt: new Date(Date.now() + (options.expiresIn || 3600) * 1000)
      };

    } catch (error) {
      logger.error('Erreur génération URL téléchargement:', { 
        error: error.message,
        storagePath 
      });
      throw new BusinessException(`Erreur génération URL: ${error.message}`);
    }
  }

  async getFileBuffer(storagePath) {
    logger.debug('📥 Récupération buffer fichier:', { storagePath });

    try {
      const provider = this.getProviderFromPath(storagePath);
      
      if (!provider) {
        throw new BusinessException('Provider de stockage non trouvé');
      }

      return await provider.getFileBuffer(storagePath);

    } catch (error) {
      logger.error('Erreur récupération buffer:', { 
        error: error.message,
        storagePath 
      });
      throw new BusinessException(`Erreur récupération fichier: ${error.message}`);
    }
  }

  async getFileStream(storagePath) {
    logger.debug('📤 Récupération stream fichier:', { storagePath });

    try {
      const provider = this.getProviderFromPath(storagePath);
      
      if (!provider) {
        throw new BusinessException('Provider de stockage non trouvé');
      }

      return await provider.getFileStream(storagePath);

    } catch (error) {
      logger.error('Erreur récupération stream:', { 
        error: error.message,
        storagePath 
      });
      throw new BusinessException(`Erreur récupération fichier: ${error.message}`);
    }
  }

  // Suppression de fichiers

  async deleteFile(storagePath) {
    logger.info('🗑️ Suppression fichier:', { storagePath });

    try {
      const provider = this.getProviderFromPath(storagePath);
      
      if (!provider) {
        logger.warn('Provider non trouvé pour suppression:', { storagePath });
        return false;
      }

      await provider.deleteFile(storagePath);
      
      // Logger la suppression
      await this.logFileAccess(storagePath, null, 'deleted');

      logger.info('✅ Fichier supprimé:', { storagePath });
      return true;

    } catch (error) {
      logger.error('Erreur suppression fichier:', { 
        error: error.message,
        storagePath 
      });
      
      // Ne pas faire échouer si le fichier n'existe déjà plus
      if (error.message.includes('not found') || error.message.includes('404')) {
        return true;
      }
      
      throw new BusinessException(`Erreur suppression: ${error.message}`);
    }
  }

  async saveProcessedFile(buffer, fileName, mimeType, metadata = {}) {
    logger.debug('💾 Sauvegarde fichier traité:', { fileName, size: buffer.length });

    try {
      const storagePath = this.generateProcessedFilePath(fileName);
      const provider = this.getProvider(this.defaultProvider);

      if (!provider) {
        throw new BusinessException('Aucun provider de stockage disponible');
      }

      const result = await provider.saveBuffer(buffer, storagePath, {
        mimeType,
        metadata: {
          ...metadata,
          isProcessed: true,
          createdAt: new Date().toISOString()
        }
      });

      return result.path || storagePath;

    } catch (error) {
      logger.error('Erreur sauvegarde fichier traité:', { 
        error: error.message,
        fileName 
      });
      throw new BusinessException(`Erreur sauvegarde: ${error.message}`);
    }
  }

  generateProcessedFilePath(fileName) {
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    
    return `processed/${year}/${month}/${fileName}`;
  }

  async getFileUrl(storagePath) {
    try {
      const provider = this.getProviderFromPath(storagePath);
      
      if (!provider || !provider.getFileUrl) {
        return null;
      }

      return await provider.getFileUrl(storagePath);

    } catch (error) {
      logger.warn('Erreur récupération URL fichier:', { 
        error: error.message,
        storagePath 
      });
      return null;
    }
  }

  // Utilitaires

  getProviderFromPath(storagePath) {
    // Logique simple: si le chemin contient un indicateur cloud, utiliser cloud
    if (storagePath.includes('cloud/') || storagePath.startsWith('http')) {
      return this.cloudStorageProvider;
    }
    
    return this.localStorageProvider || this.cloudStorageProvider;
  }

  async logFileAccess(storagePath, userId, action) {
    try {
      if (this.cacheManager) {
        await this.cacheManager.logFileAccess({
          storagePath,
          userId,
          action,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.warn('Erreur log accès fichier:', { error: error.message });
    }
  }

  async executeWithRetry(operation, maxRetries = 3, delayMs = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          logger.warn(`Tentative ${attempt} échouée, retry dans ${delayMs}ms`, {
            error: error.message,
            attempt,
            maxRetries
          });
          
          await this.delay(delayMs * attempt);
        }
      }
    }

    throw lastError;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Statistiques et monitoring

  async getStorageStats() {
    try {
      const stats = {
        totalFiles: 0,
        totalSize: 0,
        byProvider: {},
        byCategory: {}
      };

      // Récupérer les stats des providers
      if (this.localStorageProvider && this.localStorageProvider.getStats) {
        stats.byProvider.local = await this.localStorageProvider.getStats();
      }

      if (this.cloudStorageProvider && this.cloudStorageProvider.getStats) {
        stats.byProvider.cloud = await this.cloudStorageProvider.getStats();
      }

      return stats;

    } catch (error) {
      logger.error('Erreur récupération stats stockage:', { error: error.message });
      return null;
    }
  }

  async healthCheck() {
    const health = {
      local: false,
      cloud: false,
      overall: false
    };

    try {
      if (this.localStorageProvider && this.localStorageProvider.healthCheck) {
        health.local = await this.localStorageProvider.healthCheck();
      }

      if (this.cloudStorageProvider && this.cloudStorageProvider.healthCheck) {
        health.cloud = await this.cloudStorageProvider.healthCheck();
      }

      health.overall = health.local || health.cloud;

      return health;

    } catch (error) {
      logger.error('Erreur health check stockage:', { error: error.message });
      return health;
    }
  }
}

module.exports = StorageService;
