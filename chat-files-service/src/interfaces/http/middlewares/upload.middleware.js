/**
 * Upload Middleware - Chat Files Service
 * CENADI Chat-Files-Service
 * Gestion optimisée des uploads pour messagerie instantanée
 */

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('UploadMiddleware');

class UploadMiddleware {
  constructor(options = {}) {
    this.options = {
      // Limites pour messagerie
      maxFileSize: options.maxFileSize || 100 * 1024 * 1024, // 100MB
      maxFiles: options.maxFiles || 10, // Max 10 fichiers simultanés
      
      // Types autorisés pour chat
      allowedMimeTypes: options.allowedMimeTypes || [
        // Images
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        // Vidéos
        'video/mp4', 'video/webm', 'video/mov', 'video/avi',
        // Audio
        'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a',
        // Documents
        'application/pdf', 'text/plain', 'application/json',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        // Archives
        'application/zip', 'application/x-zip-compressed'
      ],
      
      // Extensions bloquées (sécurité)
      blockedExtensions: options.blockedExtensions || [
        '.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.scf',
        '.vbs', '.js', '.jar', '.app', '.deb', '.pkg', '.dmg'
      ],
      
      // Configuration stockage temporaire
      tempPath: options.tempPath || './storage/temp/uploads',
      cleanupInterval: options.cleanupInterval || 60 * 60 * 1000, // 1h
      tempFileMaxAge: options.tempFileMaxAge || 24 * 60 * 60 * 1000, // 24h
      
      // Optimisations messagerie
      enablePreview: options.enablePreview !== false,
      enableCompression: options.enableCompression !== false,
      enableVirusScan: options.enableVirusScan || false,
      enableDuplicateDetection: options.enableDuplicateDetection || true,
      
      // Rate limiting par utilisateur
      maxUploadsPerMinute: options.maxUploadsPerMinute || 20,
      maxSizePerMinute: options.maxSizePerMinute || 500 * 1024 * 1024, // 500MB/min
      
      ...options
    };

    // Stockage en mémoire pour les petits fichiers, disque pour les gros
    this.storage = this.createSmartStorage();
    this.upload = this.createMulterInstance();
    
    this.uploadStats = new Map(); // Stats par utilisateur
    this.duplicateCache = new Map(); // Cache pour détection doublons
    
    // Nettoyage automatique
    this.startCleanupTimer();

    logger.info('📤 UploadMiddleware créé pour messagerie', {
      maxFileSize: `${Math.round(this.options.maxFileSize / 1024 / 1024)}MB`,
      maxFiles: this.options.maxFiles,
      allowedTypes: this.options.allowedMimeTypes.length,
      enablePreview: this.options.enablePreview
    });
  }

  // Middleware principal pour upload simple
  single(fieldName = 'file') {
    return (req, res, next) => {
      const singleUpload = this.upload.single(fieldName);
      
      singleUpload(req, res, async (err) => {
        if (err) {
          return this.handleUploadError(err, req, res, next);
        }

        if (!req.file) {
          return res.status(400).json({
            error: 'Aucun fichier fourni',
            code: 'NO_FILE',
            field: fieldName
          });
        }

        try {
          // Post-traitement du fichier
          await this.processUploadedFile(req, res);
          next();
        } catch (error) {
          return this.handleProcessingError(error, req, res, next);
        }
      });
    };
  }

  // Middleware pour uploads multiples (pour messagerie)
  multiple(fieldName = 'files', maxCount = null) {
    const finalMaxCount = maxCount || this.options.maxFiles;
    
    return (req, res, next) => {
      const multipleUpload = this.upload.array(fieldName, finalMaxCount);
      
      multipleUpload(req, res, async (err) => {
        if (err) {
          return this.handleUploadError(err, req, res, next);
        }

        if (!req.files || req.files.length === 0) {
          return res.status(400).json({
            error: 'Aucun fichier fourni',
            code: 'NO_FILES',
            field: fieldName
          });
        }

        try {
          // Post-traitement des fichiers
          await this.processUploadedFiles(req, res);
          next();
        } catch (error) {
          return this.handleProcessingError(error, req, res, next);
        }
      });
    };
  }

  // Middleware pour différents types de fichiers (avatar, chat, document)
  fields(fieldsConfig) {
    return (req, res, next) => {
      const fieldsUpload = this.upload.fields(fieldsConfig);
      
      fieldsUpload(req, res, async (err) => {
        if (err) {
          return this.handleUploadError(err, req, res, next);
        }

        try {
          // Post-traitement par type
          await this.processFieldsUpload(req, res, fieldsConfig);
          next();
        } catch (error) {
          return this.handleProcessingError(error, req, res, next);
        }
      });
    };
  }

  // Middleware spécialisé pour avatars
  avatar() {
    return this.createSpecializedUpload({
      fieldName: 'avatar',
      maxFileSize: 5 * 1024 * 1024, // 5MB pour avatars
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      requireSquare: true,
      generateThumbnail: true
    });
  }

  // Middleware spécialisé pour fichiers de chat
  chatFiles() {
    return this.createSpecializedUpload({
      fieldName: 'files',
      maxFiles: 5, // Max 5 fichiers par message
      enablePreview: true,
      enableCompression: true,
      chatContext: true
    });
  }

  // Création du stockage intelligent
  createSmartStorage() {
    return multer.diskStorage({
      destination: (req, file, cb) => {
        const userId = req.user?.id || 'anonymous';
        const uploadPath = path.join(this.options.tempPath, userId);
        
        // Créer le dossier si nécessaire
        this.ensureDirectoryExists(uploadPath).then(() => {
          cb(null, uploadPath);
        }).catch(cb);
      },
      
      filename: (req, file, cb) => {
        // Générer un nom unique
        const uniqueId = crypto.randomBytes(16).toString('hex');
        const timestamp = Date.now();
        const extension = path.extname(file.originalname);
        const filename = `${timestamp}_${uniqueId}${extension}`;
        
        cb(null, filename);
      }
    });
  }

  // Création de l'instance Multer
  createMulterInstance() {
    return multer({
      storage: this.storage,
      limits: {
        fileSize: this.options.maxFileSize,
        files: this.options.maxFiles,
        fields: 10,
        fieldNameSize: 100,
        fieldSize: 1024 * 1024 // 1MB pour les champs texte
      },
      fileFilter: (req, file, cb) => {
        this.validateFile(req, file, cb);
      }
    });
  }

  // Validation des fichiers
  async validateFile(req, file, cb) {
    try {
      const userId = req.user?.id;
      
      // Vérifier le rate limiting
      if (!await this.checkRateLimit(userId, file.size)) {
        return cb(new Error('RATE_LIMIT_EXCEEDED'));
      }

      // Vérifier le type MIME
      if (!this.options.allowedMimeTypes.includes(file.mimetype)) {
        return cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`));
      }

      // Vérifier l'extension
      const extension = path.extname(file.originalname).toLowerCase();
      if (this.options.blockedExtensions.includes(extension)) {
        return cb(new Error(`Extension bloquée: ${extension}`));
      }

      // Validation du nom de fichier
      if (!this.isValidFilename(file.originalname)) {
        return cb(new Error('Nom de fichier invalide'));
      }

      // Log de l'upload
      logger.debug('📤 Validation fichier réussie:', {
        userId,
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      });

      cb(null, true);

    } catch (error) {
      logger.error('❌ Erreur validation fichier:', {
        error: error.message,
        filename: file.originalname
      });
      cb(error);
    }
  }

  // Vérification du rate limiting
  async checkRateLimit(userId, fileSize) {
    if (!userId || userId === 'guest') return true;

    const now = Date.now();
    const windowStart = now - 60000; // 1 minute
    
    let userStats = this.uploadStats.get(userId) || {
      uploads: [],
      totalSize: 0
    };

    // Nettoyer les anciens uploads
    userStats.uploads = userStats.uploads.filter(upload => upload.timestamp > windowStart);
    userStats.totalSize = userStats.uploads.reduce((sum, upload) => sum + upload.size, 0);

    // Vérifier les limites
    if (userStats.uploads.length >= this.options.maxUploadsPerMinute) {
      logger.warn('⚠️ Rate limit upload atteint (nombre):', {
        userId,
        current: userStats.uploads.length,
        limit: this.options.maxUploadsPerMinute
      });
      return false;
    }

    if (userStats.totalSize + fileSize > this.options.maxSizePerMinute) {
      logger.warn('⚠️ Rate limit upload atteint (taille):', {
        userId,
        currentSize: userStats.totalSize,
        newSize: fileSize,
        limit: this.options.maxSizePerMinute
      });
      return false;
    }

    // Enregistrer l'upload
    userStats.uploads.push({
      timestamp: now,
      size: fileSize
    });
    userStats.totalSize += fileSize;
    
    this.uploadStats.set(userId, userStats);
    return true;
  }

  // Post-traitement d'un fichier unique
  async processUploadedFile(req, res) {
    const file = req.file;
    const userId = req.user?.id;

    try {
      // Enrichir les métadonnées
      file.uploadedBy = userId;
      file.uploadedAt = new Date();
      file.hash = await this.calculateFileHash(file.path);

      // Détection de doublons
      if (this.options.enableDuplicateDetection) {
        const duplicate = await this.checkDuplicate(file.hash, userId);
        if (duplicate) {
          file.isDuplicate = true;
          file.duplicateOf = duplicate;
        }
      }

      // Analyse du fichier
      file.analysis = await this.analyzeFile(file);

      // Génération de prévisualisation
      if (this.options.enablePreview && this.shouldGeneratePreview(file.mimetype)) {
        file.preview = await this.generatePreview(file);
      }

      logger.info('✅ Fichier traité:', {
        userId,
        filename: file.originalname,
        size: file.size,
        hash: file.hash,
        isDuplicate: file.isDuplicate || false
      });

    } catch (error) {
      logger.error('❌ Erreur traitement fichier:', {
        userId,
        filename: file.originalname,
        error: error.message
      });
      throw error;
    }
  }

  // Post-traitement de fichiers multiples
  async processUploadedFiles(req, res) {
    const files = req.files;
    const userId = req.user?.id;

    try {
      // Traiter en parallèle (limité)
      const processPromises = files.map(file => this.processUploadedFile({ file, user: req.user }, res));
      await Promise.all(processPromises);

      // Stats globales
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const duplicates = files.filter(file => file.isDuplicate).length;

      logger.info('✅ Batch fichiers traité:', {
        userId,
        count: files.length,
        totalSize,
        duplicates
      });

      // Ajouter les stats à la réponse
      req.uploadStats = {
        totalFiles: files.length,
        totalSize,
        duplicates,
        processedAt: new Date()
      };

    } catch (error) {
      logger.error('❌ Erreur traitement batch:', {
        userId,
        filesCount: files.length,
        error: error.message
      });
      throw error;
    }
  }

  // Création d'upload spécialisé
  createSpecializedUpload(config) {
    const specializedUpload = multer({
      storage: this.storage,
      limits: {
        fileSize: config.maxFileSize || this.options.maxFileSize,
        files: config.maxFiles || 1
      },
      fileFilter: (req, file, cb) => {
        // Validation spécialisée
        if (config.allowedMimeTypes && !config.allowedMimeTypes.includes(file.mimetype)) {
          return cb(new Error(`Type non autorisé pour ${config.fieldName}: ${file.mimetype}`));
        }
        
        this.validateFile(req, file, cb);
      }
    });

    return (req, res, next) => {
      const uploadMethod = config.maxFiles > 1 ? 'array' : 'single';
      const upload = specializedUpload[uploadMethod](config.fieldName, config.maxFiles);
      
      upload(req, res, async (err) => {
        if (err) {
          return this.handleUploadError(err, req, res, next);
        }

        try {
          // Traitement spécialisé
          await this.processSpecializedUpload(req, res, config);
          next();
        } catch (error) {
          return this.handleProcessingError(error, req, res, next);
        }
      });
    };
  }

  // Traitement spécialisé
  async processSpecializedUpload(req, res, config) {
    const files = req.files || [req.file];
    
    for (const file of files) {
      if (!file) continue;

      // Traitement selon le type
      if (config.requireSquare && file.mimetype.startsWith('image/')) {
        await this.validateSquareImage(file);
      }

      if (config.generateThumbnail) {
        file.thumbnail = await this.generateThumbnail(file);
      }

      if (config.chatContext) {
        file.chatMetadata = {
          chatId: req.body.chatId || req.params.chatId,
          messageId: req.body.messageId,
          isReply: !!req.body.replyTo
        };
      }
    }
  }

  // Utilitaires
  async calculateFileHash(filePath) {
    const fs = require('fs');
    const crypto = require('crypto');
    
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      
      stream.on('data', data => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async checkDuplicate(hash, userId) {
    // Vérifier dans le cache local
    const cacheKey = `${userId}:${hash}`;
    if (this.duplicateCache.has(cacheKey)) {
      return this.duplicateCache.get(cacheKey);
    }

    // Vérifier en base
    try {
      const FileMetadata = require('../../../domain/models/FileMetadata');
      const duplicate = await FileMetadata.findOne({
        'hash.sha256': hash,
        'chat.userId': userId
      });

      if (duplicate) {
        this.duplicateCache.set(cacheKey, duplicate.fileId);
        return duplicate.fileId;
      }
    } catch (error) {
      logger.warn('⚠️ Erreur vérification doublon:', { error: error.message });
    }

    return null;
  }

  async analyzeFile(file) {
    const analysis = {
      type: this.getFileCategory(file.mimetype),
      size: file.size,
      mimetype: file.mimetype,
      encoding: file.encoding
    };

    // Analyse spécifique selon le type
    if (file.mimetype.startsWith('image/')) {
      analysis.image = await this.analyzeImage(file);
    } else if (file.mimetype.startsWith('video/')) {
      analysis.video = await this.analyzeVideo(file);
    } else if (file.mimetype.startsWith('audio/')) {
      analysis.audio = await this.analyzeAudio(file);
    }

    return analysis;
  }

  getFileCategory(mimetype) {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.includes('pdf') || mimetype.includes('document')) return 'document';
    if (mimetype.includes('zip') || mimetype.includes('archive')) return 'archive';
    return 'other';
  }

  shouldGeneratePreview(mimetype) {
    return mimetype.startsWith('image/') || 
           mimetype.startsWith('video/') || 
           mimetype === 'application/pdf';
  }

  async generatePreview(file) {
    // Simulation - implémenter selon les besoins
    return {
      generated: true,
      type: file.mimetype.startsWith('image/') ? 'thumbnail' : 'preview',
      path: file.path + '_preview'
    };
  }

  isValidFilename(filename) {
    // Caractères dangereux
    const dangerousChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (dangerousChars.test(filename)) return false;

    // Longueur
    if (filename.length > 255) return false;

    // Noms réservés Windows
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    const nameWithoutExt = path.parse(filename).name;
    if (reservedNames.test(nameWithoutExt)) return false;

    return true;
  }

  async ensureDirectoryExists(dirPath) {
    const fs = require('fs').promises;
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  // Gestion des erreurs
  handleUploadError(err, req, res, next) {
    logger.error('❌ Erreur upload:', {
      error: err.message,
      code: err.code,
      userId: req.user?.id
    });

    let statusCode = 400;
    let errorCode = 'UPLOAD_ERROR';
    let message = 'Erreur d\'upload';

    if (err.code === 'LIMIT_FILE_SIZE') {
      message = `Fichier trop volumineux. Maximum: ${Math.round(this.options.maxFileSize / 1024 / 1024)}MB`;
      errorCode = 'FILE_TOO_LARGE';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = `Trop de fichiers. Maximum: ${this.options.maxFiles}`;
      errorCode = 'TOO_MANY_FILES';
    } else if (err.message === 'RATE_LIMIT_EXCEEDED') {
      statusCode = 429;
      message = 'Limite d\'upload atteinte. Veuillez patienter.';
      errorCode = 'RATE_LIMIT_EXCEEDED';
    } else if (err.message.includes('Type de fichier non autorisé')) {
      message = err.message;
      errorCode = 'INVALID_FILE_TYPE';
    }

    res.status(statusCode).json({
      error: message,
      code: errorCode,
      timestamp: new Date().toISOString()
    });
  }

  handleProcessingError(error, req, res, next) {
    logger.error('❌ Erreur traitement upload:', {
      error: error.message,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Erreur de traitement du fichier',
      code: 'PROCESSING_ERROR',
      timestamp: new Date().toISOString()
    });
  }

  // Nettoyage automatique
  startCleanupTimer() {
    setInterval(async () => {
      try {
        await this.cleanupTempFiles();
        await this.cleanupCaches();
      } catch (error) {
        logger.warn('⚠️ Erreur nettoyage upload:', { error: error.message });
      }
    }, this.options.cleanupInterval);

    logger.debug('⏰ Nettoyage automatique uploads démarré');
  }

  async cleanupTempFiles() {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const files = await fs.readdir(this.options.tempPath, { withFileTypes: true });
      const now = Date.now();
      
      for (const file of files) {
        if (file.isFile()) {
          const filePath = path.join(this.options.tempPath, file.name);
          const stats = await fs.stat(filePath);
          
          if (now - stats.mtime.getTime() > this.options.tempFileMaxAge) {
            await fs.unlink(filePath);
            logger.debug('🗑️ Fichier temp supprimé:', { file: file.name });
          }
        }
      }
    } catch (error) {
      logger.warn('⚠️ Erreur nettoyage fichiers temp:', { error: error.message });
    }
  }

  async cleanupCaches() {
    // Nettoyer les caches en mémoire
    if (this.duplicateCache.size > 1000) {
      this.duplicateCache.clear();
    }

    // Nettoyer les stats d'upload anciennes
    const now = Date.now();
    for (const [userId, stats] of this.uploadStats.entries()) {
      stats.uploads = stats.uploads.filter(upload => now - upload.timestamp < 60000);
      if (stats.uploads.length === 0) {
        this.uploadStats.delete(userId);
      }
    }
  }
}

module.exports = UploadMiddleware;
