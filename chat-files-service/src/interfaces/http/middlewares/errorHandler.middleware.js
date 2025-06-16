/**
 * Error Handler Middleware - Chat Files Service
 * CENADI Chat-Files-Service
 * Gestion centralisée des erreurs pour messagerie
 */

const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('ErrorHandler');

class ErrorHandlerMiddleware {
  constructor(options = {}) {
    this.options = {
      // Configuration
      includeStack: options.includeStack || process.env.NODE_ENV === 'development',
      includeDetails: options.includeDetails || process.env.NODE_ENV === 'development',
      logErrors: options.logErrors !== false,
      
      // Codes d'erreur spécifiques à la messagerie
      customErrorCodes: {
        FILE_NOT_FOUND: 404,
        FILE_TOO_LARGE: 413,
        INVALID_FILE_TYPE: 415,
        CHAT_ACCESS_DENIED: 403,
        UPLOAD_FAILED: 500,
        DOWNLOAD_FAILED: 500,
        STORAGE_ERROR: 503,
        VIRUS_DETECTED: 406,
        QUOTA_EXCEEDED: 507
      },
      
      // Messages d'erreur personnalisés
      errorMessages: {
        FILE_NOT_FOUND: 'Fichier non trouvé ou inaccessible',
        FILE_TOO_LARGE: 'Fichier trop volumineux',
        INVALID_FILE_TYPE: 'Type de fichier non autorisé',
        CHAT_ACCESS_DENIED: 'Accès au chat refusé',
        UPLOAD_FAILED: 'Échec de l\'upload du fichier',
        DOWNLOAD_FAILED: 'Échec du téléchargement',
        STORAGE_ERROR: 'Erreur de stockage temporaire',
        VIRUS_DETECTED: 'Fichier potentiellement dangereux détecté',
        QUOTA_EXCEEDED: 'Quota de stockage dépassé'
      },
      
      // Gestion des erreurs async
      handleAsyncErrors: options.handleAsyncErrors !== false,
      
      // Notification d'erreurs critiques
      notifyOnCritical: options.notifyOnCritical || false,
      notificationWebhook: options.notificationWebhook,
      
      ...options
    };

    this.errorStats = {
      total: 0,
      byCode: new Map(),
      byPath: new Map(),
      byUser: new Map()
    };

    logger.info('❌ ErrorHandlerMiddleware créé', {
      includeStack: this.options.includeStack,
      handleAsyncErrors: this.options.handleAsyncErrors
    });
  }

  // Middleware principal de gestion d'erreurs
  handle() {
    return (error, req, res, next) => {
      try {
        // Incrémenter les statistiques
        this.updateErrorStats(error, req);

        // Logger l'erreur
        if (this.options.logErrors) {
          this.logError(error, req);
        }

        // Déterminer le type d'erreur
        const errorInfo = this.analyzeError(error, req);

        // Notifier si critique
        if (errorInfo.isCritical && this.options.notifyOnCritical) {
          this.notifyCriticalError(error, req, errorInfo);
        }

        // Envoyer la réponse d'erreur
        this.sendErrorResponse(res, errorInfo, req);

      } catch (handlerError) {
        logger.error('❌ Erreur dans le gestionnaire d\'erreurs:', {
          originalError: error.message,
          handlerError: handlerError.message
        });

        // Fallback en cas d'erreur dans le gestionnaire
        res.status(500).json({
          error: 'Erreur interne du serveur',
          code: 'INTERNAL_SERVER_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    };
  }

  // Wrapper pour les erreurs async
  asyncHandler(fn) {
    if (!this.options.handleAsyncErrors) {
      return fn;
    }

    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  // Analyser l'erreur pour déterminer la réponse
  analyzeError(error, req) {
    const errorInfo = {
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Erreur interne du serveur',
      isCritical: false,
      details: null,
      stack: null
    };

    // Erreurs de validation (Joi)
    if (error.isJoi) {
      errorInfo.statusCode = 400;
      errorInfo.code = 'VALIDATION_ERROR';
      errorInfo.message = 'Données invalides';
      errorInfo.details = error.details?.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      return errorInfo;
    }

    // Erreurs MongoDB/Mongoose
    if (error.name === 'MongoError' || error.name === 'MongooseError') {
      return this.handleDatabaseError(error, errorInfo);
    }

    // Erreurs Multer (upload)
    if (error.code && error.code.startsWith('LIMIT_')) {
      return this.handleMulterError(error, errorInfo);
    }

    // Erreurs JWT
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return this.handleJWTError(error, errorInfo);
    }

    // Erreurs HTTP (axios, fetch)
    if (error.response && error.response.status) {
      return this.handleHTTPError(error, errorInfo);
    }

    // Erreurs système (fs, path, etc.)
    if (error.code && error.syscall) {
      return this.handleSystemError(error, errorInfo);
    }

    // Erreurs personnalisées
    if (error.code && this.options.customErrorCodes[error.code]) {
      errorInfo.statusCode = this.options.customErrorCodes[error.code];
      errorInfo.code = error.code;
      errorInfo.message = this.options.errorMessages[error.code] || error.message;
      return errorInfo;
    }

    // Erreurs avec code de statut personnalisé
    if (error.statusCode || error.status) {
      errorInfo.statusCode = error.statusCode || error.status;
      errorInfo.code = error.code || this.getCodeFromStatus(errorInfo.statusCode);
      errorInfo.message = error.message || errorInfo.message;
      return errorInfo;
    }

    // Erreurs critiques
    if (this.isCriticalError(error)) {
      errorInfo.isCritical = true;
      errorInfo.message = 'Erreur critique détectée';
    }

    // Inclure la stack si demandé
    if (this.options.includeStack) {
      errorInfo.stack = error.stack;
    }

    // Inclure les détails si demandé
    if (this.options.includeDetails && error.details) {
      errorInfo.details = error.details;
    }

    return errorInfo;
  }

  // Gestion des erreurs MongoDB
  handleDatabaseError(error, errorInfo) {
    errorInfo.code = 'DATABASE_ERROR';
    errorInfo.isCritical = true;

    switch (error.code) {
      case 11000: // Duplicate key
        errorInfo.statusCode = 409;
        errorInfo.code = 'DUPLICATE_ENTRY';
        errorInfo.message = 'Entrée dupliquée détectée';
        errorInfo.isCritical = false;
        break;
      
      case 121: // Document validation failed
        errorInfo.statusCode = 400;
        errorInfo.code = 'DOCUMENT_VALIDATION_FAILED';
        errorInfo.message = 'Validation du document échouée';
        errorInfo.isCritical = false;
        break;
      
      default:
        errorInfo.statusCode = 503;
        errorInfo.message = 'Service de base de données temporairement indisponible';
    }

    return errorInfo;
  }

  // Gestion des erreurs Multer
  handleMulterError(error, errorInfo) {
    errorInfo.isCritical = false;

    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        errorInfo.statusCode = 413;
        errorInfo.code = 'FILE_TOO_LARGE';
        errorInfo.message = 'Fichier trop volumineux';
        break;
      
      case 'LIMIT_FILE_COUNT':
        errorInfo.statusCode = 400;
        errorInfo.code = 'TOO_MANY_FILES';
        errorInfo.message = 'Trop de fichiers dans la requête';
        break;
      
      case 'LIMIT_FIELD_KEY':
        errorInfo.statusCode = 400;
        errorInfo.code = 'FIELD_NAME_TOO_LONG';
        errorInfo.message = 'Nom de champ trop long';
        break;
      
      case 'LIMIT_FIELD_VALUE':
        errorInfo.statusCode = 400;
        errorInfo.code = 'FIELD_VALUE_TOO_LONG';
        errorInfo.message = 'Valeur de champ trop longue';
        break;
      
      case 'LIMIT_FIELD_COUNT':
        errorInfo.statusCode = 400;
        errorInfo.code = 'TOO_MANY_FIELDS';
        errorInfo.message = 'Trop de champs dans la requête';
        break;
      
      case 'LIMIT_UNEXPECTED_FILE':
        errorInfo.statusCode = 400;
        errorInfo.code = 'UNEXPECTED_FILE';
        errorInfo.message = 'Fichier non attendu dans la requête';
        break;
      
      default:
        errorInfo.statusCode = 400;
        errorInfo.code = 'UPLOAD_ERROR';
        errorInfo.message = 'Erreur d\'upload';
    }

    return errorInfo;
  }

  // Gestion des erreurs JWT
  handleJWTError(error, errorInfo) {
    errorInfo.statusCode = 401;
    errorInfo.isCritical = false;

    switch (error.name) {
      case 'TokenExpiredError':
        errorInfo.code = 'TOKEN_EXPIRED';
        errorInfo.message = 'Token d\'authentification expiré';
        break;
      
      case 'JsonWebTokenError':
        errorInfo.code = 'TOKEN_INVALID';
        errorInfo.message = 'Token d\'authentification invalide';
        break;
      
      case 'NotBeforeError':
        errorInfo.code = 'TOKEN_NOT_ACTIVE';
        errorInfo.message = 'Token pas encore actif';
        break;
      
      default:
        errorInfo.code = 'AUTH_ERROR';
        errorInfo.message = 'Erreur d\'authentification';
    }

    return errorInfo;
  }

  // Gestion des erreurs HTTP
  handleHTTPError(error, errorInfo) {
    errorInfo.statusCode = error.response.status;
    errorInfo.code = `HTTP_${error.response.status}`;
    errorInfo.message = error.response.data?.message || error.message;
    errorInfo.isCritical = errorInfo.statusCode >= 500;
    
    return errorInfo;
  }

  // Gestion des erreurs système
  handleSystemError(error, errorInfo) {
    errorInfo.isCritical = true;

    switch (error.code) {
      case 'ENOENT':
        errorInfo.statusCode = 404;
        errorInfo.code = 'FILE_NOT_FOUND';
        errorInfo.message = 'Fichier ou dossier non trouvé';
        errorInfo.isCritical = false;
        break;
      
      case 'EACCES':
      case 'EPERM':
        errorInfo.statusCode = 403;
        errorInfo.code = 'ACCESS_DENIED';
        errorInfo.message = 'Accès refusé au système de fichiers';
        break;
      
      case 'ENOSPC':
        errorInfo.statusCode = 507;
        errorInfo.code = 'STORAGE_FULL';
        errorInfo.message = 'Espace de stockage insuffisant';
        break;
      
      case 'EMFILE':
      case 'ENFILE':
        errorInfo.statusCode = 503;
        errorInfo.code = 'TOO_MANY_FILES_OPEN';
        errorInfo.message = 'Trop de fichiers ouverts';
        break;
      
      case 'ECONNREFUSED':
        errorInfo.statusCode = 503;
        errorInfo.code = 'CONNECTION_REFUSED';
        errorInfo.message = 'Connexion refusée';
        break;
      
      case 'ETIMEDOUT':
        errorInfo.statusCode = 504;
        errorInfo.code = 'TIMEOUT';
        errorInfo.message = 'Timeout de la requête';
        break;
      
      default:
        errorInfo.statusCode = 500;
        errorInfo.code = 'SYSTEM_ERROR';
        errorInfo.message = 'Erreur système';
    }

    return errorInfo;
  }

  // Déterminer si l'erreur est critique
  isCriticalError(error) {
    const criticalPatterns = [
      /out of memory/i,
      /segmentation fault/i,
      /heap/i,
      /fatal/i,
      /cannot allocate/i
    ];

    return criticalPatterns.some(pattern => 
      pattern.test(error.message) || pattern.test(error.stack || '')
    );
  }

  // Obtenir le code depuis le statut HTTP
  getCodeFromStatus(status) {
    const statusCodes = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      405: 'METHOD_NOT_ALLOWED',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      415: 'UNSUPPORTED_MEDIA_TYPE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      501: 'NOT_IMPLEMENTED',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT',
      507: 'INSUFFICIENT_STORAGE'
    };

    return statusCodes[status] || 'UNKNOWN_ERROR';
  }

  // Logger l'erreur
  logError(error, req) {
    const logData = {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id,
      timestamp: new Date().toISOString()
    };

    if (error.statusCode >= 500 || this.isCriticalError(error)) {
      logger.error('❌ Erreur critique:', logData);
    } else if (error.statusCode >= 400) {
      logger.warn('⚠️ Erreur client:', logData);
    } else {
      logger.info('ℹ️ Erreur info:', logData);
    }
  }

  // Envoyer la réponse d'erreur
  sendErrorResponse(res, errorInfo, req) {
    const response = {
      error: errorInfo.message,
      code: errorInfo.code,
      timestamp: new Date().toISOString()
    };

    // Ajouter les détails si disponibles
    if (errorInfo.details) {
      response.details = errorInfo.details;
    }

    // Ajouter la stack en développement
    if (errorInfo.stack && this.options.includeStack) {
      response.stack = errorInfo.stack;
    }

    // Ajouter l'ID de requête pour traçabilité
    if (req.requestId) {
      response.requestId = req.requestId;
    }

    // Headers de sécurité
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');

    res.status(errorInfo.statusCode).json(response);
  }

  // Notification d'erreurs critiques
  async notifyCriticalError(error, req, errorInfo) {
    try {
      const notification = {
        service: 'chat-files-service',
        error: error.message,
        code: errorInfo.code,
        path: req.path,
        method: req.method,
        userId: req.user?.id,
        ip: req.ip,
        timestamp: new Date().toISOString(),
        stack: error.stack
      };

      if (this.options.notificationWebhook) {
        await this.sendWebhookNotification(notification);
      }

      logger.error('🚨 Erreur critique notifiée:', notification);

    } catch (notificationError) {
      logger.error('❌ Échec notification erreur critique:', {
        error: notificationError.message
      });
    }
  }

  // Envoyer notification webhook
  async sendWebhookNotification(notification) {
    const axios = require('axios');
    
    await axios.post(this.options.notificationWebhook, {
      text: `🚨 Erreur critique détectée dans chat-files-service`,
      attachments: [{
        color: 'danger',
        fields: [
          { title: 'Service', value: notification.service, short: true },
          { title: 'Code', value: notification.code, short: true },
          { title: 'Path', value: notification.path, short: true },
          { title: 'User ID', value: notification.userId || 'N/A', short: true },
          { title: 'Error', value: notification.error, short: false }
        ]
      }]
    }, {
      timeout: 5000
    });
  }

  // Mettre à jour les statistiques d'erreur
  updateErrorStats(error, req) {
    this.errorStats.total++;
    
    // Par code d'erreur
    const code = error.code || 'UNKNOWN';
    this.errorStats.byCode.set(code, (this.errorStats.byCode.get(code) || 0) + 1);
    
    // Par path
    this.errorStats.byPath.set(req.path, (this.errorStats.byPath.get(req.path) || 0) + 1);
    
    // Par utilisateur
    if (req.user?.id) {
      this.errorStats.byUser.set(req.user.id, (this.errorStats.byUser.get(req.user.id) || 0) + 1);
    }
  }

  // Middleware pour capturer les erreurs 404
  notFound() {
    return (req, res, next) => {
      const error = new Error(`Route non trouvée: ${req.method} ${req.path}`);
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      next(error);
    };
  }

  // Obtenir les statistiques d'erreur
  getErrorStats() {
    return {
      total: this.errorStats.total,
      byCode: Object.fromEntries(this.errorStats.byCode),
      byPath: Object.fromEntries(this.errorStats.byPath),
      topErrors: [...this.errorStats.byCode.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    };
  }

  // Réinitialiser les statistiques
  resetStats() {
    this.errorStats = {
      total: 0,
      byCode: new Map(),
      byPath: new Map(),
      byUser: new Map()
    };
  }
}

module.exports = ErrorHandlerMiddleware;
