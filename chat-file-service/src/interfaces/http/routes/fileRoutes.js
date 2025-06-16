const express = require("express");
const multer = require("multer");
const path = require("path");

// Middleware
const authMiddleware = require("../middleware/authMiddleware");
const rateLimitMiddleware = require("../middleware/rateLimitMiddleware");
const validationMiddleware = require("../middleware/validationMiddleware");
const cacheMiddleware = require("../middleware/cacheMiddleware");

// Configuration Multer pour uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../../../../uploads/"));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Filtres de sécurité basiques
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (dangerousExtensions.includes(fileExtension)) {
      return cb(new Error('Type de fichier non autorisé'), false);
    }
    
    cb(null, true);
  }
});

function createFileRoutes(fileController) {
  const router = express.Router();

  /**
   * @api {post} /api/files/upload Upload un fichier
   * @apiName UploadFile
   * @apiGroup Files
   */
  router.post(
    "/upload",
    authMiddleware.authenticate,
    rateLimitMiddleware.uploadLimit,
    upload.single("file"),
    validationMiddleware.validateFileUpload,
    async (req, res) => {
      try {
        const { conversationId, messageContent = "" } = req.body;
        const userId = req.user.id;
        const file = req.file;

        if (!conversationId) {
          return res.status(400).json({
            success: false,
            message: "ID de conversation requis",
            code: "MISSING_CONVERSATION_ID"
          });
        }

        const result = await fileController.uploadFile({
          file,
          conversationId,
          uploadedBy: userId,
          messageContent
        });

        res.status(201).json(result);
      } catch (error) {
        console.error("❌ Erreur route upload:", error);
        res.status(500).json({
          success: false,
          message: "Erreur lors de l'upload",
          code: "UPLOAD_ROUTE_ERROR"
        });
      }
    }
  );

  /**
   * @api {get} /api/files/:fileId Télécharger un fichier
   * @apiName DownloadFile
   * @apiGroup Files
   */
  router.get(
    "/:fileId",
    authMiddleware.optionalAuth, // Auth optionnelle pour liens publics
    rateLimitMiddleware.downloadLimit,
    validationMiddleware.validateMongoId("fileId"),
    cacheMiddleware.checkFileCache,
    async (req, res) => {
      await fileController.downloadFile(req, res);
    }
  );

  /**
   * @api {get} /api/files/:fileId/info Informations du fichier
   * @apiName GetFileInfo
   * @apiGroup Files
   */
  router.get(
    "/:fileId/info",
    authMiddleware.authenticate,
    rateLimitMiddleware.apiLimit,
    validationMiddleware.validateMongoId("fileId"),
    cacheMiddleware.checkFileInfoCache,
    async (req, res) => {
      await fileController.getFileInfo(req, res);
    }
  );

  /**
   * @api {get} /api/files/:fileId/thumbnail Miniature du fichier
   * @apiName GetThumbnail
   * @apiGroup Files
   */
  router.get(
    "/:fileId/thumbnail",
    authMiddleware.optionalAuth,
    rateLimitMiddleware.thumbnailLimit,
    validationMiddleware.validateMongoId("fileId"),
    cacheMiddleware.checkThumbnailCache,
    async (req, res) => {
      await fileController.getThumbnail(req, res);
    }
  );

  /**
   * @api {get} /api/files/conversation/:conversationId Fichiers d'une conversation
   * @apiName GetConversationFiles
   * @apiGroup Files
   */
  router.get(
    "/conversation/:conversationId",
    authMiddleware.authenticate,
    rateLimitMiddleware.apiLimit,
    validationMiddleware.validateMongoId("conversationId"),
    validationMiddleware.validatePagination,
    cacheMiddleware.checkConversationFilesCache,
    async (req, res) => {
      try {
        const { conversationId } = req.params;
        const { page = 1, limit = 20, type, date_from, date_to } = req.query;
        const userId = req.user.id;

        req.query = {
          ...req.query,
          conversationId,
          userId,
          page: parseInt(page),
          limit: Math.min(50, parseInt(limit))
        };

        await fileController.getConversationFiles(req, res);
      } catch (error) {
        console.error("❌ Erreur route conversation files:", error);
        res.status(500).json({
          success: false,
          message: "Erreur lors de la récupération des fichiers",
          code: "GET_CONVERSATION_FILES_ROUTE_ERROR"
        });
      }
    }
  );

  /**
   * @api {delete} /api/files/:fileId Supprimer un fichier
   * @apiName DeleteFile
   * @apiGroup Files
   */
  router.delete(
    "/:fileId",
    authMiddleware.authenticate,
    rateLimitMiddleware.apiLimit,
    validationMiddleware.validateMongoId("fileId"),
    async (req, res) => {
      try {
        const { fileId } = req.params;
        const userId = req.user.id;

        const result = await fileController.deleteFile({
          fileId,
          userId
        });

        res.json(result);
      } catch (error) {
        console.error("❌ Erreur route delete file:", error);
        res.status(500).json({
          success: false,
          message: "Erreur lors de la suppression",
          code: "DELETE_FILE_ROUTE_ERROR"
        });
      }
    }
  );

  /**
   * @api {get} /api/files/search Rechercher des fichiers
   * @apiName SearchFiles
   * @apiGroup Files
   */
  router.get(
    "/search",
    authMiddleware.authenticate,
    rateLimitMiddleware.searchLimit,
    validationMiddleware.validateSearchQuery,
    validationMiddleware.validatePagination,
    async (req, res) => {
      try {
        const { q, type, size_min, size_max, date_from, date_to } = req.query;
        const userId = req.user.id;

        const result = await fileController.searchFiles({
          query: q,
          userId,
          filters: { type, size_min, size_max, date_from, date_to },
          pagination: req.query
        });

        res.json(result);
      } catch (error) {
        console.error("❌ Erreur route search files:", error);
        res.status(500).json({
          success: false,
          message: "Erreur lors de la recherche",
          code: "SEARCH_FILES_ROUTE_ERROR"
        });
      }
    }
  );

  return router;
}

module.exports = createFileRoutes;
