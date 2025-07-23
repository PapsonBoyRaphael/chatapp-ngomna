const path = require("path");
const fs = require("fs").promises;
const multer = require("multer");
const UploadFile = require("../../application/use-cases/UploadFile");
const DownloadFile = require("../use-cases/DownloadFile");
const upload = multer({ dest: "uploads/" });

class FileController {
  constructor(
    uploadFileUseCase,
    getFileUseCase,
    redisClient = null,
    kafkaProducer = null,
    fileStorageService = null,
    downloadFileUseCase = null,
    searchOccurrencesUseCase = null // Ajout du use-case
  ) {
    this.uploadFileUseCase = uploadFileUseCase;
    this.getFileUseCase = getFileUseCase;
    this.redisClient = redisClient;
    this.kafkaProducer = kafkaProducer;
    this.fileStorageService = fileStorageService;
    this.downloadFileUseCase = downloadFileUseCase;
    this.searchOccurrencesUseCase = searchOccurrencesUseCase;

    console.log("✅ FileController initialisé avec:", {
      uploadFileUseCase: !!this.uploadFileUseCase,
      getFileUseCase: !!this.getFileUseCase,
      redisClient: !!this.redisClient,
      kafkaProducer: !!this.kafkaProducer,
      fileStorageService: !!this.fileStorageService, // ✅ VÉRIFIER LE SERVICE
    });
  }

  async uploadFile(req, res) {
    const startTime = Date.now();

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Aucun fichier fourni",
          code: "NO_FILE",
        });
      }

      // ✅ VÉRIFIER QUE LE SERVICE EST DISPONIBLE
      if (!this.fileStorageService) {
        throw new Error("Service de stockage de fichiers non disponible");
      }

      const userId = req.user?.id || req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié",
          code: "UNAUTHORIZED",
        });
      }

      const remoteFileName = `${Date.now()}_${req.file.originalname}`;

      // ✅ UTILISER LE SERVICE INJECTÉ
      const remotePath = await this.fileStorageService.uploadFromBuffer(
        req.file.buffer,
        remoteFileName,
        req.file.mimetype
      );

      const fileData = {
        originalName: req.file.originalname,
        fileName: remoteFileName,
        path: remotePath,
        size: req.file.size,
        mimeType: req.file.mimetype,
        uploadedBy: String(userId),
        conversationId: req.body.conversationId
          ? String(req.body.conversationId)
          : null,
        url: remotePath, // ou une URL publique si besoin
      };

      let result;
      if (this.uploadFileUseCase) {
        result = await this.uploadFileUseCase.execute(fileData);
      } else {
        result = {
          id: Date.now().toString(),
          ...fileData,
          uploadedAt: new Date().toISOString(),
        };
      }

      const processingTime = Date.now() - startTime;

      // Publier événement Kafka
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "FILE_UPLOADED",
            fileId: String(result.id),
            userId: String(userId),
            filename: fileData.originalName,
            size: String(fileData.size),
            mimeType: fileData.mimeType,
            conversationId: fileData.conversationId || "",
            processingTime: String(processingTime),
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication upload fichier:",
            kafkaError.message
          );
        }
      }

      res.status(201).json({
        success: true,
        data: result,
        metadata: {
          processingTime: `${processingTime}ms`,
          kafkaPublished: !!this.kafkaProducer,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur upload fichier:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors de l'upload du fichier",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // GET /files/:fileId - Métadonnées d'un fichier
  async getFile(req, res) {
    const startTime = Date.now();
    try {
      const { fileId } = req.params;
      const userId = req.user?.id || req.user?.userId;

      if (!this.getFileUseCase) {
        throw new Error("Service de récupération de fichiers non disponible");
      }
      const file = await this.getFileUseCase.execute(fileId, String(userId));
      if (!file) {
        return res
          .status(404)
          .json({ success: false, message: "Fichier non trouvé" });
      }
      res.json({ success: true, data: file });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des métadonnées",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
      });
    }
  }

  // GET /files - Liste paginée des fichiers (métadonnées)
  async getFiles(req, res) {
    try {
      const userId = req.user?.id || req.user?.userId;
      const { page = 1, limit = 20, type, conversationId } = req.query;
      // Utiliser le repository pour récupérer les fichiers
      const result = await this.uploadFileUseCase.fileRepository.findByUploader(
        userId,
        {
          page: parseInt(page),
          limit: parseInt(limit),
          type,
          conversationId,
        }
      );
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des fichiers",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
      });
    }
  }

  // GET /files/conversation/:conversationId - Fichiers d'une conversation (métadonnées)
  async getConversationFiles(req, res) {
    try {
      const { conversationId } = req.params;
      const { page = 1, limit = 20, type } = req.query;
      const result =
        await this.uploadFileUseCase.fileRepository.findByConversation(
          conversationId,
          {
            page: parseInt(page),
            limit: parseInt(limit),
            type,
          }
        );
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des fichiers de conversation",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
      });
    }
  }

  // DELETE /files/:fileId - Suppression logique, retourne le document supprimé
  async deleteFile(req, res) {
    try {
      const { fileId } = req.params;
      const userId = req.user?.id || req.user?.userId;
      const deletedFile =
        await this.uploadFileUseCase.fileRepository.deleteFile(fileId, true);
      res.json({ success: true, data: deletedFile });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur lors de la suppression du fichier",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
      });
    }
  }

  // Nouvelle méthode pour le téléchargement (stream direct)
  async downloadFile(req, res) {
    const startTime = Date.now();
    try {
      const { fileId } = req.params;
      const userId = req.user?.id || req.user?.userId;

      if (!fileId) {
        return res.status(400).json({
          success: false,
          message: "ID du fichier requis",
        });
      }

      if (!this.downloadFileUseCase) {
        throw new Error("Service de téléchargement non disponible");
      }

      const { file, fileStream } = await this.downloadFileUseCase.executeSingle(
        fileId,
        String(userId)
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${file.originalName || file.fileName}"`
      );
      res.setHeader("Content-Type", file.mimeType);

      fileStream.pipe(res);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur téléchargement fichier:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors du téléchargement du fichier",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // Pour le téléchargement multiple (optionnel, à appeler via une autre route)
  async downloadMultipleFiles(req, res) {
    const startTime = Date.now();
    try {
      const { fileIds } = req.body;
      const userId = req.user?.id || req.user?.userId;

      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Liste de fichiers requise",
        });
      }

      if (!this.downloadFileUseCase) {
        throw new Error("Service de téléchargement non disponible");
      }

      const { zipStream, files } =
        await this.downloadFileUseCase.executeMultiple(fileIds, String(userId));

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="fichiers_${Date.now()}.zip"`
      );
      res.setHeader("Content-Type", "application/zip");

      zipStream.pipe(res);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur téléchargement multiple:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors du téléchargement des fichiers",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Erreur interne",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  async searchOccurrences(req, res) {
    const startTime = Date.now();
    try {
      const {
        query,
        page = 1,
        limit = 20,
        useLike = true,
        scope = "files",
      } = req.query;
      const userId = req.user?.id || req.headers["user-id"];
      if (!query || query.length < 2) {
        return res.status(400).json({
          success: false,
          message:
            "Le mot-clé de recherche doit contenir au moins 2 caractères",
          code: "INVALID_QUERY",
        });
      }
      const result = await this.searchOccurrencesUseCase.execute(query, {
        userId,
        page: parseInt(page),
        limit: parseInt(limit),
        useLike,
        scope,
      });
      res.json({
        success: true,
        data: result,
        metadata: {
          processingTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur lors de la recherche globale",
        error: error.message,
      });
    }
  }
}

module.exports = FileController;
