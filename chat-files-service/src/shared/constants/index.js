/**
 * Constants Index - Chat Files Service
 * CENADI Chat-Files-Service
 * Constantes globales du service
 */

// Types de fichiers supportés
const FILE_TYPES = {
  IMAGE: {
    category: 'image',
    mimeTypes: [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/svg+xml'
    ],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'],
    maxSize: 10 * 1024 * 1024, // 10MB
    supportsThumbnails: true,
    supportsPreview: true
  },
  
  VIDEO: {
    category: 'video',
    mimeTypes: [
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/webm',
      'video/x-msvideo', // .avi
      'video/x-ms-wmv'   // .wmv
    ],
    extensions: ['.mp4', '.mpeg', '.mov', '.webm', '.avi', '.wmv'],
    maxSize: 100 * 1024 * 1024, // 100MB
    supportsThumbnails: true,
    supportsStreaming: true
  },
  
  AUDIO: {
    category: 'audio',
    mimeTypes: [
      'audio/mpeg',      // .mp3
      'audio/wav',
      'audio/ogg',
      'audio/mp4',       // .m4a
      'audio/webm',
      'audio/x-ms-wma'   // .wma
    ],
    extensions: ['.mp3', '.wav', '.ogg', '.m4a', '.webm', '.wma'],
    maxSize: 50 * 1024 * 1024, // 50MB
    supportsStreaming: true
  },
  
  DOCUMENT: {
    category: 'document',
    mimeTypes: [
      'application/pdf',
      'application/msword',                                                    // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.ms-excel',                                              // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',     // .xlsx
      'application/vnd.ms-powerpoint',                                         // .ppt
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'text/plain',
      'text/csv',
      'application/rtf'
    ],
    extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.rtf'],
    maxSize: 20 * 1024 * 1024, // 20MB
    supportsThumbnails: true, // Pour PDF
    supportsPreview: true
  },
  
  ARCHIVE: {
    category: 'archive',
    mimeTypes: [
      'application/zip',
      'application/x-rar-compressed',
      'application/x-tar',
      'application/gzip',
      'application/x-7z-compressed'
    ],
    extensions: ['.zip', '.rar', '.tar', '.gz', '.7z'],
    maxSize: 50 * 1024 * 1024, // 50MB
    requiresScan: true // Scan antivirus recommandé
  },
  
  TEXT: {
    category: 'text',
    mimeTypes: [
      'text/plain',
      'text/html',
      'text/css',
      'text/javascript',
      'text/json',
      'text/xml',
      'text/markdown'
    ],
    extensions: ['.txt', '.html', '.css', '.js', '.json', '.xml', '.md'],
    maxSize: 5 * 1024 * 1024, // 5MB
    supportsPreview: true
  }
};

// Événements WebSocket
const WEBSOCKET_EVENTS = {
  // Connexion
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  ERROR: 'error',
  
  // Upload
  UPLOAD_START: 'upload:start',
  UPLOAD_PROGRESS: 'upload:progress', 
  UPLOAD_COMPLETE: 'upload:complete',
  UPLOAD_ERROR: 'upload:error',
  UPLOAD_TYPING: 'upload:typing',
  
  // Download
  DOWNLOAD_START: 'download:start',
  DOWNLOAD_COMPLETE: 'download:complete',
  DOWNLOAD_ERROR: 'download:error',
  
  // Partage
  SHARE_CREATE: 'share:create',
  SHARE_ACCESS: 'share:access',
  SHARE_ERROR: 'share:error',
  
  // Chat
  CHAT_JOIN: 'chat:join',
  CHAT_LEAVE: 'chat:leave',
  CHAT_JOINED: 'chat:joined',
  CHAT_LEFT: 'chat:left',
  
  // Notifications
  FILE_UPLOADED: 'file:uploaded',
  FILE_DOWNLOADED: 'file:downloaded',
  FILE_SHARED: 'file:shared',
  FILE_DELETED: 'file:deleted',
  
  // Système
  PING: 'ping',
  PONG: 'pong',
  HEARTBEAT: 'heartbeat'
};

// Codes d'erreur
const ERROR_CODES = {
  // Authentification
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  
  // Autorisation
  FORBIDDEN: 'FORBIDDEN',
  ACCESS_DENIED: 'ACCESS_DENIED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED: 'MISSING_REQUIRED',
  
  // Fichiers
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TYPE_NOT_ALLOWED: 'FILE_TYPE_NOT_ALLOWED',
  FILE_UPLOAD_ERROR: 'FILE_UPLOAD_ERROR',
  FILE_DOWNLOAD_ERROR: 'FILE_DOWNLOAD_ERROR',
  
  // Partage
  SHARE_NOT_FOUND: 'SHARE_NOT_FOUND',
  SHARE_EXPIRED: 'SHARE_EXPIRED',
  SHARE_MAX_DOWNLOADS: 'SHARE_MAX_DOWNLOADS',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  
  // Service
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  
  // WebSocket
  WS_CONNECTION_LIMIT: 'WS_CONNECTION_LIMIT',
  WS_AUTH_FAILED: 'WS_AUTH_FAILED',
  WS_MESSAGE_TOO_LARGE: 'WS_MESSAGE_TOO_LARGE'
};

// Codes de statut HTTP
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  PARTIAL_CONTENT: 206,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

// Rôles utilisateur
const USER_ROLES = {
  AGENT: 'agent'  // Tous les agents publics ont le même rôle
};

// Types d'actions pour l'audit
const AUDIT_ACTIONS = {
  FILE_UPLOAD: 'file_upload',
  FILE_DOWNLOAD: 'file_download',
  FILE_VIEW: 'file_view',
  FILE_SHARE: 'file_share',
  FILE_DELETE: 'file_delete',
  FILE_UPDATE: 'file_update',
  SHARE_ACCESS: 'share_access',
  AUTH_LOGIN: 'auth_login',
  AUTH_LOGOUT: 'auth_logout'
};

// Tailles de thumbnails
const THUMBNAIL_SIZES = {
  SMALL: { width: 150, height: 150, suffix: '_small' },
  MEDIUM: { width: 300, height: 300, suffix: '_medium' },
  LARGE: { width: 800, height: 600, suffix: '_large' }
};

// Durées de cache
const CACHE_DURATIONS = {
  FILE_METADATA: 15 * 60, // 15 minutes
  THUMBNAILS: 60 * 60,    // 1 heure
  USER_PERMISSIONS: 5 * 60, // 5 minutes
  SHARE_TOKENS: 24 * 60 * 60, // 24 heures
  STATIC_ASSETS: 7 * 24 * 60 * 60 // 7 jours
};

// Limites par défaut
const DEFAULT_LIMITS = {
  FILES_PER_UPLOAD: 10,
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
  USER_STORAGE_QUOTA: 5 * 1024 * 1024 * 1024, // 5GB par agent
  SHARE_EXPIRY_DAYS: 7,
  MAX_DOWNLOADS_PER_SHARE: 100,
  API_RATE_LIMIT: 100, // Requêtes par 15 minutes
  UPLOAD_RATE_LIMIT: 10, // Uploads par minute
  DOWNLOAD_RATE_LIMIT: 30 // Downloads par minute
};

// Messages d'erreur
const ERROR_MESSAGES = {
  [ERROR_CODES.AUTH_REQUIRED]: 'Authentification requise',
  [ERROR_CODES.AUTH_INVALID]: 'Identifiants invalides',
  [ERROR_CODES.AUTH_EXPIRED]: 'Session expirée',
  [ERROR_CODES.FORBIDDEN]: 'Accès refusé',
  [ERROR_CODES.FILE_NOT_FOUND]: 'Fichier non trouvé',
  [ERROR_CODES.FILE_TOO_LARGE]: 'Fichier trop volumineux',
  [ERROR_CODES.FILE_TYPE_NOT_ALLOWED]: 'Type de fichier non autorisé',
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Limite de taux dépassée',
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 'Service temporairement indisponible'
};

// Configuration MIME types par catégorie
const MIME_TYPE_CATEGORIES = Object.fromEntries(
  Object.entries(FILE_TYPES).map(([key, config]) => [
    config.category,
    config.mimeTypes
  ])
);

// Extensions par catégorie
const EXTENSION_CATEGORIES = Object.fromEntries(
  Object.entries(FILE_TYPES).map(([key, config]) => [
    config.category,
    config.extensions
  ])
);

// Utilitaires pour les constantes
const UTILS = {
  // Obtenir la catégorie d'un MIME type
  getCategoryFromMimeType(mimeType) {
    for (const [category, types] of Object.entries(MIME_TYPE_CATEGORIES)) {
      if (types.some(type => {
        if (type.includes('*')) {
          return mimeType.startsWith(type.replace('*', ''));
        }
        return type === mimeType;
      })) {
        return category;
      }
    }
    return 'unknown';
  },
  
  // Obtenir la catégorie d'une extension
  getCategoryFromExtension(extension) {
    const ext = extension.toLowerCase();
    for (const [category, extensions] of Object.entries(EXTENSION_CATEGORIES)) {
      if (extensions.includes(ext)) {
        return category;
      }
    }
    return 'unknown';
  },
  
  // Vérifier si un type MIME est autorisé
  isMimeTypeAllowed(mimeType) {
    return this.getCategoryFromMimeType(mimeType) !== 'unknown';
  },
  
  // Obtenir la taille max pour un type
  getMaxSizeForMimeType(mimeType) {
    const category = this.getCategoryFromMimeType(mimeType);
    const fileType = Object.values(FILE_TYPES).find(type => type.category === category);
    return fileType ? fileType.maxSize : DEFAULT_LIMITS.MAX_FILE_SIZE;
  },
  
  // Vérifier si un type supporte les thumbnails
  supportsThumbnails(mimeType) {
    const category = this.getCategoryFromMimeType(mimeType);
    const fileType = Object.values(FILE_TYPES).find(type => type.category === category);
    return fileType ? fileType.supportsThumbnails : false;
  },
  
  // Vérifier si un type supporte le streaming
  supportsStreaming(mimeType) {
    const category = this.getCategoryFromMimeType(mimeType);
    const fileType = Object.values(FILE_TYPES).find(type => type.category === category);
    return fileType ? fileType.supportsStreaming : false;
  }
};

module.exports = {
  FILE_TYPES,
  WEBSOCKET_EVENTS,
  ERROR_CODES,
  HTTP_STATUS,
  USER_ROLES,
  AUDIT_ACTIONS,
  THUMBNAIL_SIZES,
  CACHE_DURATIONS,
  DEFAULT_LIMITS,
  ERROR_MESSAGES,
  MIME_TYPE_CATEGORIES,
  EXTENSION_CATEGORIES,
  UTILS
};
