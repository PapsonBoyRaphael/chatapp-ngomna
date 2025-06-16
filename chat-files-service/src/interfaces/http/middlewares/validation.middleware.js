/**
 * Validation Middleware - Chat Files Service
 * CENADI Chat-Files-Service
 * Validation des données et sécurisation des entrées
 */

const Joi = require('joi');
const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('ValidationMiddleware');

class ValidationMiddleware {
  constructor(options = {}) {
    this.options = {
      // Configuration globale
      allowUnknown: options.allowUnknown || false,
      stripUnknown: options.stripUnknown !== false,
      abortEarly: options.abortEarly || false,
      
      // Sécurité
      maxDepth: options.maxDepth || 10,
      maxItems: options.maxItems || 100,
      maxSize: options.maxSize || 1024 * 1024, // 1MB pour JSON
      
      // Messagerie spécifique
      maxFilenameLength: options.maxFilenameLength || 255,
      maxChatIdLength: options.maxChatIdLength || 50,
      maxMessageIdLength: options.maxMessageIdLength || 50,
      maxUsernameLength: options.maxUsernameLength || 30,
      
      // Formats autorisés
      allowedFileExtensions: options.allowedFileExtensions || [
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
        '.mp4', '.webm', '.mov', '.avi',
        '.mp3', '.wav', '.ogg', '.m4a',
        '.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx',
        '.zip', '.rar'
      ],
      
      ...options
    };

    // Schémas de validation prédéfinis
    this.schemas = this.createSchemas();

    logger.info('📋 ValidationMiddleware créé pour messagerie', {
      maxFilenameLength: this.options.maxFilenameLength,
      allowedExtensions: this.options.allowedFileExtensions.length,
      stripUnknown: this.options.stripUnknown
    });
  }

  // Créer les schémas de validation
  createSchemas() {
    return {
      // Upload de fichier
      fileUpload: {
        body: Joi.object({
          chatId: Joi.string()
            .max(this.options.maxChatIdLength)
            .pattern(/^[a-zA-Z0-9_-]+$/)
            .required()
            .messages({
              'string.pattern.base': 'ID de chat invalide - caractères alphanumériques uniquement',
              'any.required': 'ID de chat requis'
            }),
          
          messageId: Joi.string()
            .max(this.options.maxMessageIdLength)
            .pattern(/^[a-zA-Z0-9_-]+$/)
            .optional()
            .messages({
              'string.pattern.base': 'ID de message invalide'
            }),
          
          description: Joi.string()
            .max(500)
            .trim()
            .optional()
            .allow(''),
          
          isPrivate: Joi.boolean()
            .default(false),
          
          compressImages: Joi.boolean()
            .default(true),
          
          generateThumbnails: Joi.boolean()
            .default(true),
          
          tags: Joi.array()
            .items(Joi.string().max(20).trim())
            .max(5)
            .default([]),
          
          metadata: Joi.object()
            .unknown(true)
            .optional()
        }).required(),
        
        query: Joi.object({
          preview: Joi.boolean().default(false),
          compress: Joi.boolean().default(true)
        })
      },

      // Upload d'avatar
      avatarUpload: {
        body: Joi.object({
          userId: Joi.string()
            .pattern(/^[a-zA-Z0-9_-]+$/)
            .required(),
          
          cropData: Joi.object({
            x: Joi.number().min(0).required(),
            y: Joi.number().min(0).required(),
            width: Joi.number().min(1).max(2000).required(),
            height: Joi.number().min(1).max(2000).required()
          }).optional()
        })
      },

      // Récupération de fichier
      getFile: {
        params: Joi.object({
          fileId: Joi.string()
            .pattern(/^[a-zA-Z0-9_-]+$/)
            .required()
            .messages({
              'string.pattern.base': 'ID de fichier invalide'
            })
        }),
        
        query: Joi.object({
          download: Joi.boolean().default(false),
          thumbnail: Joi.boolean().default(false),
          size: Joi.string()
            .valid('small', 'medium', 'large', 'original')
            .default('original'),
          quality: Joi.number()
            .min(1)
            .max(100)
            .default(85),
          format: Joi.string()
            .valid('jpg', 'png', 'webp', 'original')
            .default('original')
        })
      },

      // Partage de fichier
      shareFile: {
        params: Joi.object({
          fileId: Joi.string()
            .pattern(/^[a-zA-Z0-9_-]+$/)
            .required()
        }),
        
        body: Joi.object({
          expiresIn: Joi.string()
            .valid('1h', '1d', '7d', '30d', 'never')
            .default('7d'),
          
          maxDownloads: Joi.number()
            .min(1)
            .max(1000)
            .default(100),
          
          requireAuth: Joi.boolean()
            .default(false),
          
          allowedUsers: Joi.array()
            .items(Joi.string().pattern(/^[a-zA-Z0-9_-]+$/))
            .max(50)
            .default([]),
          
          customMessage: Joi.string()
            .max(200)
            .trim()
            .optional()
        })
      },

      // Listing de fichiers
      listFiles: {
        query: Joi.object({
          chatId: Joi.string()
            .pattern(/^[a-zA-Z0-9_-]+$/)
            .optional(),
          
          userId: Joi.string()
            .pattern(/^[a-zA-Z0-9_-]+$/)
            .optional(),
          
          type: Joi.string()
            .valid('image', 'video', 'audio', 'document', 'archive', 'all')
            .default('all'),
          
          limit: Joi.number()
            .min(1)
            .max(100)
            .default(20),
          
          offset: Joi.number()
            .min(0)
            .default(0),
          
          sortBy: Joi.string()
            .valid('created', 'size', 'name', 'type')
            .default('created'),
          
          sortOrder: Joi.string()
            .valid('asc', 'desc')
            .default('desc'),
          
          dateFrom: Joi.date()
            .iso()
            .optional(),
          
          dateTo: Joi.date()
            .iso()
            .min(Joi.ref('dateFrom'))
            .optional(),
          
          search: Joi.string()
            .max(100)
            .trim()
            .optional(),
          
          includeMetadata: Joi.boolean()
            .default(false)
        })
      },

      // Suppression de fichier
      deleteFile: {
        params: Joi.object({
          fileId: Joi.string()
            .pattern(/^[a-zA-Z0-9_-]+$/)
            .required()
        }),
        
        body: Joi.object({
          reason: Joi.string()
            .max(200)
            .trim()
            .optional(),
          
          deleteBackups: Joi.boolean()
            .default(false)
        }).optional()
      },

      // Mise à jour métadonnées
      updateMetadata: {
        params: Joi.object({
          fileId: Joi.string()
            .pattern(/^[a-zA-Z0-9_-]+$/)
            .required()
        }),
        
        body: Joi.object({
          description: Joi.string()
            .max(500)
            .trim()
            .optional(),
          
          tags: Joi.array()
            .items(Joi.string().max(20).trim())
            .max(5)
            .optional(),
          
          isPrivate: Joi.boolean()
            .optional(),
          
          customMetadata: Joi.object()
            .unknown(true)
            .optional()
        }).min(1)
      }
    };
  }

  // Middleware de validation générique
  validate(schemaName, options = {}) {
    return async (req, res, next) => {
      try {
        const schema = this.schemas[schemaName];
        if (!schema) {
          throw new Error(`Schéma de validation '${schemaName}' non trouvé`);
        }

        const validationOptions = {
          ...this.options,
          ...options
        };

        // Valider chaque partie de la requête
        const results = {};
        
        if (schema.params && req.params) {
          results.params = await this.validateData(req.params, schema.params, validationOptions);
        }
        
        if (schema.query && req.query) {
          results.query = await this.validateData(req.query, schema.query, validationOptions);
        }
        
        if (schema.body && req.body) {
          results.body = await this.validateData(req.body, schema.body, validationOptions);
        }
        
        if (schema.headers && req.headers) {
          results.headers = await this.validateData(req.headers, schema.headers, validationOptions);
        }

        // Remplacer les données par les versions validées
        if (results.params) req.params = results.params;
        if (results.query) req.query = results.query;
        if (results.body) req.body = results.body;
        if (results.headers) req.headers = { ...req.headers, ...results.headers };

        logger.debug('✅ Validation réussie:', {
          schema: schemaName,
          userId: req.user?.id,
          path: req.path
        });

        next();

      } catch (error) {
        return this.handleValidationError(error, req, res, next);
      }
    };
  }

  // Validation de fichier uploadé
  validateFile() {
    return async (req, res, next) => {
      try {
        const files = req.files || (req.file ? [req.file] : []);
        
        if (files.length === 0) {
          return next(); // Pas de fichier à valider
        }

        for (const file of files) {
          await this.validateSingleFile(file, req);
        }

        logger.debug('✅ Validation fichiers réussie:', {
          count: files.length,
          userId: req.user?.id
        });

        next();

      } catch (error) {
        return this.handleValidationError(error, req, res, next);
      }
    };
  }

  // Validation d'un fichier unique
  async validateSingleFile(file, req) {
    // Validation du nom de fichier
    if (!this.isValidFilename(file.originalname)) {
      throw new Error('Nom de fichier invalide - caractères non autorisés détectés');
    }

    if (file.originalname.length > this.options.maxFilenameLength) {
      throw new Error(`Nom de fichier trop long - maximum ${this.options.maxFilenameLength} caractères`);
    }

    // Validation de l'extension
    const extension = this.getFileExtension(file.originalname);
    if (!this.options.allowedFileExtensions.includes(extension)) {
      throw new Error(`Extension de fichier non autorisée: ${extension}`);
    }

    // Validation du type MIME vs extension
    if (!this.isMimeTypeConsistent(file.mimetype, extension)) {
      throw new Error('Type de fichier incohérent avec l\'extension');
    }

    // Validation de la taille (déjà gérée par multer, mais double vérification)
    if (file.size === 0) {
      throw new Error('Fichier vide');
    }

    // Validation spécifique par type
    await this.validateFileByType(file);

    // Validation de sécurité
    await this.securityValidation(file);
  }

  // Validation par type de fichier
  async validateFileByType(file) {
    const type = this.getFileType(file.mimetype);
    
    switch (type) {
      case 'image':
        await this.validateImage(file);
        break;
      case 'video':
        await this.validateVideo(file);
        break;
      case 'audio':
        await this.validateAudio(file);
        break;
      case 'document':
        await this.validateDocument(file);
        break;
      case 'archive':
        await this.validateArchive(file);
        break;
    }
  }

  // Validation d'image
  async validateImage(file) {
    // Limite de taille pour images (20MB)
    if (file.size > 20 * 1024 * 1024) {
      throw new Error('Image trop volumineuse - maximum 20MB');
    }

    // Vérification des dimensions via magic bytes (optionnel)
    // Cette validation nécessiterait sharp ou similar
    // const metadata = await sharp(file.buffer).metadata();
    // if (metadata.width > 8000 || metadata.height > 8000) {
    //   throw new Error('Dimensions d\'image trop importantes');
    // }
  }

  // Validation de vidéo
  async validateVideo(file) {
    // Limite de taille pour vidéos (100MB)
    if (file.size > 100 * 1024 * 1024) {
      throw new Error('Vidéo trop volumineuse - maximum 100MB');
    }

    // Types MIME autorisés pour vidéo
    const allowedVideoTypes = [
      'video/mp4', 'video/webm', 'video/mov', 'video/avi'
    ];
    
    if (!allowedVideoTypes.includes(file.mimetype)) {
      throw new Error(`Type de vidéo non supporté: ${file.mimetype}`);
    }
  }

  // Validation d'audio
  async validateAudio(file) {
    // Limite de taille pour audio (50MB)
    if (file.size > 50 * 1024 * 1024) {
      throw new Error('Fichier audio trop volumineux - maximum 50MB');
    }
  }

  // Validation de document
  async validateDocument(file) {
    // Limite de taille pour documents (25MB)
    if (file.size > 25 * 1024 * 1024) {
      throw new Error('Document trop volumineux - maximum 25MB');
    }
  }

  // Validation d'archive
  async validateArchive(file) {
    // Limite de taille pour archives (200MB)
    if (file.size > 200 * 1024 * 1024) {
      throw new Error('Archive trop volumineuse - maximum 200MB');
    }
  }

  // Validation de sécurité
  async securityValidation(file) {
    // Vérifier les magic bytes pour détecter les faux types
    const magicBytes = await this.readMagicBytes(file);
    if (!this.validateMagicBytes(magicBytes, file.mimetype)) {
      throw new Error('Type de fichier réel ne correspond pas au type déclaré');
    }

    // Scanner pour contenu malveillant basique
    await this.basicMalwareCheck(file);
  }

  // Lire les magic bytes
  async readMagicBytes(file) {
    if (file.buffer) {
      return file.buffer.slice(0, 8);
    }
    
    // Si fichier sur disque, lire les premiers bytes
    const fs = require('fs').promises;
    const handle = await fs.open(file.path, 'r');
    const buffer = Buffer.alloc(8);
    await handle.read(buffer, 0, 8, 0);
    await handle.close();
    return buffer;
  }

  // Valider les magic bytes
  validateMagicBytes(magicBytes, mimetype) {
    const magicSignatures = {
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'image/gif': [0x47, 0x49, 0x46, 0x38],
      'application/pdf': [0x25, 0x50, 0x44, 0x46],
      'application/zip': [0x50, 0x4B, 0x03, 0x04]
    };

    const signature = magicSignatures[mimetype];
    if (!signature) return true; // Pas de signature connue, on accepte

    for (let i = 0; i < signature.length; i++) {
      if (magicBytes[i] !== signature[i]) {
        return false;
      }
    }

    return true;
  }

  // Vérification basique de malware
  async basicMalwareCheck(file) {
    // Patterns suspects dans les noms de fichiers
    const suspiciousPatterns = [
      /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.scr$/i,
      /\.vbs$/i, /\.js$/i, /\.jar$/i, /\.app$/i
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(file.originalname)) {
        throw new Error('Type de fichier potentiellement dangereux détecté');
      }
    }

    // Vérifier les doubles extensions
    if (/\.[^.]+\.[^.]+$/i.test(file.originalname)) {
      throw new Error('Double extension détectée - potentiellement malveillant');
    }
  }

  // Validation personnalisée
  custom(validationFunction) {
    return async (req, res, next) => {
      try {
        await validationFunction(req);
        next();
      } catch (error) {
        return this.handleValidationError(error, req, res, next);
      }
    };
  }

  // Validation de données avec Joi
  async validateData(data, schema, options) {
    const { error, value } = schema.validate(data, options);
    
    if (error) {
      throw error;
    }
    
    return value;
  }

  // Utilitaires
  isValidFilename(filename) {
    // Caractères interdits
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (invalidChars.test(filename)) return false;

    // Noms réservés Windows
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
    if (reservedNames.test(filename)) return false;

    // Vérifier les caractères de contrôle
    if (/[\x00-\x1f\x7f-\x9f]/.test(filename)) return false;

    return true;
  }

  getFileExtension(filename) {
    return filename.toLowerCase().match(/\.[^.]*$/)?.[0] || '';
  }

  getFileType(mimetype) {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.includes('pdf') || mimetype.includes('document')) return 'document';
    if (mimetype.includes('zip') || mimetype.includes('archive')) return 'archive';
    return 'other';
  }

  isMimeTypeConsistent(mimetype, extension) {
    const consistencyMap = {
      '.jpg': ['image/jpeg'],
      '.jpeg': ['image/jpeg'],
      '.png': ['image/png'],
      '.gif': ['image/gif'],
      '.webp': ['image/webp'],
      '.mp4': ['video/mp4'],
      '.webm': ['video/webm'],
      '.mov': ['video/quicktime'],
      '.mp3': ['audio/mpeg'],
      '.wav': ['audio/wav'],
      '.pdf': ['application/pdf'],
      '.zip': ['application/zip', 'application/x-zip-compressed']
    };

    const allowedMimeTypes = consistencyMap[extension];
    return !allowedMimeTypes || allowedMimeTypes.includes(mimetype);
  }

  // Gestion des erreurs de validation
  handleValidationError(error, req, res, next) {
    logger.warn('⚠️ Erreur de validation:', {
      error: error.message,
      userId: req.user?.id,
      path: req.path,
      method: req.method
    });

    // Erreur Joi
    if (error.isJoi) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(400).json({
        error: 'Données invalides',
        code: 'VALIDATION_ERROR',
        details,
        timestamp: new Date().toISOString()
      });
    }

    // Erreur de fichier
    return res.status(400).json({
      error: error.message,
      code: 'FILE_VALIDATION_ERROR',
      timestamp: new Date().toISOString()
    });
  }

  // Créer un schéma personnalisé
  createCustomSchema(schemaDefinition) {
    return {
      params: schemaDefinition.params ? Joi.object(schemaDefinition.params) : undefined,
      query: schemaDefinition.query ? Joi.object(schemaDefinition.query) : undefined,
      body: schemaDefinition.body ? Joi.object(schemaDefinition.body) : undefined,
      headers: schemaDefinition.headers ? Joi.object(schemaDefinition.headers) : undefined
    };
  }

  // Ajouter un schéma personnalisé
  addSchema(name, schemaDefinition) {
    this.schemas[name] = this.createCustomSchema(schemaDefinition);
    logger.debug('📋 Schéma personnalisé ajouté:', { name });
  }

  // Obtenir les statistiques de validation
  getStats() {
    return {
      schemas: Object.keys(this.schemas).length,
      maxFilenameLength: this.options.maxFilenameLength,
      allowedExtensions: this.options.allowedFileExtensions.length,
      stripUnknown: this.options.stripUnknown
    };
  }
}

module.exports = ValidationMiddleware;
