/**
 * Service de validation
 * CENADI Chat-Files-Service
 */

const Joi = require('joi');
const { createLogger } = require('../../shared/utils/logger');
const { ValidationException } = require('../../shared/exceptions/ValidationException');

const logger = createLogger('ValidationService');

class ValidationService {
  constructor() {
    this.customValidators = new Map();
    this.setupCustomValidators();
  }

  /**
   * Configurer les validateurs personnalisés
   */
  setupCustomValidators() {
    // Validateur pour ObjectId MongoDB
    this.customValidators.set('objectId', (value, helpers) => {
      if (!/^[0-9a-fA-F]{24}$/.test(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    });

    // Validateur pour les mots de passe forts
    this.customValidators.set('strongPassword', (value, helpers) => {
      const hasUpperCase = /[A-Z]/.test(value);
      const hasLowerCase = /[a-z]/.test(value);
      const hasNumbers = /\d/.test(value);
      const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);
      
      if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
        return helpers.error('password.weak');
      }
      
      return value;
    });

    // Validateur pour les noms de fichiers sécurisés
    this.customValidators.set('safeFilename', (value, helpers) => {
      const forbiddenChars = /[<>:"/\\|?*\x00-\x1f]/;
      if (forbiddenChars.test(value)) {
        return helpers.error('filename.unsafe');
      }
      return value;
    });
  }

  /**
   * Schémas de validation communs
   */
  get schemas() {
    return {
      // Identifiants
      objectId: Joi.string().custom(this.customValidators.get('objectId')).messages({
        'any.invalid': 'L\'ID doit être un ObjectId MongoDB valide'
      }),

      // Pagination
      pagination: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        sort: Joi.string().valid('asc', 'desc', 'newest', 'oldest').default('newest')
      }),

      // Recherche
      search: Joi.object({
        query: Joi.string().min(1).max(100).required(),
        type: Joi.string().valid('all', 'messages', 'files', 'conversations').default('all'),
        filters: Joi.object({
          dateFrom: Joi.date().iso(),
          dateTo: Joi.date().iso().greater(Joi.ref('dateFrom')),
          userId: Joi.string().custom(this.customValidators.get('objectId')),
          conversationId: Joi.string().custom(this.customValidators.get('objectId'))
        }).optional()
      }),

      // Message
      message: Joi.object({
        conversationId: Joi.string().custom(this.customValidators.get('objectId')).required(),
        content: Joi.string().min(1).max(5000).when('type', {
          is: 'file',
          then: Joi.optional(),
          otherwise: Joi.required()
        }),
        type: Joi.string().valid('text', 'file', 'image', 'video', 'audio', 'document').default('text'),
        fileId: Joi.string().custom(this.customValidators.get('objectId')).when('type', {
          is: 'file',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        replyTo: Joi.string().custom(this.customValidators.get('objectId')).optional(),
        metadata: Joi.object().optional()
      }),

      // Conversation
      conversation: Joi.object({
        name: Joi.string().min(1).max(100).when('type', {
          is: 'group',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        type: Joi.string().valid('private', 'group', 'channel').default('private'),
        description: Joi.string().max(500).optional(),
        participants: Joi.array().items(
          Joi.string().custom(this.customValidators.get('objectId'))
        ).min(1).required(),
        settings: Joi.object({
          isPublic: Joi.boolean().default(false),
          allowInvites: Joi.boolean().default(true),
          muteNotifications: Joi.boolean().default(false)
        }).optional()
      }),

      // Fichier
      file: Joi.object({
        filename: Joi.string().custom(this.customValidators.get('safeFilename')).max(255).required(),
        mimetype: Joi.string().required(),
        size: Joi.number().integer().min(1).max(100 * 1024 * 1024), // 100MB max
        description: Joi.string().max(200).optional(),
        isPublic: Joi.boolean().default(false),
        expiresAt: Joi.date().greater('now').optional()
      }),

      // Utilisateur (pour validation des données partielles)
      userProfile: Joi.object({
        name: Joi.string().min(2).max(50),
        email: Joi.string().email(),
        avatar: Joi.string().uri().optional(),
        status: Joi.string().valid('online', 'offline', 'away', 'busy').default('offline')
      })
    };
  }

  /**
   * Valider des données avec un schéma
   */
  async validate(data, schema, options = {}) {
    try {
      const defaultOptions = {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true,
        convert: true
      };

      const validationOptions = { ...defaultOptions, ...options };
      const { error, value } = schema.validate(data, validationOptions);

      if (error) {
        const messages = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value,
          type: detail.type
        }));

        throw new ValidationException('Données invalides', messages);
      }

      logger.debug('Validation réussie:', { 
        schema: schema.$_root.type || 'unknown',
        fieldsCount: Object.keys(value).length 
      });

      return value;

    } catch (error) {
      if (error instanceof ValidationException) {
        throw error;
      }

      logger.error('Erreur de validation inattendue:', { error: error.message });
      throw new ValidationException('Erreur de validation', [error.message]);
    }
  }

  /**
   * Valider un message
   */
  async validateMessage(messageData) {
    return this.validate(messageData, this.schemas.message);
  }

  /**
   * Valider une conversation
   */
  async validateConversation(conversationData) {
    return this.validate(conversationData, this.schemas.conversation);
  }

  /**
   * Valider des métadonnées de fichier
   */
  async validateFile(fileData) {
    return this.validate(fileData, this.schemas.file);
  }

  /**
   * Valider des paramètres de pagination
   */
  async validatePagination(paginationData) {
    return this.validate(paginationData, this.schemas.pagination);
  }

  /**
   * Valider des paramètres de recherche
   */
  async validateSearch(searchData) {
    return this.validate(searchData, this.schemas.search);
  }

  /**
   * Validation conditionnelle basée sur les rôles utilisateur
   */
  async validateWithRole(data, schema, userRole, roleSchemas = {}) {
    try {
      // Si un schéma spécifique au rôle existe, l'utiliser
      const roleSchema = roleSchemas[userRole];
      if (roleSchema) {
        return this.validate(data, roleSchema);
      }

      // Sinon utiliser le schéma par défaut
      return this.validate(data, schema);

    } catch (error) {
      logger.warn('Validation avec rôle échouée:', { 
        role: userRole, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Validation en lot
   */
  async validateBatch(items, schema) {
    const results = [];
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const validatedItem = await this.validate(items[i], schema);
        results.push({ index: i, data: validatedItem, success: true });
      } catch (error) {
        errors.push({ index: i, error: error.message, success: false });
      }
    }

    return {
      results,
      errors,
      successCount: results.length,
      errorCount: errors.length,
      totalCount: items.length
    };
  }

  /**
   * Sanitiser une chaîne de caractères
   */
  sanitizeString(str, options = {}) {
    if (typeof str !== 'string') return str;

    let sanitized = str;

    // Supprimer les caractères de contrôle
    if (options.removeControlChars !== false) {
      sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
    }

    // Supprimer les espaces en trop
    if (options.trimWhitespace !== false) {
      sanitized = sanitized.trim().replace(/\s+/g, ' ');
    }

    // Échapper les caractères HTML
    if (options.escapeHtml) {
      sanitized = sanitized
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    }

    // Limiter la longueur
    if (options.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength);
    }

    return sanitized;
  }

  /**
   * Valider et sanitiser simultanément
   */
  async validateAndSanitize(data, schema, sanitizeOptions = {}) {
    // D'abord valider
    const validatedData = await this.validate(data, schema);

    // Puis sanitiser les chaînes
    const sanitizedData = this.deepSanitizeObject(validatedData, sanitizeOptions);

    return sanitizedData;
  }

  /**
   * Sanitiser récursivement un objet
   */
  deepSanitizeObject(obj, options = {}) {
    if (typeof obj === 'string') {
      return this.sanitizeString(obj, options);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepSanitizeObject(item, options));
    }

    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.deepSanitizeObject(value, options);
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * Créer un schéma de validation personnalisé
   */
  createCustomSchema(baseSchema, customRules = {}) {
    let schema = baseSchema;

    // Ajouter des règles personnalisées
    Object.entries(customRules).forEach(([field, rules]) => {
      if (schema._ids && schema._ids._byKey.has(field)) {
        schema = schema.keys({
          [field]: schema.extract(field).concat(rules)
        });
      }
    });

    return schema;
  }
}

module.exports = ValidationService;
