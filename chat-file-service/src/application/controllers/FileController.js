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
    fileStorageService = null,
    downloadFileUseCase = null,
    mediaProcessingService = null,
    searchOccurrencesUseCase = null
  ) {
    this.uploadFileUseCase = uploadFileUseCase;
    this.getFileUseCase = getFileUseCase;
    this.redisClient = redisClient;
    this.fileStorageService = fileStorageService;
    this.downloadFileUseCase = downloadFileUseCase;
    this.searchOccurrencesUseCase = searchOccurrencesUseCase;
    this.mediaProcessingService = mediaProcessingService;

    this.maxListLimit = 50; // Limit pour lists/multiple

    console.log("✅ FileController initialisé avec:", {
      uploadFileUseCase: !!this.uploadFileUseCase,
      getFileUseCase: !!this.getFileUseCase,
      redisClient: !!this.redisClient,
      kafkaProducer: !!this.kafkaProducer,
      fileStorageService: !!this.fileStorageService,
      downloadFileUseCase: !!this.downloadFileUseCase,
      searchOccurrencesUseCase: !!this.searchOccurrencesUseCase,
      mediaProcessingService: !!this.mediaProcessingService,
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

      // ✅ VÉRIFIER QUE LES SERVICES SONT DISPONIBLES
      if (!this.fileStorageService) {
        throw new Error("Service de stockage de fichiers non disponible");
      }

      if (!this.mediaProcessingService) {
        throw new Error("Service de traitement des médias non disponible");
      }

      const userId = req.user?.id || req.user?.userId || req.headers["user-id"];
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Utilisateur non authentifié",
          code: "UNAUTHORIZED",
        });
      }

      const remoteFileName = `${Date.now()}_${req.file.originalname}`;

      // ✅ UPLOAD VERS LE STOCKAGE
      const remotePath = await this.fileStorageService.uploadFromBuffer(
        req.file.buffer,
        remoteFileName,
        req.file.mimetype
      );

      // ✅ EXTRACTION DES MÉTADONNÉES AVEC LE SERVICE
      let fileMetadata = {};
      try {
        fileMetadata = await this.mediaProcessingService.processFile(
          req.file.buffer,
          req.file.originalname, // Correction: originalname au lieu de originalName
          req.file.mimetype
        );
        console.log(`✅ Métadonnées extraites pour: ${req.file.originalname}`);
      } catch (metadataError) {
        console.warn(
          `⚠️ Erreur extraction métadonnées:`,
          metadataError.message
        );
        // Continuer avec des métadonnées basiques même en cas d'erreur
        fileMetadata = {
          technical: {
            extension: path.extname(req.file.originalname).toLowerCase(),
            fileType: this.mediaProcessingService.getFileType(
              req.file.mimetype,
              req.file.originalname
            ),
            category: "other",
            encoding: "binary",
          },
          content: {}, // Supprimer la référence à duration qui n'est pas définie
        };
      }

      // ✅ CONSTRUCTION COMPLÈTE DU FILEDATA AVEC MÉTADONNÉES
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
        url: remotePath,
        status: "UPLOADING",
        metadata: {
          technical: {
            ...fileMetadata.technical,
            extension: path.extname(req.file.originalname).toLowerCase(),
            fileType: fileMetadata.technical?.fileType || "AUDIO",
            category: fileMetadata.technical?.category || "media",
            encoding: "binary",
          },
          content: {
            duration: fileMetadata.content?.duration || null,
            bitrate: fileMetadata.content?.bitrate || null,
            sampleRate: fileMetadata.content?.sampleRate || null,
            channels: fileMetadata.content?.channels || null,
            codec: fileMetadata.content?.codec || null,
            title: fileMetadata.content?.title || null,
            artist: fileMetadata.content?.artist || null,
            album: fileMetadata.content?.album || null,
            genre: fileMetadata.content?.genre || null,
            year: fileMetadata.content?.year || null,
          },

          // ✅ MÉTADONNÉES DE TRAITEMENT
          processing: {
            status: "pending",
            thumbnailGenerated: false,
            compressed: false,
            processed: false,
          },

          // ✅ MÉTADONNÉES REDIS
          redisMetadata: {
            cacheKey: `file:${Date.now()}`,
            ttl: 7200,
            cachedAt: new Date(),
            cacheHits: 0,
          },

          // ✅ MÉTADONNÉES DE SÉCURITÉ
          security: {
            encrypted: false,
            accessLevel: "private",
            scanStatus: "pending",
          },

          // ✅ MÉTADONNÉES DE STOCKAGE
          storage: {
            provider: this.fileStorageService.constructor.name.includes("S3")
              ? "s3"
              : "sftp",
            bucket: process.env.S3_BUCKET || "default",
            region: process.env.S3_REGION || "us-east-1",
            storageClass: "standard",
            backupStatus: "pending",
          },

          // ✅ STATISTIQUES D'UTILISATION
          usage: {
            downloadCount: 0,
            firstDownload: null,
            lastDownload: null,
            downloadHistory: [],
            shareCount: 0,
            viewCount: 0,
          },
        },
        downloadCount: 0,
        isPublic: false,
        tags: req.body.tags
          ? req.body.tags.split(",").map((tag) => tag.trim())
          : [],
      };

      let result;
      if (this.uploadFileUseCase) {
        result = await this.uploadFileUseCase.execute(fileData);
        console.log(`✅ Fichier enregistré en base: ${result}`);
      } else {
        result = {
          id: Date.now().toString(),
          ...fileData,
          uploadedAt: new Date().toISOString(),
        };
      }

      const processingTime = Date.now() - startTime;

      // ✅ RÉPONSE AVEC MÉTADONNÉES ENRICHIES
      res.status(201).json({
        success: true,
        data: {
          ...result,
          // ✅ INCLURE LES MÉTADONNÉES EXTRACTES DANS LA RÉPONSE
          metadata: {
            ...result.metadata,
            extracted: fileMetadata, // Métadonnées brutes extraites
          },
        },
        metadata: {
          processingTime: `${processingTime}ms`,
          fileType: fileMetadata.technical?.fileType || "UNKNOWN",
          hasMetadata: !!fileMetadata.technical,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur upload fichier:", error);

      // ✅ NETTOYAGE EN CAS D'ERREUR
      if (req.file?.path) {
        try {
          await fs.unlink(req.file.path);
        } catch (cleanupError) {
          console.warn(
            "⚠️ Erreur nettoyage après erreur:",
            cleanupError.message
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
        metadata: {
          processingTime: `${processingTime}ms`,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // GET /files/:fileId - Métadonnées d'un fichier (AMÉLIORÉ)
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
        return res.status(404).json({
          success: false,
          message: "Fichier non trouvé",
          code: "FILE_NOT_FOUND",
        });
      }

      // ✅ FORMATAGE DES MÉTADONNÉES POUR LA RÉPONSE
      const formattedFile = {
        ...file,
        // ✅ INFORMATIONS FORMATÉES POUR LE CLIENT
        displayInfo: {
          formattedSize: this._formatFileSize(file.size),
          type: file.metadata?.technical?.fileType || "UNKNOWN",
          category: file.metadata?.technical?.category || "other",
          canDownload: file.status === "COMPLETED",
          canPreview: this._canPreviewFile(file),
          previewUrl: file.metadata?.processing?.thumbnailUrl || file.url,
        },
      };

      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: formattedFile,
        metadata: {
          processingTime: `${processingTime}ms`,
          fromCache: file.fromCache || false,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error("❌ Erreur récupération fichier:", error);

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

  // GET /files - Liste paginée des fichiers (métadonnées)
  async getFiles(req, res) {
    try {
      const userId = req.user?.id || req.user?.userId;
      const { page = 1, limit = 20, type, conversationId } = req.query;

      const result = await this.uploadFileUseCase.fileRepository.findByUploader(
        userId,
        {
          page: parseInt(page),
          limit: parseInt(limit),
          type,
          conversationId,
        }
      );

      // ✅ ENRICHIR LES FICHIERS AVEC DES INFORMATIONS DE FORMATAGE
      if (result.files) {
        result.files = result.files.map((file) => ({
          ...file,
          displayInfo: {
            formattedSize: this._formatFileSize(file.size),
            type: file.metadata?.technical?.fileType || "UNKNOWN",
            previewUrl: file.metadata?.processing?.thumbnailUrl || file.url,
            canDownload: file.status === "COMPLETED",
          },
        }));
      }

      res.json({
        success: true,
        data: result,
        metadata: {
          timestamp: new Date().toISOString(),
          user: userId,
        },
      });
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

      // ✅ ENRICHIR LES FICHIERS
      if (result.files) {
        result.files = result.files.map((file) => ({
          ...file,
          displayInfo: {
            formattedSize: this._formatFileSize(file.size),
            type: file.metadata?.technical?.fileType || "UNKNOWN",
            previewUrl: file.metadata?.processing?.thumbnailUrl || file.url,
            uploadedBy: file.uploadedBy, // Inclure l'uploader pour le contexte
          },
        }));
      }

      res.json({
        success: true,
        data: result,
        metadata: {
          conversationId,
          timestamp: new Date().toISOString(),
        },
      });
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

      res.json({
        success: true,
        data: deletedFile,
        message: "Fichier supprimé avec succès",
      });
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
      res.setHeader("Content-Length", file.size);

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
          query,
          scope,
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

  async getThumbnail(req, res) {
    const { fileId } = req.params;
    const { size = "medium" } = req.query;
    const userId = req.user?.id;

    const file = await this.getFileUseCase.execute(fileId, userId);
    if (!file || !file.metadata.processing.thumbnailGenerated) {
      return res
        .status(404)
        .json({ success: false, message: "Thumbnail non disponible" });
    }

    const thumbnailUrl = file.metadata.processing.thumbnails.find(
      (t) => t.size === size
    )?.url;
    if (!thumbnailUrl) throw new Error("Taille thumbnail invalide");

    // Stream le thumbnail
    const thumbnailStream = await this.fileStorageService.download(
      null,
      thumbnailUrl
    );
    res.setHeader("Content-Type", "image/webp");
    thumbnailStream.pipe(res);
  }

  // ================================
  // MÉTHODES PRIVÉES
  // ================================

  _formatFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  _canPreviewFile(file) {
    const previewableTypes = ["IMAGE", "PDF", "TEXT"];
    return previewableTypes.includes(file.metadata?.technical?.fileType);
  }

  _addE2EENote(res) {
    res.setHeader("X-E2EE", "encrypted"); // Ou note in JSON si needed
  }
}

module.exports = FileController;
