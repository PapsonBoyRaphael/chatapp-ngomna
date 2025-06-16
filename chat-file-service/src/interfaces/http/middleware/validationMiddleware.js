const validator = require('validator');

const validationMiddleware = {
  // Validation upload de fichier - SÉCURITÉ CRITIQUE
  validateFileUpload: (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier fourni',
        code: 'NO_FILE_PROVIDED'
      });
    }

    const file = req.file;
    
    // Vérifications de sécurité
    const dangerousExtensions = [
      '.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.jar',
      '.vbs', '.js', '.jse', '.ws', '.wsf', '.wsc', '.ps1'
    ];
    
    const fileExtension = file.originalname.toLowerCase()
      .substring(file.originalname.lastIndexOf('.'));
    
    if (dangerousExtensions.includes(fileExtension)) {
      return res.status(400).json({
        success: false,
        message: 'Type de fichier dangereux non autorisé',
        code: 'DANGEROUS_FILE_TYPE',
        extension: fileExtension
      });
    }

    // Vérifier la taille (100MB max configuré dans multer)
    if (file.size > 100 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'Fichier trop volumineux (max 100MB)',
        code: 'FILE_TOO_LARGE',
        size: file.size
      });
    }

    // Vérifier le nom de fichier
    if (file.originalname.length > 255) {
      return res.status(400).json({
        success: false,
        message: 'Nom de fichier trop long (max 255 caractères)',
        code: 'FILENAME_TOO_LONG'
      });
    }

    next();
  },

  // Validation pagination avec limites
  validatePagination: (req, res, next) => {
    const { page = 1, limit = 20 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page doit être un nombre positif',
        code: 'INVALID_PAGE'
      });
    }
    
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: 'Limit doit être entre 1 et 100',
        code: 'INVALID_LIMIT'
      });
    }
    
    req.query.page = pageNum;
    req.query.limit = limitNum;
    
    next();
  },

  // Sanitisation des entrées utilisateur - SANS sanitize-html
  sanitizeInput: (req, res, next) => {
    // Nettoyer le contenu des messages
    if (req.body.content) {
      // Supprimer les balises HTML dangereuses
      let content = req.body.content
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Scripts
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // iframes
        .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '') // objects
        .replace(/<embed[^>]*>/gi, '') // embeds
        .replace(/<link[^>]*>/gi, '') // links
        .replace(/<meta[^>]*>/gi, '') // meta
        .replace(/javascript:/gi, '') // javascript: URLs
        .replace(/on\w+\s*=/gi, '') // événements (onclick, etc.)
        .replace(/<[^>]*>/g, '') // Toutes les autres balises HTML
        .trim();

      // Échapper les caractères dangereux
      req.body.content = validator.escape(content);
      
      // Limiter la longueur
      if (req.body.content.length > 10000) {
        return res.status(400).json({
          success: false,
          message: 'Contenu trop long (max 10000 caractères)',
          code: 'CONTENT_TOO_LONG'
        });
      }
    }
    
    // Nettoyer les noms
    if (req.body.name) {
      req.body.name = validator.escape(req.body.name.trim());
      if (req.body.name.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Nom trop long (max 100 caractères)',
          code: 'NAME_TOO_LONG'
        });
      }
    }
    
    // Nettoyer les descriptions
    if (req.body.description) {
      req.body.description = validator.escape(req.body.description.trim());
      if (req.body.description.length > 500) {
        return res.status(400).json({
          success: false,
          message: 'Description trop longue (max 500 caractères)',
          code: 'DESCRIPTION_TOO_LONG'
        });
      }
    }
    
    next();
  },

  // Validation recherche
  validateSearchQuery: (req, res, next) => {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Terme de recherche requis',
        code: 'MISSING_SEARCH_QUERY'
      });
    }
    
    const cleanQuery = q.trim();
    
    if (cleanQuery.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Terme de recherche trop court (min 2 caractères)',
        code: 'SEARCH_QUERY_TOO_SHORT'
      });
    }
    
    if (cleanQuery.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Terme de recherche trop long (max 200 caractères)',
        code: 'SEARCH_QUERY_TOO_LONG'
      });
    }
    
    // Nettoyer et sécuriser la requête
    req.query.q = validator.escape(cleanQuery);
    
    next();
  },

  // Validation accès utilisateur (permissions)
  validateUserAccess: (req, res, next) => {
    const { userId } = req.params;
    const requesterId = req.user?.id;
    
    if (!requesterId) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }
    
    // Vérifier que l'utilisateur accède à ses propres données
    // ou a les permissions admin
    if (userId !== requesterId && !req.user?.roles?.includes('admin')) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ces données',
        code: 'ACCESS_DENIED'
      });
    }
    
    next();
  },

  // Validation création de conversation
  validateConversationCreation: (req, res, next) => {
    const { participantId, type = 'PRIVATE', name } = req.body;
    
    if (!participantId) {
      return res.status(400).json({
        success: false,
        message: 'ID du participant requis',
        code: 'MISSING_PARTICIPANT_ID'
      });
    }
    
    // Vérifier que l'utilisateur ne crée pas une conversation avec lui-même
    if (participantId === req.user?.id) {
      return res.status(400).json({
        success: false,
        message: 'Impossible de créer une conversation avec soi-même',
        code: 'SELF_CONVERSATION'
      });
    }
    
    const allowedTypes = ['PRIVATE', 'GROUP'];
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type de conversation invalide',
        code: 'INVALID_CONVERSATION_TYPE',
        allowedTypes
      });
    }
    
    // Valider le nom pour les conversations de groupe
    if (type === 'GROUP') {
      if (!name || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Nom requis pour les conversations de groupe',
          code: 'MISSING_GROUP_NAME'
        });
      }
      
      if (name.trim().length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Nom de groupe trop long (max 50 caractères)',
          code: 'GROUP_NAME_TOO_LONG'
        });
      }
      
      req.body.name = validator.escape(name.trim());
    }
    
    next();
  },

  // Validation des IDs MongoDB
  validateMongoId: (paramName) => (req, res, next) => {
    const id = req.params[paramName];
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: `${paramName} requis`,
        code: 'MISSING_ID'
      });
    }
    
    // Validation basique format MongoDB ObjectId
    if (!/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        success: false,
        message: `${paramName} invalide`,
        code: 'INVALID_ID_FORMAT'
      });
    }
    
    next();
  },

  // Validation des dates
  validateDateRange: (req, res, next) => {
    const { date_from, date_to } = req.query;
    
    if (date_from) {
      const fromDate = new Date(date_from);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Date de début invalide',
          code: 'INVALID_FROM_DATE'
        });
      }
      req.query.date_from = fromDate.toISOString();
    }
    
    if (date_to) {
      const toDate = new Date(date_to);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Date de fin invalide',
          code: 'INVALID_TO_DATE'
        });
      }
      req.query.date_to = toDate.toISOString();
    }
    
    // Vérifier que date_from < date_to
    if (date_from && date_to) {
      const fromDate = new Date(date_from);
      const toDate = new Date(date_to);
      
      if (fromDate >= toDate) {
        return res.status(400).json({
          success: false,
          message: 'La date de début doit être antérieure à la date de fin',
          code: 'INVALID_DATE_RANGE'
        });
      }
    }
    
    next();
  }
};

module.exports = validationMiddleware;
