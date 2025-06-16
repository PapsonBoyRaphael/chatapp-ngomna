/**
 * Use Case de Base
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../shared/utils/logger');
const { ValidationException } = require('../../shared/exceptions/ValidationException');
const { BusinessException } = require('../../shared/exceptions/BusinessException');

const logger = createLogger('BaseUseCase');

class BaseUseCase {
  constructor() {
    this.logger = logger;
  }

  // Méthode principale à implémenter dans les sous-classes
  async execute(input) {
    throw new Error('La méthode execute() doit être implémentée');
  }

  // Validation des entrées
  validateInput(input, schema) {
    if (!input) {
      throw new ValidationException('Les données d\'entrée sont requises');
    }

    if (schema && typeof schema.validate === 'function') {
      const { error, value } = schema.validate(input);
      if (error) {
        throw new ValidationException(`Validation échouée: ${error.message}`);
      }
      return value;
    }

    return input;
  }

  // Validation des permissions
  validatePermissions(user, requiredPermissions = []) {
    if (!user) {
      throw new BusinessException('Utilisateur non authentifié', 'UNAUTHORIZED');
    }

    if (requiredPermissions.length === 0) {
      return true;
    }

    const userPermissions = user.permissions || [];
    const hasPermission = requiredPermissions.some(permission => 
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      throw new BusinessException('Permissions insuffisantes', 'FORBIDDEN');
    }

    return true;
  }

  // Validation des quotas
  async validateQuota(user, quotaService, additionalUsage = 0) {
    if (!quotaService) {
      return true;
    }

    const quotaStatus = await quotaService.checkUserQuota(user.id, additionalUsage);
    
    if (quotaStatus.wouldExceed) {
      throw new BusinessException(
        `Quota de stockage dépassé. Utilisé: ${quotaStatus.currentUsage}, Limite: ${quotaStatus.maxQuota}`,
        'QUOTA_EXCEEDED'
      );
    }

    return true;
  }

  // Logging standardisé
  logStart(useCaseName, input) {
    this.logger.info(`🚀 ${useCaseName} - Début`, {
      useCase: useCaseName,
      userId: input.userId || input.user?.id,
      input: this.sanitizeLogInput(input)
    });
  }

  logSuccess(useCaseName, result) {
    this.logger.info(`✅ ${useCaseName} - Succès`, {
      useCase: useCaseName,
      result: this.sanitizeLogOutput(result)
    });
  }

  logError(useCaseName, error, input) {
    this.logger.error(`❌ ${useCaseName} - Erreur`, {
      useCase: useCaseName,
      error: error.message,
      stack: error.stack,
      userId: input?.userId || input?.user?.id
    });
  }

  // Nettoyage des données sensibles pour les logs
  sanitizeLogInput(input) {
    const sanitized = { ...input };
    
    // Supprimer les données sensibles
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.file; // Éviter de logger le contenu des fichiers
    
    // Tronquer les champs longs
    if (sanitized.content && sanitized.content.length > 100) {
      sanitized.content = sanitized.content.substring(0, 100) + '...';
    }

    return sanitized;
  }

  sanitizeLogOutput(output) {
    if (!output) return output;
    
    const sanitized = { ...output };
    
    // Supprimer les données sensibles
    delete sanitized.password;
    delete sanitized.token;
    
    // Pour les fichiers, ne garder que les métadonnées importantes
    if (output.file) {
      sanitized.file = {
        id: output.file.id,
        name: output.file.originalName,
        size: output.file.size,
        mimeType: output.file.mimeType
      };
    }

    return sanitized;
  }

  // Gestion des erreurs avec retry
  async executeWithRetry(operation, maxRetries = 3, delayMs = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Ne pas retry pour certains types d'erreurs
        if (error instanceof ValidationException || 
            error instanceof BusinessException) {
          throw error;
        }

        if (attempt < maxRetries) {
          this.logger.warn(`Tentative ${attempt} échouée, retry dans ${delayMs}ms`, {
            error: error.message,
            attempt,
            maxRetries
          });
          
          await this.delay(delayMs * attempt); // Backoff exponentiel
        }
      }
    }

    throw lastError;
  }

  // Utilitaires
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Création de réponse standardisée
  createSuccessResponse(data, message = 'Opération réussie') {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    };
  }

  createErrorResponse(error, message = 'Erreur lors de l\'opération') {
    return {
      success: false,
      message,
      error: {
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message,
        details: error.details || null
      },
      timestamp: new Date().toISOString()
    };
  }

  // Pagination
  normalizePagination(pagination) {
    const page = Math.max(1, parseInt(pagination?.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(pagination?.limit) || 20));
    const offset = (page - 1) * limit;

    return {
      page,
      limit,
      offset
    };
  }

  createPaginatedResponse(data, totalCount, pagination) {
    const { page, limit } = pagination;
    const totalPages = Math.ceil(totalCount / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    };
  }

  // Validation des IDs
  validateId(id, fieldName = 'id') {
    if (!id) {
      throw new ValidationException(`${fieldName} est requis`);
    }

    // Validation ObjectId MongoDB ou UUID
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!objectIdRegex.test(id) && !uuidRegex.test(id)) {
      throw new ValidationException(`${fieldName} n'est pas un identifiant valide`);
    }

    return id;
  }

  // Validation des fichiers
  validateFileInput(file) {
    if (!file) {
      throw new ValidationException('Fichier requis');
    }

    if (!file.originalname && !file.originalName) {
      throw new ValidationException('Nom de fichier requis');
    }

    if (!file.size || file.size <= 0) {
      throw new ValidationException('Taille de fichier invalide');
    }

    if (!file.mimetype && !file.mimeType) {
      throw new ValidationException('Type de fichier requis');
    }

    return true;
  }

  // Conversion des erreurs
  handleRepositoryError(error, context = '') {
    this.logger.error(`Erreur repository ${context}:`, { error: error.message });

    if (error.name === 'ValidationError') {
      throw new ValidationException(`Erreur de validation: ${error.message}`);
    }

    if (error.name === 'CastError') {
      throw new ValidationException('Identifiant invalide');
    }

    if (error.code === 11000) {
      throw new BusinessException('Ressource déjà existante', 'DUPLICATE_RESOURCE');
    }

    throw new BusinessException(
      `Erreur technique: ${error.message}`, 
      'TECHNICAL_ERROR'
    );
  }

  // Métriques et monitoring
  startTimer() {
    return Date.now();
  }

  endTimer(startTime, operation) {
    const duration = Date.now() - startTime;
    this.logger.info(`⏱️ ${operation} - Durée: ${duration}ms`);
    return duration;
  }

  // Gestion des événements
  async publishEvent(eventPublisher, eventType, eventData) {
    if (!eventPublisher) {
      this.logger.warn('Event publisher non configuré');
      return;
    }

    try {
      await eventPublisher.publish(eventType, eventData);
      this.logger.debug(`📡 Événement publié: ${eventType}`);
    } catch (error) {
      this.logger.error('Erreur publication événement:', {
        eventType,
        error: error.message
      });
      // Ne pas faire échouer l'opération principale pour un événement
    }
  }
}

module.exports = BaseUseCase;
