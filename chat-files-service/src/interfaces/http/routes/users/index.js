/**
 * Users Routes - Chat Files Service
 * CENADI Chat-Files-Service
 * Routes pour la gestion des profils d'agents
 */

const express = require('express');
const { createLogger } = require('../../../../shared/utils/logger');

const logger = createLogger('UsersRoutes');

class UsersRoutes {
  static createRouter(middlewares) {
    const router = express.Router();
    const { auth, upload, validation, rateLimit } = middlewares;

    // Upload d'avatar agent
    router.post('/:userId/avatar',
      rateLimit.createLimiter({ name: 'avatar', requests: { perMinute: 3 } }),
      upload.avatar(),
      validation.validate('avatarUpload'),
      validation.validateFile(),
      async (req, res, next) => {
        try {
          // Vérifier que l'agent modifie son propre avatar
          if (req.params.userId !== req.user.id) {
            const error = new Error('Modification avatar autorisée pour son propre profil uniquement');
            error.statusCode = 403;
            error.code = 'AVATAR_ACCESS_DENIED';
            throw error;
          }

          logger.info('🖼️ Upload avatar agent:', {
            userId: req.user.id,
            userRole: req.user.role,
            fileSize: req.file?.size,
            requestId: req.requestId
          });

          // TODO: Implémenter l'upload d'avatar
          res.status(201).json({
            message: 'Avatar mis à jour avec succès',
            avatar: {
              fileId: req.file.filename,
              url: `/api/v1/users/${req.params.userId}/avatar`,
              thumbnailUrl: `/api/v1/users/${req.params.userId}/avatar?size=small`,
              updatedAt: new Date(),
              updatedBy: req.user.id
            }
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // Récupération d'avatar (visible par tous les agents)
    router.get('/:userId/avatar',
      rateLimit.downloadLimiter(),
      validation.custom(async (req) => {
        // Validation des paramètres de redimensionnement
        const { size, format } = req.query;
        const allowedSizes = ['small', 'medium', 'large', 'original'];
        const allowedFormats = ['jpg', 'png', 'webp', 'original'];

        if (size && !allowedSizes.includes(size)) {
          throw new Error(`Taille d'avatar invalide: ${size}`);
        }

        if (format && !allowedFormats.includes(format)) {
          throw new Error(`Format d'avatar invalide: ${format}`);
        }
      }),
      async (req, res, next) => {
        try {
          logger.debug('👤 Récupération avatar agent:', {
            targetUserId: req.params.userId,
            requestedBy: req.user.id,
            requestedByRole: req.user.role,
            size: req.query.size,
            format: req.query.format,
            requestId: req.requestId
          });

          // TODO: Implémenter la récupération d'avatar
          res.json({
            userId: req.params.userId,
            avatar: {
              url: `/api/v1/users/${req.params.userId}/avatar`,
              sizes: {
                small: `/api/v1/users/${req.params.userId}/avatar?size=small`,
                medium: `/api/v1/users/${req.params.userId}/avatar?size=medium`,
                large: `/api/v1/users/${req.params.userId}/avatar?size=large`
              },
              lastUpdated: new Date()
            }
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // Suppression d'avatar (son propre avatar uniquement)
    router.delete('/:userId/avatar',
      rateLimit.strictLimiter(),
      async (req, res, next) => {
        try {
          // Vérifier que l'agent supprime son propre avatar
          if (req.params.userId !== req.user.id) {
            const error = new Error('Suppression avatar autorisée pour son propre profil uniquement');
            error.statusCode = 403;
            error.code = 'AVATAR_DELETE_DENIED';
            throw error;
          }

          logger.info('🗑️ Suppression avatar agent:', {
            userId: req.user.id,
            userRole: req.user.role,
            requestId: req.requestId
          });

          // TODO: Implémenter la suppression d'avatar
          res.status(204).send();
        } catch (error) {
          next(error);
        }
      }
    );

    // Statistiques de stockage personnel
    router.get('/:userId/storage',
      rateLimit.createLimiter({ name: 'stats' }),
      async (req, res, next) => {
        try {
          // Vérifier que l'agent consulte ses propres stats
          if (req.params.userId !== req.user.id) {
            const error = new Error('Consultation stats autorisée pour son propre profil uniquement');
            error.statusCode = 403;
            error.code = 'STATS_ACCESS_DENIED';
            throw error;
          }

          logger.debug('📊 Consultation stats stockage agent:', {
            userId: req.user.id,
            userRole: req.user.role,
            requestId: req.requestId
          });

          // TODO: Implémenter les statistiques personnelles
          res.json({
            userId: req.params.userId,
            userRole: req.user.role,
            storage: {
              used: 0,              // Bytes utilisés
              quota: 5368709120,    // 5GB pour agents
              filesCount: 0,
              breakdown: {
                images: { count: 0, size: 0 },
                videos: { count: 0, size: 0 },
                documents: { count: 0, size: 0 },
                others: { count: 0, size: 0 }
              }
            },
            activity: {
              uploadsThisMonth: 0,
              downloadsThisMonth: 0,
              sharesThisMonth: 0
            },
            lastUpdated: new Date()
          });
        } catch (error) {
          next(error);
        }
      }
    );

    // Listing des fichiers personnels
    router.get('/:userId/files',
      rateLimit.createLimiter({ name: 'userFiles' }),
      validation.validate('listFiles'),
      async (req, res, next) => {
        try {
          // Vérifier que l'agent consulte ses propres fichiers
          if (req.params.userId !== req.user.id) {
            const error = new Error('Consultation fichiers autorisée pour son propre profil uniquement');
            error.statusCode = 403;
            error.code = 'FILES_ACCESS_DENIED';
            throw error;
          }

          logger.debug('📂 Listing fichiers personnels agent:', {
            userId: req.user.id,
            userRole: req.user.role,
            type: req.query.type,
            requestId: req.requestId
          });

          // TODO: Implémenter le listing des fichiers personnels
          res.json({
            userId: req.params.userId,
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
            }
          });
        } catch (error) {
          next(error);
        }
      }
    );

    logger.debug('✅ Routes utilisateurs configurées');
    return router;
  }
}

module.exports = UsersRoutes;
