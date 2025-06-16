/**
 * Mapper de Base
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('BaseMapper');

class BaseMapper {
  constructor() {
    this.logger = logger;
  }

  // Méthode principale pour mapper une entité vers un DTO
  toDto(entity, options = {}) {
    if (!entity) {
      return null;
    }

    if (Array.isArray(entity)) {
      return entity.map(item => this.toDto(item, options));
    }

    try {
      return this.mapToDto(entity, options);
    } catch (error) {
      this.logger.error('Erreur mapping vers DTO:', { 
        error: error.message,
        entityType: entity.constructor.name
      });
      throw error;
    }
  }

  // Méthode principale pour mapper un DTO vers une entité
  toEntity(dto, options = {}) {
    if (!dto) {
      return null;
    }

    if (Array.isArray(dto)) {
      return dto.map(item => this.toEntity(item, options));
    }

    try {
      return this.mapToEntity(dto, options);
    } catch (error) {
      this.logger.error('Erreur mapping vers entité:', { 
        error: error.message,
        dtoType: dto.constructor.name
      });
      throw error;
    }
  }

  // Méthodes à implémenter dans les sous-classes
  mapToDto(entity, options) {
    throw new Error('La méthode mapToDto() doit être implémentée');
  }

  mapToEntity(dto, options) {
    throw new Error('La méthode mapToEntity() doit être implémentée');
  }

  // Utilitaires de mapping

  // Copier seulement les champs définis
  copyDefinedFields(source, target, fields) {
    const result = target || {};
    
    fields.forEach(field => {
      if (source[field] !== undefined && source[field] !== null) {
        result[field] = source[field];
      }
    });

    return result;
  }

  // Mapper les champs avec transformation
  mapFields(source, fieldMappings) {
    const result = {};

    Object.entries(fieldMappings).forEach(([sourceField, config]) => {
      const value = this.getNestedValue(source, sourceField);
      
      if (value !== undefined && value !== null) {
        const targetField = typeof config === 'string' ? config : config.target;
        const transform = typeof config === 'object' ? config.transform : null;
        
        result[targetField] = transform ? transform(value) : value;
      }
    });

    return result;
  }

  // Récupérer une valeur imbriquée
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  // Définir une valeur imbriquée
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    
    const target = keys.reduce((current, key) => {
      if (!current[key]) {
        current[key] = {};
      }
      return current[key];
    }, obj);

    target[lastKey] = value;
  }

  // Filtrer les champs selon les permissions
  filterByPermissions(data, permissions, fieldPermissions) {
    if (!permissions || !fieldPermissions) {
      return data;
    }

    const filtered = { ...data };

    Object.entries(fieldPermissions).forEach(([field, requiredPermission]) => {
      if (!permissions[requiredPermission]) {
        delete filtered[field];
      }
    });

    return filtered;
  }

  // Mapper les dates
  mapDates(source, dateFields) {
    const result = {};

    dateFields.forEach(field => {
      const value = this.getNestedValue(source, field);
      if (value) {
        result[field] = value instanceof Date ? value.toISOString() : value;
      }
    });

    return result;
  }

  // Mapper les fichiers/URLs
  mapUrls(source, urlFields, baseUrl = '') {
    const result = {};

    urlFields.forEach(field => {
      const value = this.getNestedValue(source, field);
      if (value) {
        result[field] = value.startsWith('http') ? value : `${baseUrl}${value}`;
      }
    });

    return result;
  }

  // Sanitizer pour les données sensibles
  sanitize(data, sensitiveFields = []) {
    const sanitized = { ...data };

    sensitiveFields.forEach(field => {
      if (sanitized[field] !== undefined) {
        delete sanitized[field];
      }
    });

    return sanitized;
  }

  // Validation des DTOs
  validateDto(dto, requiredFields = []) {
    const missing = requiredFields.filter(field => {
      const value = this.getNestedValue(dto, field);
      return value === undefined || value === null || value === '';
    });

    if (missing.length > 0) {
      throw new Error(`Champs requis manquants: ${missing.join(', ')}`);
    }
  }

  // Mapper avec options de contexte
  mapWithContext(source, context = {}) {
    const { 
      includeMetadata = false,
      includeStats = false,
      includePermissions = false,
      includeRelated = false,
      user = null
    } = context;

    return {
      includeMetadata,
      includeStats,
      includePermissions,
      includeRelated,
      user,
      isOwner: user && source.uploadedBy === user.id,
      isAdmin: user && user.isAdmin
    };
  }

  // Paginer les résultats
  mapPagination(data, totalCount, pagination) {
    const { page, limit } = pagination;
    const totalPages = Math.ceil(totalCount / limit);

    return {
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        nextPage: page < totalPages ? page + 1 : null,
        previousPage: page > 1 ? page - 1 : null
      }
    };
  }

  // Formater les tailles de fichiers
  formatFileSize(bytes) {
    if (!bytes) return '0 B';

    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

  // Formater les durées
  formatDuration(seconds) {
    if (!seconds) return '00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Générer des URLs sécurisées
  generateSecureUrl(path, expiresIn = 3600) {
    if (!path) return null;

    // Logique de génération d'URL sécurisée
    const baseUrl = process.env.CDN_BASE_URL || process.env.BASE_URL;
    const timestamp = Date.now() + (expiresIn * 1000);
    
    return `${baseUrl}${path}?expires=${timestamp}`;
  }
}

module.exports = BaseMapper;
