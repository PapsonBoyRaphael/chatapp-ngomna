/**
 * Use Case: Upload de Fichier
 * CENADI Chat-Files-Service
 */

const BaseUseCase = require('../BaseUseCase');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const crypto = require('crypto');

class UploadFileUseCase extends BaseUseCase {
  constructor({
    fileRepository,
    storageService,
    cacheManager,
    eventPublisher,
    quotaService,
    securityService
  }) {
    super();
    this.fileRepository = fileRepository;
    this.storageService = storageService;
    this.cacheManager = cacheManager;
    this.eventPublisher = eventPublisher;
    this.quotaService = quotaService;
    this.securityService = securityService;
  }

  async execute(input) {
    const timer = this.startTimer();
    this.logStart('UploadFileUseCase', input);

    try {
      // 1. Validation des entrées
      this.validateInput(input);
      this.validateFileInput(input.file);

      // 2. Validation des permissions
      this.validatePermissions(input.user, ['file:upload']);

      // 3. Validation des quotas
      await this.validateQuota(input.user, this.quotaService, input.file.size);

      // 4. Calcul du hash du fichier
      const contentHash = await this.calculateFileHash(input.file);

      // 5. Vérification des doublons
      const existingFile = await this.checkForDuplicate(contentHash, input);

      if (existingFile) {
        return this.handleDuplicateFile(existingFile, input);
      }

      // 6. Acquisition du verrou pour éviter les uploads simultanés
      const lock = await this.acquireUploadLock(contentHash);

      try {
        // 7. Upload vers le système de stockage
        const uploadResult = await this.uploadToStorage(input.file, input.user);

        // 8. Création de l'entité fichier
        const fileData = await this.createFileEntity(input, uploadResult, contentHash);

        // 9. Sauvegarde en base
        const savedFile = await this.fileRepository.create(fileData);

        // 10. Mise à jour du cache et quotas
        await this.updateCacheAndQuota(savedFile, input.user);

        // 11. Publication des événements
        await this.publishEvents(savedFile);

        // 12. Programmation du traitement asynchrone
        await this.scheduleProcessing(savedFile);

        const result = this.createSuccessResponse(savedFile, 'Fichier uploadé avec succès');
        this.logSuccess('UploadFileUseCase', result);
        this.endTimer(timer, 'UploadFileUseCase');

        return result;

      } finally {
        await this.releaseUploadLock(contentHash, lock);
      }

    } catch (error) {
      this.logError('UploadFileUseCase', error, input);
      throw error;
    }
  }

  validateInput(input) {
    if (!input.user) {
      throw new ValidationException('Utilisateur requis');
    }

    if (!input.file) {
      throw new ValidationException('Fichier requis');
    }

    // Validation optionnelle des champs
    if (input.conversationId) {
      this.validateId(input.conversationId, 'conversationId');
    }

    if (input.messageId) {
      this.validateId(input.messageId, 'messageId');
    }
  }

  async calculateFileHash(file) {
    try {
      const hash = crypto.createHash('sha256');
      
      if (file.buffer) {
        hash.update(file.buffer);
      } else if (file.path) {
        const fs = require('fs');
        const stream = fs.createReadStream(file.path);
        
        return new Promise((resolve, reject) => {
          stream.on('data', chunk => hash.update(chunk));
          stream.on('end', () => resolve(hash.digest('hex')));
          stream.on('error', reject);
        });
      }

      return hash.digest('hex');

    } catch (error) {
      this.logger.error('Erreur calcul hash fichier:', { error: error.message });
      throw new BusinessException('Impossible de calculer l\'empreinte du fichier');
    }
  }

  async checkForDuplicate(contentHash, input) {
    try {
      const existingFile = await this.fileRepository.findByContentHash(contentHash);
      
      if (existingFile && existingFile.uploadedBy === input.user.id) {
        this.logger.info('Fichier dupliqué détecté:', { 
          existingFileId: existingFile.id,
          contentHash 
        });
        return existingFile;
      }

      return null;

    } catch (error) {
      this.logger.warn('Erreur vérification doublons:', { error: error.message });
      return null; // Continuer l'upload en cas d'erreur
    }
  }

  async handleDuplicateFile(existingFile, input) {
    this.logger.info('Gestion fichier dupliqué:', { fileId: existingFile.id });

    // Si le fichier existe déjà pour la même conversation/message, le retourner
    if (input.conversationId && existingFile.conversationId === input.conversationId) {
      return this.createSuccessResponse(existingFile, 'Fichier déjà présent dans la conversation');
    }

    // Sinon créer une nouvelle référence
    const newFileData = {
      ...existingFile.toObject(),
      id: uuidv4(),
      conversationId: input.conversationId,
      messageId: input.messageId,
      uploadedAt: new Date(),
      isDuplicate: true,
      originalFileId: existingFile.id
    };

    delete newFileData._id;
    
    const newFile = await this.fileRepository.create(newFileData);
    await this.publishEvents(newFile);

    return this.createSuccessResponse(newFile, 'Référence au fichier créée');
  }

  async acquireUploadLock(contentHash) {
    if (!this.cacheManager) {
      return null;
    }

    try {
      const lock = await this.cacheManager.acquireUploadLock(contentHash, 300); // 5 minutes
      
      if (!lock.acquired) {
        throw new BusinessException('Upload en cours pour ce fichier, veuillez patienter');
      }

      return lock.value;

    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      this.logger.warn('Impossible d\'acquérir le verrou:', { error: error.message });
      return null;
    }
  }

  async releaseUploadLock(contentHash, lockValue) {
    if (!this.cacheManager || !lockValue) {
      return;
    }

    try {
      await this.cacheManager.releaseUploadLock(contentHash, lockValue);
    } catch (error) {
      this.logger.warn('Erreur libération verrou:', { error: error.message });
    }
  }

  async uploadToStorage(file, user) {
    try {
      const uploadOptions = {
        userId: user.id,
        preserveOriginalName: true,
        generateThumbnail: this.shouldGenerateThumbnail(file.mimetype || file.mimeType),
        securityScan: true
      };

      return await this.storageService.uploadFile(file, uploadOptions);

    } catch (error) {
      this.logger.error('Erreur upload stockage:', { error: error.message });
      throw new BusinessException(`Erreur lors du stockage: ${error.message}`);
    }
  }

  shouldGenerateThumbnail(mimeType) {
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const videoTypes = ['video/mp4', 'video/avi', 'video/mov'];
    
    return imageTypes.includes(mimeType) || videoTypes.includes(mimeType);
  }

  async createFileEntity(input, uploadResult, contentHash) {
    const fileExtension = path.extname(input.file.originalname || input.file.originalName);
    const category = this.determineFileCategory(input.file.mimetype || input.file.mimeType);

    return {
      id: uuidv4(),
      originalName: input.file.originalname || input.file.originalName,
      fileName: uploadResult.fileName,
      mimeType: input.file.mimetype || input.file.mimeType,
      size: input.file.size,
      category,
      extension: fileExtension,
      
      // Stockage
      storageProvider: uploadResult.provider,
      storagePath: uploadResult.path,
      storageUrl: uploadResult.url,
      
      // Métadonnées
      metadata: {
        contentHash,
        uploadMethod: 'api',
        userAgent: input.userAgent,
        ipAddress: input.ipAddress,
        ...uploadResult.metadata
      },

      // Relations
      uploadedBy: input.user.id,
      conversationId: input.conversationId || null,
      messageId: input.messageId || null,
      
      // État
      status: 'active',
      processingStatus: 'pending',
      
      // Sécurité
      isPublic: false,
      security: {
        isScanned: false,
        isSafe: null,
        threats: []
      },

      // Versions (thumbnail, etc.)
      versions: uploadResult.versions || [],

      // Statistiques
      stats: {
        downloadCount: 0,
        viewCount: 0,
        shareCount: 0,
        lastAccessed: null
      },

      // Dates
      uploadedAt: new Date(),
      updatedAt: new Date(),
      expiresAt: this.calculateExpirationDate(category)
    };
  }

  determineFileCategory(mimeType) {
    const categories = {
      'image': ['image/'],
      'video': ['video/'],
      'audio': ['audio/'],
      'document': ['application/pdf', 'application/msword', 'application/vnd.openxmlformats'],
      'archive': ['application/zip', 'application/x-rar', 'application/x-7z'],
      'text': ['text/']
    };

    for (const [category, patterns] of Object.entries(categories)) {
      if (patterns.some(pattern => mimeType.startsWith(pattern))) {
        return category;
      }
    }

    return 'other';
  }

  calculateExpirationDate(category) {
    // Politique de rétention par défaut
    const retentionDays = {
      'image': 365,     // 1 an
      'video': 180,     // 6 mois
      'audio': 90,      // 3 mois
      'document': 730,  // 2 ans
      'archive': 30,    // 1 mois
      'text': 90,       // 3 mois
      'other': 30       // 1 mois
    };

    const days = retentionDays[category] || 30;
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + days);
    
    return expirationDate;
  }

  async updateCacheAndQuota(file, user) {
    try {
      // Cache des métadonnées
      if (this.cacheManager) {
        await this.cacheManager.cacheFileMetadata(file.id, {
          id: file.id,
          originalName: file.originalName,
          mimeType: file.mimeType,
          size: file.size,
          category: file.category,
          uploadedBy: file.uploadedBy,
          uploadedAt: file.uploadedAt
        });

        // Mise à jour du quota utilisateur
        await this.cacheManager.incrementUserStorage(user.id, file.size);
      }

    } catch (error) {
      this.logger.warn('Erreur mise à jour cache/quota:', { error: error.message });
      // Ne pas faire échouer l'upload pour ça
    }
  }

  async publishEvents(file) {
    try {
      await this.publishEvent(this.eventPublisher, 'file.uploaded', {
        fileId: file.id,
        fileName: file.originalName,
        size: file.size,
        mimeType: file.mimeType,
        uploadedBy: file.uploadedBy,
        conversationId: file.conversationId,
        messageId: file.messageId,
        uploadedAt: file.uploadedAt
      });

      if (file.conversationId) {
        await this.publishEvent(this.eventPublisher, 'conversation.file.added', {
          conversationId: file.conversationId,
          fileId: file.id,
          addedBy: file.uploadedBy
        });
      }

    } catch (error) {
      this.logger.warn('Erreur publication événements:', { error: error.message });
    }
  }

  async scheduleProcessing(file) {
    try {
      if (this.cacheManager && this.shouldProcess(file)) {
        await this.cacheManager.queueFileProcessing(file.id, file.category, this.getProcessingPriority(file));
        this.logger.info('Fichier ajouté à la queue de traitement:', { fileId: file.id, category: file.category });
      }

    } catch (error) {
      this.logger.warn('Erreur programmation traitement:', { error: error.message });
    }
  }

  shouldProcess(file) {
    const processableCategories = ['image', 'video', 'audio', 'document'];
    return processableCategories.includes(file.category);
  }

  getProcessingPriority(file) {
    // Priorité selon la taille et le type
    if (file.category === 'image' && file.size < 5 * 1024 * 1024) return 10; // Images < 5MB
    if (file.category === 'document') return 8;
    if (file.category === 'video') return 5;
    return 1; // Priorité basse par défaut
  }
}

module.exports = UploadFileUseCase;
