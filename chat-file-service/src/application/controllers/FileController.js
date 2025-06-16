const multer = require("multer");
const path = require("path");
const fs = require("fs-extra");

class FileController {
  constructor(
    uploadFileUseCase,
    getFileUseCase,
    redisClient = null,
    kafkaProducer = null
  ) {
    this.uploadFileUseCase = uploadFileUseCase;
    this.getFileUseCase = getFileUseCase;
    this.redisClient = redisClient;
    this.kafkaProducer = kafkaProducer;
  }

  async uploadFile(req, res) {
    const startTime = Date.now();

    try {
      // Validation des paramètres
      const { uploadedBy, conversationId, receiverId } = req.body;

      if (!uploadedBy) {
        return res.status(400).json({
          success: false,
          message: "uploadedBy est requis",
          code: "MISSING_UPLOADER",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Aucun fichier fourni",
          code: "NO_FILE",
        });
      }

      // Validation de la taille et type
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (req.file.size > maxSize) {
        // Supprimer le fichier temporaire
        if (req.file.path) {
          await fs.remove(req.file.path).catch(() => {});
        }

        return res.status(413).json({
          success: false,
          message: "Fichier trop volumineux (max 100MB)",
          code: "FILE_TOO_LARGE",
          maxSize: maxSize,
        });
      }

      // Types de fichiers autorisés
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "video/mp4",
        "video/avi",
        "video/mov",
        "video/webm",
        "audio/mp3",
        "audio/wav",
        "audio/ogg",
        "audio/m4a",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/zip",
        "application/rar",
        "text/plain",
      ];

      if (!allowedTypes.includes(req.file.mimetype)) {
        await fs.remove(req.file.path).catch(() => {});

        return res.status(400).json({
          success: false,
          message: "Type de fichier non autorisé",
          code: "INVALID_FILE_TYPE",
          allowedTypes,
        });
      }

      // 🚀 PUBLIER DÉBUT D'UPLOAD DANS KAFKA
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishFileUpload({
            eventType: "FILE_UPLOAD_STARTED",
            fileName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            uploadedBy,
            conversationId,
            requestId: req.headers["x-request-id"] || `req_${Date.now()}`,
            timestamp: new Date().toISOString(),
            userAgent: req.headers["user-agent"],
            ip: req.ip,
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication début upload:",
            kafkaError.message
          );
        }
      }

      // Exécuter l'upload
      const result = await this.uploadFileUseCase.execute({
        file: req.file,
        uploadedBy,
        conversationId,
        receiverId,
      });

      const processingTime = Date.now() - startTime;

      // 🚀 MISE EN CACHE REDIS
      if (this.redisClient && result.file) {
        try {
          const cacheKey = `file:${result.file._id}`;
          const cacheData = {
            ...result.file.toObject(),
            cached: true,
            cachedAt: new Date().toISOString(),
          };

          await this.redisClient.setex(
            cacheKey,
            7200,
            JSON.stringify(cacheData)
          ); // 2 heures
          console.log(`💾 Fichier mis en cache: ${result.file._id}`);
        } catch (redisError) {
          console.warn("⚠️ Erreur mise en cache fichier:", redisError.message);
        }
      }

      // 🚀 PUBLIER SUCCÈS DANS KAFKA
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishFileUpload({
            eventType: "FILE_UPLOAD_COMPLETED",
            fileId: result.file._id,
            fileName: result.file.originalName,
            fileUrl: result.file.url,
            fileSize: result.file.size,
            uploadedBy,
            conversationId,
            messageId: result.message._id,
            processingTime,
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication succès upload:",
            kafkaError.message
          );
        }
      }

      // Réponse enrichie
      res.status(201).json({
        success: true,
        message: "Fichier uploadé avec succès",
        data: {
          file: {
            id: result.file._id,
            originalName: result.file.originalName,
            fileName: result.file.fileName,
            url: result.file.url,
            size: result.file.size,
            mimeType: result.file.mimeType,
            type: result.file.metadata.technical.fileType,
            thumbnail: result.file.metadata.processing.thumbnailUrl,
            uploadedAt: result.file.createdAt,
          },
          message: {
            id: result.message._id,
            conversationId: result.message.conversationId,
            content: result.message.content,
            type: result.message.type,
            createdAt: result.message.createdAt,
          },
        },
        metadata: {
          processingTime: `${processingTime}ms`,
          cached: !!this.redisClient,
          kafkaPublished: !!this.kafkaProducer,
          serverId: process.env.SERVER_ID || "default",
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur upload fichier:", error);

      // Nettoyer le fichier temporaire en cas d'erreur
      if (req.file?.path) {
        await fs.remove(req.file.path).catch(() => {});
      }

      // 🚀 PUBLIER ERREUR DANS KAFKA
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishFileUpload({
            eventType: "FILE_UPLOAD_FAILED",
            fileName: req.file?.originalname,
            uploadedBy: req.body.uploadedBy,
            conversationId: req.body.conversationId,
            error: error.message,
            processingTime,
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication échec upload:",
            kafkaError.message
          );
        }
      }

      res.status(500).json({
        success: false,
        message: "Erreur lors de l'upload du fichier",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "UPLOAD_FAILED",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  async getFile(req, res) {
    const startTime = Date.now();

    try {
      const { fileId } = req.params;
      const userId = req.user?.id || req.headers["user-id"];

      if (!fileId) {
        return res.status(400).json({
          success: false,
          message: "ID du fichier requis",
          code: "MISSING_FILE_ID",
        });
      }

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentification requise",
          code: "MISSING_USER_ID",
        });
      }

      // 🚀 TENTATIVE DE RÉCUPÉRATION DEPUIS REDIS
      let fileData = null;
      let fromCache = false;

      if (this.redisClient) {
        try {
          const cacheKey = `file:${fileId}`;
          const cachedFile = await this.redisClient.get(cacheKey);

          if (cachedFile) {
            fileData = JSON.parse(cachedFile);
            fromCache = true;
            console.log(`📦 Fichier récupéré depuis Redis: ${fileId}`);
          }
        } catch (redisError) {
          console.warn("⚠️ Erreur lecture cache fichier:", redisError.message);
        }
      }

      // Si pas en cache, récupérer depuis la base
      if (!fileData) {
        const result = await this.getFileUseCase.execute(fileId, userId);
        fileData = result.file;

        // Mettre en cache si Redis disponible
        if (this.redisClient) {
          try {
            const cacheKey = `file:${fileId}`;
            const cacheData = {
              ...fileData.toObject(),
              cached: true,
              cachedAt: new Date().toISOString(),
            };

            await this.redisClient.setex(
              cacheKey,
              7200,
              JSON.stringify(cacheData)
            );
          } catch (redisError) {
            console.warn(
              "⚠️ Erreur mise en cache après récupération:",
              redisError.message
            );
          }
        }
      }

      // Vérifier que le fichier existe physiquement
      if (!(await fs.pathExists(fileData.path))) {
        return res.status(404).json({
          success: false,
          message: "Fichier physique non trouvé",
          code: "FILE_NOT_FOUND_ON_DISK",
        });
      }

      const processingTime = Date.now() - startTime;

      // 🚀 PUBLIER TÉLÉCHARGEMENT DANS KAFKA
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishFileUpload({
            eventType: "FILE_DOWNLOADED",
            fileId,
            fileName: fileData.originalName,
            downloadedBy: userId,
            conversationId: fileData.conversationId,
            fromCache,
            processingTime,
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication téléchargement:",
            kafkaError.message
          );
        }
      }

      // Headers pour le téléchargement
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileData.originalName}"`
      );
      res.setHeader("Content-Type", fileData.mimeType);
      res.setHeader("Content-Length", fileData.size);
      res.setHeader("X-File-Id", fileId);
      res.setHeader("X-Processing-Time", `${processingTime}ms`);
      res.setHeader("X-From-Cache", fromCache.toString());

      // Streamer le fichier
      const fileStream = fs.createReadStream(fileData.path);

      fileStream.on("error", (error) => {
        console.error("❌ Erreur lecture fichier:", error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Erreur lors de la lecture du fichier",
            code: "FILE_READ_ERROR",
          });
        }
      });

      fileStream.pipe(res);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur récupération fichier:", error);

      // 🚀 PUBLIER ERREUR DANS KAFKA
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishFileUpload({
            eventType: "FILE_DOWNLOAD_FAILED",
            fileId: req.params.fileId,
            downloadedBy: req.user?.id || req.headers["user-id"],
            error: error.message,
            processingTime,
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication échec téléchargement:",
            kafkaError.message
          );
        }
      }

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Erreur lors de la récupération du fichier",
          error:
            process.env.NODE_ENV === "development"
              ? error.message
              : "Erreur interne",
          code: "GET_FILE_FAILED",
          metadata: {
            processingTime: `${processingTime}ms`,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }
  }

  async getFileInfo(req, res) {
    try {
      const { fileId } = req.params;
      const userId = req.user?.id || req.headers["user-id"];

      if (!fileId || !userId) {
        return res.status(400).json({
          success: false,
          message: "fileId et userId requis",
          code: "MISSING_PARAMETERS",
        });
      }

      // Récupérer les infos du fichier
      const result = await this.getFileUseCase.execute(fileId, userId, false); // Ne pas tracker le téléchargement

      const fileInfo = result.file.getPresentationInfo();

      res.json({
        success: true,
        data: {
          ...fileInfo,
          id: result.file._id,
          conversationId: result.file.conversationId,
          messageId: result.file.messageId,
          downloadCount: result.file.downloadCount,
          metadata: {
            dimensions: result.file.metadata.content.dimensions,
            duration: result.file.metadata.content.duration,
            processingStatus: result.file.metadata.processing.status,
          },
        },
        metadata: {
          retrieved: true,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("❌ Erreur info fichier:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des informations du fichier",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "GET_FILE_INFO_FAILED",
      });
    }
  }

  async deleteFile(req, res) {
    try {
      const { fileId } = req.params;
      const userId = req.user?.id || req.headers["user-id"];

      if (!fileId || !userId) {
        return res.status(400).json({
          success: false,
          message: "fileId et userId requis",
          code: "MISSING_PARAMETERS",
        });
      }

      // Récupérer le fichier pour vérifications
      const result = await this.getFileUseCase.execute(fileId, userId, false);
      const file = result.file;

      // Vérifier les permissions de suppression
      if (file.uploadedBy !== userId) {
        return res.status(403).json({
          success: false,
          message:
            "Permission refusée - vous ne pouvez supprimer que vos propres fichiers",
          code: "PERMISSION_DENIED",
        });
      }

      // Supprimer physiquement le fichier
      if (await fs.pathExists(file.path)) {
        await fs.remove(file.path);
      }

      // Supprimer la miniature si elle existe
      if (
        file.metadata.processing.thumbnailPath &&
        (await fs.pathExists(file.metadata.processing.thumbnailPath))
      ) {
        await fs.remove(file.metadata.processing.thumbnailPath);
      }

      // Marquer comme supprimé dans la base
      file.softDelete();
      await file.save();

      // 🗑️ INVALIDER LE CACHE REDIS
      if (this.redisClient) {
        try {
          const cacheKey = `file:${fileId}`;
          await this.redisClient.del(cacheKey);
          console.log(`🗑️ Cache invalidé pour le fichier: ${fileId}`);
        } catch (redisError) {
          console.warn("⚠️ Erreur invalidation cache:", redisError.message);
        }
      }

      // 🚀 PUBLIER SUPPRESSION DANS KAFKA
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishFileUpload({
            eventType: "FILE_DELETED",
            fileId,
            fileName: file.originalName,
            deletedBy: userId,
            conversationId: file.conversationId,
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication suppression:",
            kafkaError.message
          );
        }
      }

      res.json({
        success: true,
        message: "Fichier supprimé avec succès",
        data: {
          fileId,
          deletedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("❌ Erreur suppression fichier:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors de la suppression du fichier",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        code: "DELETE_FILE_FAILED",
      });
    }
  }
}

module.exports = FileController;
