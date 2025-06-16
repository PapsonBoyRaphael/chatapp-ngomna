// Middleware de cache Redis pour optimiser les performances
const cacheMiddleware = {
  // Cache pour fichiers individuels
  checkFileCache: (req, res, next) => {
    const redisClient = req.app.locals.redisClient;
    
    if (!redisClient) {
      return next(); // Pas de Redis, continue sans cache
    }

    const fileId = req.params.fileId;
    if (!fileId) {
      return next();
    }

    const cacheKey = `file:${fileId}`;

    redisClient.get(cacheKey)
      .then(cached => {
        if (cached) {
          console.log(`📦 Cache hit fichier: ${fileId}`);
          const fileData = JSON.parse(cached);
          
          // Vérifier les permissions avant de servir depuis le cache
          const userId = req.user?.id;
          const hasAccess = fileData.isPublic || 
                           fileData.uploadedBy === userId ||
                           req.user?.roles?.includes('admin');

          if (hasAccess) {
            return res.json({
              success: true,
              data: {
                ...fileData,
                fromCache: true,
                cachedAt: fileData.cachedAt || new Date().toISOString()
              },
              metadata: {
                fromCache: true,
                timestamp: new Date().toISOString()
              }
            });
          }
        }
        next();
      })
      .catch(error => {
        console.warn('⚠️ Erreur cache fichier:', error.message);
        next();
      });
  },

  // Cache pour infos de fichier (métadonnées)
  checkFileInfoCache: (req, res, next) => {
    const redisClient = req.app.locals.redisClient;
    
    if (!redisClient) {
      return next();
    }

    const fileId = req.params.fileId;
    const cacheKey = `file:info:${fileId}`;

    redisClient.get(cacheKey)
      .then(cached => {
        if (cached) {
          console.log(`📦 Cache hit info fichier: ${fileId}`);
          const fileInfo = JSON.parse(cached);
          
          // Vérifier permissions
          const userId = req.user?.id;
          const hasAccess = fileInfo.isPublic || 
                           fileInfo.uploadedBy === userId ||
                           req.user?.roles?.includes('admin');

          if (hasAccess) {
            return res.json({
              success: true,
              data: fileInfo,
              fromCache: true,
              timestamp: new Date().toISOString()
            });
          }
        }
        next();
      })
      .catch(error => {
        console.warn('⚠️ Erreur cache info fichier:', error.message);
        next();
      });
  },

  // Cache pour miniatures
  checkThumbnailCache: (req, res, next) => {
    const redisClient = req.app.locals.redisClient;
    
    if (!redisClient) {
      return next();
    }

    const fileId = req.params.fileId;
    const cacheKey = `thumbnail:${fileId}`;

    redisClient.get(cacheKey)
      .then(cached => {
        if (cached) {
          console.log(`📦 Cache hit thumbnail: ${fileId}`);
          const thumbnailData = JSON.parse(cached);
          
          if (thumbnailData.buffer) {
            // Servir la miniature depuis le cache
            const buffer = Buffer.from(thumbnailData.buffer, 'base64');
            res.set({
              'Content-Type': thumbnailData.contentType || 'image/webp',
              'Content-Length': buffer.length,
              'Cache-Control': 'public, max-age=86400',
              'X-Cache': 'HIT'
            });
            return res.send(buffer);
          }
        }
        next();
      })
      .catch(error => {
        console.warn('⚠️ Erreur cache thumbnail:', error.message);
        next();
      });
  },

  // Cache pour fichiers de conversation
  checkConversationFilesCache: (req, res, next) => {
    const redisClient = req.app.locals.redisClient;
    
    if (!redisClient || !req.user?.id) {
      return next();
    }

    const conversationId = req.params.conversationId;
    const userId = req.user.id;
    const { page = 1, limit = 20, type } = req.query;
    
    const cacheKey = `conv:files:${conversationId}:${userId}:p${page}:l${limit}:t${type || 'all'}`;

    redisClient.get(cacheKey)
      .then(cached => {
        if (cached) {
          console.log(`📦 Cache hit fichiers conversation: ${conversationId}`);
          const filesData = JSON.parse(cached);
          return res.json({
            ...filesData,
            fromCache: true,
            timestamp: new Date().toISOString()
          });
        }
        next();
      })
      .catch(error => {
        console.warn('⚠️ Erreur cache fichiers conversation:', error.message);
        next();
      });
  },

  // Cache pour conversations
  checkConversationsCache: (req, res, next) => {
    const redisClient = req.app.locals.redisClient;
    
    if (!redisClient || !req.user?.id) {
      return next();
    }

    const userId = req.user.id;
    const { page = 1, limit = 20, archived = false } = req.query;
    const cacheKey = `conversations:${userId}:p${page}:l${limit}:arch${archived}`;

    redisClient.get(cacheKey)
      .then(cached => {
        if (cached) {
          console.log(`📦 Cache hit conversations: ${userId}`);
          const conversations = JSON.parse(cached);
          return res.json({
            success: true,
            data: conversations,
            fromCache: true,
            timestamp: new Date().toISOString()
          });
        }
        next();
      })
      .catch(error => {
        console.warn('⚠️ Erreur cache conversations:', error.message);
        next();
      });
  },

  // Cache pour conversation individuelle
  checkConversationCache: (req, res, next) => {
    const redisClient = req.app.locals.redisClient;
    
    if (!redisClient || !req.user?.id) {
      return next();
    }

    const conversationId = req.params.conversationId;
    const userId = req.user.id;
    const cacheKey = `conversation:${conversationId}:${userId}`;

    redisClient.get(cacheKey)
      .then(cached => {
        if (cached) {
          console.log(`📦 Cache hit conversation: ${conversationId}`);
          const conversation = JSON.parse(cached);
          return res.json({
            success: true,
            data: conversation,
            fromCache: true,
            timestamp: new Date().toISOString()
          });
        }
        next();
      })
      .catch(error => {
        console.warn('⚠️ Erreur cache conversation:', error.message);
        next();
      });
  },

  // Cache pour messages
  checkMessagesCache: (req, res, next) => {
    const redisClient = req.app.locals.redisClient;
    
    if (!redisClient || !req.user?.id) {
      return next();
    }

    const conversationId = req.params.conversationId;
    const userId = req.user.id;
    const { page = 1, limit = 50, before, after } = req.query;
    
    const cacheKey = `messages:${conversationId}:${userId}:p${page}:l${limit}:b${before || 'none'}:a${after || 'none'}`;

    redisClient.get(cacheKey)
      .then(cached => {
        if (cached) {
          console.log(`📦 Cache hit messages: ${conversationId}`);
          const messages = JSON.parse(cached);
          return res.json({
            success: true,
            data: messages,
            fromCache: true,
            timestamp: new Date().toISOString()
          });
        }
        next();
      })
      .catch(error => {
        console.warn('⚠️ Erreur cache messages:', error.message);
        next();
      });
  },

  // Cache pour message individuel
  checkMessageCache: (req, res, next) => {
    const redisClient = req.app.locals.redisClient;
    
    if (!redisClient || !req.user?.id) {
      return next();
    }

    const messageId = req.params.messageId;
    const userId = req.user.id;
    const cacheKey = `message:${messageId}:${userId}`;

    redisClient.get(cacheKey)
      .then(cached => {
        if (cached) {
          console.log(`📦 Cache hit message: ${messageId}`);
          const message = JSON.parse(cached);
          return res.json({
            success: true,
            data: message,
            fromCache: true,
            timestamp: new Date().toISOString()
          });
        }
        next();
      })
      .catch(error => {
        console.warn('⚠️ Erreur cache message:', error.message);
        next();
      });
  },

  // Cache pour statistiques
  checkStatsCache: (req, res, next) => {
    const redisClient = req.app.locals.redisClient;
    
    if (!redisClient || !req.user?.id) {
      return next();
    }

    const userId = req.user.id;
    const { period = '30d', conversationId } = req.query;
    const cacheKey = `stats:${userId}:${period}:conv${conversationId || 'all'}`;

    redisClient.get(cacheKey)
      .then(cached => {
        if (cached) {
          console.log(`📦 Cache hit stats: ${userId}`);
          const stats = JSON.parse(cached);
          return res.json({
            success: true,
            data: stats,
            fromCache: true,
            timestamp: new Date().toISOString()
          });
        }
        next();
      })
      .catch(error => {
        console.warn('⚠️ Erreur cache stats:', error.message);
        next();
      });
  }
};

module.exports = cacheMiddleware;
