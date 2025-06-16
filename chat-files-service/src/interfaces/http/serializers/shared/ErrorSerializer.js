/**
 * Error Serializer - Chat Files Service
 * CENADI Chat-Files-Service
 * Formatage des erreurs pour API
 */

class ErrorSerializer {
  // Erreur de validation
  static validation(errors, message = 'Données invalides') {
    return {
      success: false,
      error: {
        message,
        code: 'VALIDATION_ERROR',
        details: Array.isArray(errors) ? errors : [errors],
        timestamp: new Date().toISOString()
      }
    };
  }

  // Erreur d'authentification
  static auth(message = 'Authentification requise', code = 'AUTH_REQUIRED') {
    return {
      success: false,
      error: {
        message,
        code,
        timestamp: new Date().toISOString()
      }
    };
  }

  // Erreur d'autorisation
  static forbidden(message = 'Accès refusé', reason = null) {
    const error = {
      success: false,
      error: {
        message,
        code: 'FORBIDDEN',
        timestamp: new Date().toISOString()
      }
    };

    if (reason) {
      error.error.reason = reason;
    }

    return error;
  }

  // Erreur de fichier non trouvé
  static notFound(resource = 'Ressource', id = null) {
    return {
      success: false,
      error: {
        message: `${resource} non trouvé${id ? ` (${id})` : ''}`,
        code: 'NOT_FOUND',
        resource,
        id,
        timestamp: new Date().toISOString()
      }
    };
  }

  // Erreur de rate limiting
  static rateLimit(retryAfter = null) {
    const error = {
      success: false,
      error: {
        message: 'Trop de requêtes, veuillez patienter',
        code: 'RATE_LIMIT_EXCEEDED',
        timestamp: new Date().toISOString()
      }
    };

    if (retryAfter) {
      error.error.retryAfter = retryAfter;
    }

    return error;
  }

  // Erreur d'upload
  static upload(message, details = null) {
    const error = {
      success: false,
      error: {
        message,
        code: 'UPLOAD_ERROR',
        timestamp: new Date().toISOString()
      }
    };

    if (details) {
      error.error.details = details;
    }

    return error;
  }

  // Erreur de service externe
  static external(service, message = 'Service temporairement indisponible') {
    return {
      success: false,
      error: {
        message,
        code: 'EXTERNAL_SERVICE_ERROR',
        service,
        timestamp: new Date().toISOString()
      }
    };
  }

  // Erreur générique
  static generic(message = 'Erreur interne', code = 'INTERNAL_ERROR', details = null) {
    const error = {
      success: false,
      error: {
        message,
        code,
        timestamp: new Date().toISOString()
      }
    };

    if (details && process.env.NODE_ENV === 'development') {
      error.error.details = details;
    }

    return error;
  }
}

module.exports = ErrorSerializer;
