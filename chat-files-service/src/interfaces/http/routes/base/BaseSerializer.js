/**
 * Base Serializer - Chat Files Service
 * CENADI Chat-Files-Service
 * Classe de base pour tous les serializers
 */

const { createLogger } = require('../../../../shared/utils/logger');

const logger = createLogger('BaseSerializer');

class BaseSerializer {
  constructor(options = {}) {
    this.options = {
      // Configuration globale
      includeTimestamps: options.includeTimestamps !== false,
      includeMetadata: options.includeMetadata !== false,
      dateFormat: options.dateFormat || 'iso', // iso, timestamp, locale
      
      // Pagination
      defaultPageSize: options.defaultPageSize || 20,
      maxPageSize: options.maxPageSize || 100,
      
      // Sécurité
      hideSensitiveFields: options.hideSensitiveFields !== false,
      sanitizeHtml: options.sanitizeHtml !== false,
      
      // Performance
      enableCaching: options.enableCaching || false,
      cacheTimeout: options.cacheTimeout || 300, // 5 minutes
      
      ...options
    };

    this.cache = new Map();
    logger.debug('📦 BaseSerializer créé', { options: Object.keys(this.options) });
  }

  // Sérialiser un objet unique
  serialize(data, context = {}) {
    if (!data) return null;
    
    try {
      // Vérifier le cache si activé
      if (this.options.enableCaching && data.id) {
        const cacheKey = this.getCacheKey(data, context);
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.options.cacheTimeout * 1000) {
          return cached.data;
        }
      }

      const serialized = this.serializeObject(data, context);
      
      // Mettre en cache si activé
      if (this.options.enableCaching && data.id) {
        const cacheKey = this.getCacheKey(data, context);
        this.cache.set(cacheKey, {
          data: serialized,
          timestamp: Date.now()
        });
      }

      return serialized;

    } catch (error) {
      logger.error('❌ Erreur sérialisation:', {
        error: error.message,
        dataType: typeof data,
        hasId: !!data.id
      });
      
      // Fallback sécurisé
      return this.createErrorFallback(data, error);
    }
  }

  // Sérialiser un tableau
  serializeArray(dataArray, context = {}) {
    if (!Array.isArray(dataArray)) {
      return [];
    }

    return dataArray.map(item => this.serialize(item, context)).filter(Boolean);
  }

  // Sérialiser avec pagination
  serializePaginated(data, pagination = {}, context = {}) {
    const {
      items = [],
      total = 0,
      page = 1,
      limit = this.options.defaultPageSize,
      hasNext = false,
      hasPrev = false
    } = pagination;

    return {
      data: this.serializeArray(items, context),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        hasNext,
        hasPrev,
        offset: (page - 1) * limit
      },
      meta: this.createMetadata(context)
    };
  }

  // Méthode abstraite à implémenter dans les classes filles
  serializeObject(data, context = {}) {
    throw new Error('serializeObject doit être implémentée dans la classe fille');
  }

  // Formater les dates
  formatDate(date, format = null) {
    if (!date) return null;
    
    const dateObj = date instanceof Date ? date : new Date(date);
    const formatType = format || this.options.dateFormat;

    switch (formatType) {
      case 'timestamp':
        return dateObj.getTime();
      case 'locale':
        return dateObj.toLocaleString('fr-FR');
      case 'iso':
      default:
        return dateObj.toISOString();
    }
  }

  // Formater les tailles de fichier
  formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }

  // Formater les URL
  formatUrl(path, context = {}) {
    if (!path) return null;
    
    const baseUrl = context.baseUrl || process.env.API_BASE_URL || '';
    const version = context.version || 'v1';
    
    // Si c'est déjà une URL complète
    if (path.startsWith('http')) {
      return path;
    }
    
    // Si ça commence par /api
    if (path.startsWith('/api')) {
      return `${baseUrl}${path}`;
    }
    
    // Construire l'URL complète
    return `${baseUrl}/api/${version}${path.startsWith('/') ? path : '/' + path}`;
  }

  // Nettoyer les champs sensibles
  sanitizeObject(obj, sensitiveFields = []) {
    if (!this.options.hideSensitiveFields) {
      return obj;
    }

    const defaultSensitive = [
      'password', 'token', 'secret', 'key', 'hash',
      'salt', 'apiKey', 'privateKey', 'internalId'
    ];

    const fieldsToHide = [...defaultSensitive, ...sensitiveFields];
    const cleaned = { ...obj };

    for (const field of fieldsToHide) {
      if (cleaned[field] !== undefined) {
        delete cleaned[field];
      }
    }

    return cleaned;
  }

  // Nettoyer le HTML si activé
  sanitizeHtml(text) {
    if (!this.options.sanitizeHtml || typeof text !== 'string') {
      return text;
    }

    // Suppression basique des balises HTML
    return text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  }

  // Créer les métadonnées
  createMetadata(context = {}) {
    const metadata = {
      serializedAt: this.formatDate(new Date()),
      serializer: this.constructor.name
    };

    if (this.options.includeMetadata) {
      metadata.apiVersion = context.version || 'v1';
      metadata.requestId = context.requestId;
      
      if (context.user) {
        metadata.requestedBy = {
          userId: context.user.id,
          role: context.user.role
        };
      }
    }

    return metadata;
  }

  // Créer une réponse d'erreur
  createErrorResponse(error, context = {}) {
    return {
      error: {
        message: error.message || 'Erreur inconnue',
        code: error.code || 'UNKNOWN_ERROR',
        timestamp: this.formatDate(new Date())
      },
      meta: this.createMetadata(context)
    };
  }

  // Fallback en cas d'erreur de sérialisation
  createErrorFallback(originalData, error) {
    return {
      id: originalData.id || 'unknown',
      error: 'Erreur de sérialisation',
      code: 'SERIALIZATION_ERROR',
      timestamp: this.formatDate(new Date())
    };
  }

  // Créer une réponse de succès
  createSuccessResponse(data, message = null, context = {}) {
    const response = {
      success: true,
      data
    };

    if (message) {
      response.message = message;
    }

    if (this.options.includeMetadata) {
      response.meta = this.createMetadata(context);
    }

    return response;
  }

  // Générer clé de cache
  getCacheKey(data, context) {
    const keyParts = [
      this.constructor.name,
      data.id || data._id,
      context.user?.id || 'anonymous',
      JSON.stringify(context.fields || {})
    ];
    
    return keyParts.join(':');
  }

  // Nettoyer le cache
  clearCache(pattern = null) {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    for (const [key] of this.cache) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  // Obtenir les statistiques
  getStats() {
    return {
      cacheSize: this.cache.size,
      enableCaching: this.options.enableCaching,
      serializer: this.constructor.name
    };
  }

  // Validation des données avant sérialisation
  validateData(data) {
    if (data === null || data === undefined) {
      return false;
    }

    if (typeof data === 'object' && Object.keys(data).length === 0) {
      return false;
    }

    return true;
  }

  // Transformer les champs selon le contexte
  transformFields(obj, context = {}) {
    if (!context.fields || !Array.isArray(context.fields)) {
      return obj;
    }

    const result = {};
    
    for (const field of context.fields) {
      if (obj[field] !== undefined) {
        result[field] = obj[field];
      }
    }

    return Object.keys(result).length > 0 ? result : obj;
  }

  // Ajouter des liens HATEOAS
  addLinks(obj, links = {}, context = {}) {
    if (Object.keys(links).length === 0) {
      return obj;
    }

    return {
      ...obj,
      _links: Object.entries(links).reduce((acc, [rel, href]) => {
        acc[rel] = {
          href: this.formatUrl(href, context)
        };
        return acc;
      }, {})
    };
  }
}

module.exports = BaseSerializer;
