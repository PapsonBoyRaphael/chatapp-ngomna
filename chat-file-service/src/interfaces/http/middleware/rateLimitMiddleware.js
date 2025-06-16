const rateLimit = require('express-rate-limit');

// Rate limiters adaptés au contexte chat-file-service
const rateLimitMiddleware = {
  // Limite générale API - Basée sur IP puis userId après auth
  apiLimit: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requêtes par IP/user
    message: {
      success: false,
      message: 'Trop de requêtes, veuillez patienter',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Utiliser l'ID utilisateur après validation par authMiddleware
      return req.user?.id || req.ip;
    },
    skip: (req) => {
      // Skip pour les health checks et metrics
      return req.path.startsWith('/api/health') || req.path === '/metrics';
    }
  }),

  // Limite critique pour uploads de fichiers
  uploadLimit: rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20, // 20 uploads max par période
    message: {
      success: false,
      message: 'Trop d\'uploads, attendez avant de réessayer',
      code: 'UPLOAD_RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Limite pour téléchargements
  downloadLimit: rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 téléchargements
    message: {
      success: false,
      message: 'Trop de téléchargements simultanés',
      code: 'DOWNLOAD_RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Limite pour miniatures - Très sollicitées
  thumbnailLimit: rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 200, // Généreux car souvent utilisées
    message: {
      success: false,
      message: 'Trop de demandes de miniatures',
      code: 'THUMBNAIL_RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => req.ip // IP seulement car auth optionnelle
  }),

  // Health checks - Limité mais généreux pour monitoring
  healthLimit: rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    message: {
      success: false,
      message: 'Trop de health checks',
      code: 'HEALTH_RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => req.ip
  }),

  // Limite pour recherches
  searchLimit: rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30, // 30 recherches par minute
    message: {
      success: false,
      message: 'Trop de recherches, ralentissez',
      code: 'SEARCH_RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Limite pour créations (conversations, etc.)
  createLimit: rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // 10 créations max
    message: {
      success: false,
      message: 'Trop de créations, attendez un peu',
      code: 'CREATE_RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Limite spéciale pour réactions (messages)
  reactionLimit: rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60, // 60 réactions par minute
    message: {
      success: false,
      message: 'Trop de réactions, calmez-vous !',
      code: 'REACTION_RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Limite admin pour opérations sensibles
  adminLimit: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 actions admin
    message: {
      success: false,
      message: 'Trop d\'actions administratives',
      code: 'ADMIN_RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => req.user?.id || req.ip
  })
};

module.exports = rateLimitMiddleware;
