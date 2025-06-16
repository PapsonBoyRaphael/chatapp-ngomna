/**
 * Chats Routes - Chat Files Service
 * CENADI Chat-Files-Service
 * Routes pour la gestion des fichiers par chat
 */

const express = require('express');
const { createLogger } = require('../../../../shared/utils/logger');

const logger = createLogger('ChatsRoutes');

class ChatsRoutes {
  static createRouter(middlewares) {
    const router = express.Router();
    const { auth, validation, rateLimit } = middlewares;

    // Listing des fichiers d'un chat spécifique
    router.get('/:chatId/files',
      rateLimit.createLimiter({ name: 'chatFiles' }),
      validation.validate('listFiles'),
      auth.checkChatAccess(),
      async (req, res, next) => {
        try {
          logger.debug('📁 Listing fichiers chat:', {
            userId: req.user.id,
            userRole: req.user.role,
            chatId: req.params.chatId,
            type: req.query.type,
            requestId: req.requestId
          });

          // TODO: Implémenter le listing avec contrôle d'accès via visibility-service
          res.json({
            chatId: req.params.chatId,
            files: [],
            pagination: {
              total: 0,
              limit: req.query.limit || 20,
              offset: req.query.offset || 0
            },
            filters: {
              type: req.query.type,
              dateFrom: req.query.dateFrom,
              dateTo: req.query.dateTo
            },
            accessInfo: {
              canUpload: true,
              canDownload: true,
              role: req.user.role
            }
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // Statistiques de fichiers pour un chat
    router.get('/:chatId/files/stats',
      rateLimit.createLimiter({ name: 'chatStats' }),
      auth.checkChatAccess(),
      async (req, res, next) => {
        try {
          logger.debug('📊 Stats fichiers chat:', {
            userId: req.user.id,
            userRole: req.user.role,
            chatId: req.params.chatId,
            requestId: req.requestId
          });

          // TODO: Implémenter les statistiques de chat
          res.json({
            chatId: req.params.chatId,
            stats: {
              totalFiles: 0,
              totalSize: 0,
              breakdown: {
                images: { count: 0, size: 0 },
                videos: { count: 0, size: 0 },
                documents: { count: 0, size: 0 },
                audio: { count: 0, size: 0 },
                others: { count: 0, size: 0 }
              },
              timeline: {
                thisWeek: 0,
                thisMonth: 0,
                older: 0
              },
              topUploaders: []
            },
            requestedBy: {
              userId: req.user.id,
              role: req.user.role
            },
            generatedAt: new Date()
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // Upload de fichier dans un chat spécifique
    router.post('/:chatId/files',
      rateLimit.uploadLimiter(),
      auth.checkChatAccess({ requireWrite: true }),
      middlewares.upload.chatFiles(),
      validation.validate('fileUpload'),
      validation.validateFile(),
      async (req, res, next) => {
        try {
          // Ajouter le chatId depuis l'URL
          req.body.chatId = req.params.chatId;

          logger.info('📤 Upload fichier dans chat:', {
            userId: req.user.id,
            userRole: req.user.role,
            chatId: req.params.chatId,
            filesCount: req.files?.length || 0,
            requestId: req.requestId
          });

          // TODO: Implémenter l'upload avec association au chat
          res.status(201).json({
            message: 'Fichiers uploadés avec succès dans le chat',
            chatId: req.params.chatId,
            files: req.files?.map(file => ({
              fileId: file.filename,
              originalName: file.originalname,
              size: file.size,
              type: file.mimetype,
              chatId: req.params.chatId
            })),
            uploadedBy: {
              userId: req.user.id,
              role: req.user.role
            },
            uploadStats: req.uploadStats
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // Export des fichiers d'un chat (agents uniquement)
    router.post('/:chatId/files/export',
      rateLimit.strictLimiter(),
      auth.checkChatAccess(),
      validation.custom(async (req) => {
        const { format, includeMetadata, dateFrom, dateTo } = req.body;
        const allowedFormats = ['zip', 'json'];
        
        if (format && !allowedFormats.includes(format)) {
          throw new Error(`Format d'export invalide: ${format}`);
        }

        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          throw new Error('dateFrom doit être antérieure à dateTo');
        }
      }),
      async (req, res, next) => {
        try {
          logger.info('📦 Export fichiers chat:', {
            userId: req.user.id,
            userRole: req.user.role,
            chatId: req.params.chatId,
            format: req.body.format,
            includeMetadata: req.body.includeMetadata,
            requestId: req.requestId
          });

          // TODO: Implémenter l'export de fichiers
          res.status(202).json({
            message: 'Export démarré',
            chatId: req.params.chatId,
            exportId: req.requestId,
            status: 'pending',
            estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
            requestedBy: {
              userId: req.user.id,
              role: req.user.role
            },
            downloadUrl: null // Sera fourni une fois l'export terminé
          });
        } catch (error) {
          next(error);
        }
      }
    );

    logger.debug('✅ Routes chats configurées');
    return router;
  }
}

module.exports = ChatsRoutes;
