/**
 * Exceptions Index - Chat Files Service
 * CENADI Chat-Files-Service
 * Classes d'exceptions personnalisées
 */

const { ERROR_CODES, HTTP_STATUS, ERROR_MESSAGES } = require('../constants');

/**
 * Classe de base pour toutes les exceptions du service
 */
class ServiceException extends Error {
  constructor(message, code = ERROR_CODES.INTERNAL_SERVER_ERROR, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Capturer la stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

/**
 * Exceptions d'authentification
 */
class AuthenticationException extends ServiceException {
  constructor(message = ERROR_MESSAGES[ERROR_CODES.AUTH_REQUIRED], details = null) {
    super(message, ERROR_CODES.AUTH_REQUIRED, HTTP_STATUS.UNAUTHORIZED, details);
  }
}

class InvalidCredentialsException extends ServiceException {
  constructor(message = ERROR_MESSAGES[ERROR_CODES.AUTH_INVALID], details = null) {
    super(message, ERROR_CODES.AUTH_INVALID, HTTP_STATUS.UNAUTHORIZED, details);
  }
}

class TokenExpiredException extends ServiceException {
  constructor(message = ERROR_MESSAGES[ERROR_CODES.AUTH_EXPIRED], details = null) {
    super(message, ERROR_CODES.AUTH_EXPIRED, HTTP_STATUS.UNAUTHORIZED, details);
  }
}

/**
 * Exceptions d'autorisation
 */
class AuthorizationException extends ServiceException {
  constructor(message = ERROR_MESSAGES[ERROR_CODES.FORBIDDEN], details = null) {
    super(message, ERROR_CODES.FORBIDDEN, HTTP_STATUS.FORBIDDEN, details);
  }
}

class AccessDeniedException extends ServiceException {
  constructor(message = 'Accès refusé à cette ressource', details = null) {
    super(message, ERROR_CODES.ACCESS_DENIED, HTTP_STATUS.FORBIDDEN, details);
  }
}

class InsufficientPermissionsException extends ServiceException {
  constructor(message = 'Permissions insuffisantes', details = null) {
    super(message, ERROR_CODES.INSUFFICIENT_PERMISSIONS, HTTP_STATUS.FORBIDDEN, details);
  }
}

/**
 * Exceptions de validation
 */
class ValidationException extends ServiceException {
  constructor(message = 'Données invalides', errors = [], details = null) {
    super(message, ERROR_CODES.VALIDATION_ERROR, HTTP_STATUS.BAD_REQUEST, details);
    this.errors = errors;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      errors: this.errors
    };
  }
}

class InvalidInputException extends ServiceException {
  constructor(field, value, message = null) {
    const defaultMessage = `Valeur invalide pour le champ '${field}': ${value}`;
    super(message || defaultMessage, ERROR_CODES.INVALID_INPUT, HTTP_STATUS.BAD_REQUEST, { field, value });
  }
}

class MissingRequiredFieldException extends ServiceException {
  constructor(field, message = null) {
    const defaultMessage = `Champ requis manquant: ${field}`;
    super(message || defaultMessage, ERROR_CODES.MISSING_REQUIRED, HTTP_STATUS.BAD_REQUEST, { field });
  }
}

/**
 * Exceptions de fichiers
 */
class FileNotFoundException extends ServiceException {
  constructor(fileId, message = null) {
    const defaultMessage = `Fichier non trouvé: ${fileId}`;
    super(message || defaultMessage, ERROR_CODES.FILE_NOT_FOUND, HTTP_STATUS.NOT_FOUND, { fileId });
  }
}

class FileTooLargeException extends ServiceException {
  constructor(size, maxSize, message = null) {
    const defaultMessage = `Fichier trop volumineux: ${size} bytes (max: ${maxSize} bytes)`;
    super(message || defaultMessage, ERROR_CODES.FILE_TOO_LARGE, HTTP_STATUS.PAYLOAD_TOO_LARGE, { size, maxSize });
  }
}

class FileTypeNotAllowedException extends ServiceException {
  constructor(mimeType, allowedTypes = [], message = null) {
    const defaultMessage = `Type de fichier non autorisé: ${mimeType}`;
    super(message || defaultMessage, ERROR_CODES.FILE_TYPE_NOT_ALLOWED, HTTP_STATUS.BAD_REQUEST, { mimeType, allowedTypes });
  }
}

class FileUploadException extends ServiceException {
  constructor(message = 'Erreur lors de l\'upload du fichier', details = null) {
    super(message, ERROR_CODES.FILE_UPLOAD_ERROR, HTTP_STATUS.BAD_REQUEST, details);
  }
}

class FileDownloadException extends ServiceException {
  constructor(message = 'Erreur lors du téléchargement du fichier', details = null) {
    super(message, ERROR_CODES.FILE_DOWNLOAD_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, details);
  }
}

/**
 * Exceptions de partage
 */
class ShareNotFoundException extends ServiceException {
  constructor(shareToken, message = null) {
    const defaultMessage = `Partage non trouvé: ${shareToken}`;
    super(message || defaultMessage, ERROR_CODES.SHARE_NOT_FOUND, HTTP_STATUS.NOT_FOUND, { shareToken });
  }
}

class ShareExpiredException extends ServiceException {
  constructor(shareToken, expiresAt, message = null) {
    const defaultMessage = `Partage expiré: ${shareToken}`;
    super(message || defaultMessage, ERROR_CODES.SHARE_EXPIRED, HTTP_STATUS.GONE, { shareToken, expiresAt });
  }
}

class ShareMaxDownloadsException extends ServiceException {
  constructor(shareToken, maxDownloads, message = null) {
    const defaultMessage = `Limite de téléchargements atteinte pour le partage: ${shareToken}`;
    super(message || defaultMessage, ERROR_CODES.SHARE_MAX_DOWNLOADS, HTTP_STATUS.FORBIDDEN, { shareToken, maxDownloads });
  }
}

/**
 * Exceptions de rate limiting
 */
class RateLimitException extends ServiceException {
  constructor(limit, windowMs, retryAfter = null, message = null) {
    const defaultMessage = `Limite de taux dépassée: ${limit} requêtes par ${windowMs}ms`;
    super(message || defaultMessage, ERROR_CODES.RATE_LIMIT_EXCEEDED, HTTP_STATUS.TOO_MANY_REQUESTS, { limit, windowMs, retryAfter });
  }
}

class TooManyRequestsException extends ServiceException {
  constructor(retryAfter = null, message = 'Trop de requêtes') {
    super(message, ERROR_CODES.TOO_MANY_REQUESTS, HTTP_STATUS.TOO_MANY_REQUESTS, { retryAfter });
  }
}

/**
 * Exceptions de service
 */
class ServiceUnavailableException extends ServiceException {
  constructor(service = 'Service', message = null) {
    const defaultMessage = `${service} temporairement indisponible`;
    super(message || defaultMessage, ERROR_CODES.SERVICE_UNAVAILABLE, HTTP_STATUS.SERVICE_UNAVAILABLE, { service });
  }
}

class ExternalServiceException extends ServiceException {
  constructor(service, error, message = null) {
    const defaultMessage = `Erreur du service externe ${service}: ${error}`;
    super(message || defaultMessage, ERROR_CODES.EXTERNAL_SERVICE_ERROR, HTTP_STATUS.BAD_GATEWAY, { service, error });
  }
}

class DatabaseException extends ServiceException {
  constructor(operation, error, message = null) {
    const defaultMessage = `Erreur de base de données lors de l'opération ${operation}`;
    super(message || defaultMessage, ERROR_CODES.DATABASE_ERROR, HTTP_STATUS.INTERNAL_SERVER_ERROR, { operation, error });
  }
}

/**
 * Exceptions WebSocket
 */
class WebSocketConnectionLimitException extends ServiceException {
  constructor(limit, current, message = null) {
    const defaultMessage = `Limite de connexions WebSocket atteinte: ${current}/${limit}`;
    super(message || defaultMessage, ERROR_CODES.WS_CONNECTION_LIMIT, HTTP_STATUS.SERVICE_UNAVAILABLE, { limit, current });
  }
}

class WebSocketAuthException extends ServiceException {
  constructor(message = 'Authentification WebSocket échouée') {
    super(message, ERROR_CODES.WS_AUTH_FAILED, HTTP_STATUS.UNAUTHORIZED);
  }
}

class WebSocketMessageTooLargeException extends ServiceException {
  constructor(size, maxSize, message = null) {
    const defaultMessage = `Message WebSocket trop volumineux: ${size} bytes (max: ${maxSize} bytes)`;
    super(message || defaultMessage, ERROR_CODES.WS_MESSAGE_TOO_LARGE, HTTP_STATUS.PAYLOAD_TOO_LARGE, { size, maxSize });
  }
}

/**
 * Factory pour créer des exceptions depuis des erreurs
 */
class ExceptionFactory {
  static fromError(error, defaultCode = ERROR_CODES.INTERNAL_SERVER_ERROR) {
    if (error instanceof ServiceException) {
      return error;
    }

    // Mapper les erreurs communes
    if (error.name === 'ValidationError') {
      return new ValidationException(error.message, error.errors);
    }

    if (error.name === 'CastError') {
      return new InvalidInputException(error.path, error.value, 'Format invalide');
    }

    if (error.name === 'MongoError' || error.name === 'MongooseError') {
      return new DatabaseException('database_operation', error.message);
    }

    if (error.code === 'ENOENT') {
      return new FileNotFoundException(error.path, 'Fichier non trouvé sur le système');
    }

    if (error.code === 'EACCES') {
      return new AccessDeniedException('Accès refusé au fichier système');
    }

    // Erreur générique
    return new ServiceException(
      error.message || 'Erreur interne du serveur',
      defaultCode,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      { originalError: error.name }
    );
  }

  static fromValidationErrors(errors) {
    const validationErrors = errors.map(err => ({
      field: err.field || err.path,
      message: err.message,
      value: err.value
    }));

    return new ValidationException(
      'Erreurs de validation',
      validationErrors
    );
  }
}

module.exports = {
  // Classe de base
  ServiceException,
  
  // Authentification
  AuthenticationException,
  InvalidCredentialsException,
  TokenExpiredException,
  
  // Autorisation
  AuthorizationException,
  AccessDeniedException,
  InsufficientPermissionsException,
  
  // Validation
  ValidationException,
  InvalidInputException,
  MissingRequiredFieldException,
  
  // Fichiers
  FileNotFoundException,
  FileTooLargeException,
  FileTypeNotAllowedException,
  FileUploadException,
  FileDownloadException,
  
  // Partage
  ShareNotFoundException,
  ShareExpiredException,
  ShareMaxDownloadsException,
  
  // Rate limiting
  RateLimitException,
  TooManyRequestsException,
  
  // Service
  ServiceUnavailableException,
  ExternalServiceException,
  DatabaseException,
  
  // WebSocket
  WebSocketConnectionLimitException,
  WebSocketAuthException,
  WebSocketMessageTooLargeException,
  
  // Factory
  ExceptionFactory
};
