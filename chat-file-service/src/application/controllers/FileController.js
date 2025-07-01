const path = require("path");
const fs = require("fs").promises;
const multer = require("multer");
const FileStorageService = require("../../infrastructure/services/FileStorageService");
const UploadFile = require("../../application/use-cases/UploadFile");
const upload = multer({ dest: "uploads/" });

const config = {
  env: process.env.NODE_ENV || "development",
  s3Endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
  s3AccessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
  s3SecretAccessKey: process.env.S3_SECRET_KEY || "minioadmin",
  s3Bucket: process.env.S3_BUCKET || "chat-files",
  sftpConfig: {
    host: process.env.SFTP_HOST,
    port: process.env.SFTP_PORT || 22,
    username: process.env.SFTP_USER,
    password: process.env.SFTP_PASS,
    remotePath: process.env.SFTP_REMOTE_PATH || "/uploads",
  },
};
const fileStorageService = new FileStorageService(config);

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

    console.log("✅ FileController initialisé avec:", {
      uploadFileUseCase: !!this.uploadFileUseCase,
      getFileUseCase: !!this.getFileUseCase,
      redisClient: !!this.redisClient,
      kafkaProducer: !!this.kafkaProducer,
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

      const userId = req.user?.id || req.user?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié",
          code: "UNAUTHORIZED",
        });
      }

      const remoteFileName = `${Date.now()}_${req.file.originalname}`;
      // Upload sur MinIO ou SFTP
      const remotePath = await fileStorageService.upload(
        req.file.path,
        remoteFileName
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

  // Télécharger un fichier depuis MinIO ou SFTP
  async getFile(req, res) {
    const startTime = Date.now();

    try {
      const { fileId } = req.params;
      const userId = req.user?.id || req.user?.userId;

      let result;
      if (this.getFileUseCase) {
        result = await this.getFileUseCase.execute(fileId, String(userId));
      } else {
        throw new Error("Service de récupération de fichiers non disponible");
      }

      const processingTime = Date.now() - startTime;

      // Utilise FileStorageService pour récupérer le fichier distant
      const remoteFileName = result.fileName || result.filename;
      const fileStream = await fileStorageService.download(
        remoteFileName,
        remoteFileName
      );

      // Publier événement Kafka
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "FILE_DOWNLOADED",
            fileId: String(fileId),
            userId: String(userId),
            filename: result.originalName || result.fileName,
            processingTime: String(processingTime),
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication download fichier:",
            kafkaError.message
          );
        }
      }

      // Servir le fichier
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.originalName || result.fileName}"`
      );
      fileStream.pipe(res);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur récupération fichier:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération du fichier",
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

  async getFiles(req, res) {
    const startTime = Date.now();

    try {
      const userId = req.user?.id || req.user?.userId;
      const { page = 1, limit = 20, type, conversationId } = req.query;

      // Pour l'instant, retourner une réponse simple
      const result = {
        files: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0,
        },
        filters: {
          type: type || null,
          conversationId: conversationId || null,
        },
      };

      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: result,
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
          message: "Fonctionnalité en cours de développement",
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur liste fichiers:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des fichiers",
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

  // Supprimer un fichier sur MinIO ou SFTP
  async deleteFile(req, res) {
    const startTime = Date.now();

    try {
      const { fileId } = req.params;
      const userId = req.user?.id || req.user?.userId;

      if (!fileId) {
        return res.status(400).json({
          success: false,
          message: "ID du fichier requis",
          code: "MISSING_FILE_ID",
        });
      }

      // Récupérer les métadonnées pour obtenir le nom du fichier distant
      let result;
      if (this.getFileUseCase) {
        result = await this.getFileUseCase.execute(fileId, String(userId));
      } else {
        throw new Error("Service de récupération de fichiers non disponible");
      }

      const remoteFileName = result.fileName || result.filename;
      await fileStorageService.delete(remoteFileName);

      // (Optionnel) Supprimer les métadonnées en base via un use-case

      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: {
          id: fileId,
          deleted: true,
          deletedBy: userId,
          deletedAt: new Date().toISOString(),
        },
        message: "Fichier supprimé avec succès",
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur suppression fichier:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors de la suppression du fichier",
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

  async getFileMetadata(req, res) {
    const startTime = Date.now();

    try {
      const { fileId } = req.params;
      const userId = req.user?.id || req.user?.userId;

      if (!fileId) {
        return res.status(400).json({
          success: false,
          message: "ID du fichier requis",
          code: "MISSING_FILE_ID",
        });
      }

      // Pour l'instant, retourner des métadonnées fictives
      const metadata = {
        id: fileId,
        filename: `file-${fileId}.jpg`,
        originalName: "example-file.jpg",
        mimeType: "image/jpeg",
        size: 1024567,
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
        conversationId: "conversation-123",
        dimensions: {
          width: 1920,
          height: 1080,
        },
        checksum: "abc123def456",
        processingStatus: "completed",
        thumbnails: [
          { size: "150x150", url: `/files/${fileId}/thumbnail/150` },
          { size: "300x300", url: `/files/${fileId}/thumbnail/300` },
        ],
      };

      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: metadata,
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
          message: "Métadonnées récupérées avec succès",
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur métadonnées fichier:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des métadonnées",
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

  async getConversationFiles(req, res) {
    const startTime = Date.now();

    try {
      const { conversationId } = req.params;
      const userId = req.user?.id || req.user?.userId;

      // Pour l'instant, retourner une réponse vide
      const result = {
        conversationId: conversationId,
        files: [],
        total: 0,
      };

      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: result,
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
          message: "Fonctionnalité en cours de développement",
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur fichiers conversation:", error);

      res.status(500).json({
        success: false,
        message: "Erreur lors de la récupération des fichiers de conversation",
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

  static uploadFile = [
    upload.single("file"),
    async (req, res) => {
      try {
        const file = req.file;
        if (!file)
          return res
            .status(400)
            .json({ success: false, message: "Aucun fichier envoyé" });

        const remoteFileName = `${Date.now()}_${file.originalname}`;
        const remotePath = await fileStorageService.upload(
          file.path,
          remoteFileName
        );

        // Utilisation du use-case UploadFile pour sauvegarder les métadonnées
        const uploadFileUseCase = new UploadFile(/* repo, ... */);
        const fileMeta = await uploadFileUseCase.execute({
          originalName: file.originalname,
          fileName: remoteFileName,
          mimeType: file.mimetype,
          size: file.size,
          path: remotePath,
          url: remotePath, // ou une URL publique si besoin
          uploadedBy: req.user?.id || req.user?.userId,
          // ...autres champs nécessaires
        });

        res.json({ success: true, data: fileMeta });
      } catch (err) {
        res.status(500).json({ success: false, message: err.message });
      }
    },
  ];
}

module.exports = FileController;
