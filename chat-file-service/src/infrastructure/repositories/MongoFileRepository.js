const FileModel = require("../mongodb/models/FileModel");
const fs = require("fs-extra");
const path = require("path");

class MongoFileRepository {
  constructor(
    redisClient = null,
    kafkaProducer = null,
    thumbnailService = null
  ) {
    this.redisClient = redisClient;
    this.kafkaProducer = kafkaProducer;
    this.thumbnailService = thumbnailService; // ✅ NOUVEAU
    this.cachePrefix = "file:";
    this.defaultTTL = 7200;
    this.maxRetries = 3;

    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      kafkaEvents: 0,
      kafkaErrors: 0,
      dbQueries: 0,
      errors: 0,
    };

    console.log("✅ MongoFileRepository initialisé avec:", {
      redisClient: !!redisClient,
      kafkaProducer: !!kafkaProducer,
      kafkaProducerType: kafkaProducer?.constructor?.name,
      hasPublishMessage: typeof kafkaProducer?.publishMessage === "function",
    });
  }

  // ================================
  // MÉTHODES PRINCIPALES
  // ================================

  async save(file) {
    const startTime = Date.now();

    try {
      // ✅ VALIDER L'OBJET FILE
      if (!file || typeof file.validate !== "function") {
        throw new Error("Objet File invalide ou méthode validate manquante");
      }

      file.validate();
      this.metrics.dbQueries++;

      // ✅ CRÉER LE FICHIER EN BASE AVEC CREATE AU LIEU DE FINDBRIDANDUPDATE
      const savedFile = await FileModel.create(file.toObject());

      if (!savedFile) {
        throw new Error("Échec de la sauvegarde en base de données");
      }

      const processingTime = Date.now() - startTime;

      // ✅ DÉCLENCHER LA GÉNÉRATION DE THUMBNAILS SI C'EST UNE IMAGE
      if (
        this.thumbnailService &&
        this.thumbnailService.isImageFile(savedFile.mimeType)
      ) {
        // Traitement asynchrone en arrière-plan
        this.processThumbnailsAsync(savedFile).catch((error) => {
          console.error(
            `❌ Erreur traitement thumbnails ${savedFile._id}:`,
            error
          );
        });
      }

      // ✅ CACHE REDIS AVEC VÉRIFICATION
      if (this.redisClient) {
        try {
          await this._cacheFile(savedFile);
          console.log(`💾 Fichier mis en cache: ${savedFile._id}`);
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache fichier:", cacheError.message);
        }
      } else {
        console.log(`💾 Fichier sauvegardé sans cache: ${savedFile._id}`);
      }

      // ✅ KAFKA AVEC VÉRIFICATION DE LA MÉTHODE
      if (this.kafkaProducer) {
        try {
          if (typeof this.kafkaProducer.publishMessage === "function") {
            await this._publishFileEvent("FILE_SAVED", savedFile, {
              processingTime,
              isNew: true,
            });
          } else {
            console.warn("⚠️ KafkaProducer n'a pas la méthode publishMessage");
            console.warn(
              "⚠️ Méthodes disponibles:",
              Object.getOwnPropertyNames(this.kafkaProducer)
            );
          }
        } catch (kafkaError) {
          console.warn("⚠️ Erreur publication fichier:", kafkaError.message);
        }
      }

      console.log(
        `💾 Fichier sauvegardé: ${savedFile._id} (${processingTime}ms)`
      );
      return savedFile;
    } catch (error) {
      this.metrics.errors++;
      console.error("❌ Erreur sauvegarde fichier:", error);
      throw error;
    }
  }

  async findById(fileId, useCache = true) {
    const startTime = Date.now();

    try {
      // 🚀 CACHE REDIS
      if (this.redisClient && useCache) {
        try {
          const cached = await this._getCachedFile(fileId);
          if (cached) {
            this.metrics.cacheHits++;
            console.log(
              `📦 Fichier depuis cache: ${fileId} (${Date.now() - startTime}ms)`
            );
            return cached;
          } else {
            this.metrics.cacheMisses++;
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur lecture cache fichier:", cacheError.message);
        }
      }

      this.metrics.dbQueries++;
      const file = await FileModel.findById(fileId).lean();

      if (!file) {
        throw new Error(`Fichier ${fileId} non trouvé`);
      }

      const processingTime = Date.now() - startTime;

      // Mettre en cache
      if (this.redisClient && useCache) {
        try {
          await this._cacheFile(file);
        } catch (cacheError) {
          console.warn("⚠️ Erreur mise en cache fichier:", cacheError.message);
        }
      }

      console.log(`🔍 Fichier trouvé: ${fileId} (${processingTime}ms)`);
      return file;
    } catch (error) {
      this.metrics.errors++;
      console.error(`❌ Erreur recherche fichier ${fileId}:`, error);
      throw error;
    }
  }

  async findByConversation(conversationId, options = {}) {
    const { page = 1, limit = 20, type = null, useCache = true } = options;

    const startTime = Date.now();
    const cacheKey = `${this.cachePrefix}conv:${conversationId}:p${page}:l${limit}:t${type}`;

    try {
      // 🚀 CACHE REDIS
      if (this.redisClient && useCache) {
        try {
          const cached = await this.redisClient.get(cacheKey);
          if (cached) {
            this.metrics.cacheHits++;
            const data = JSON.parse(cached);
            console.log(
              `📦 Fichiers conversation depuis cache: ${conversationId} (${
                Date.now() - startTime
              }ms)`
            );
            return {
              ...data,
              fromCache: true,
            };
          } else {
            this.metrics.cacheMisses++;
          }
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur cache fichiers conversation:",
            cacheError.message
          );
        }
      }

      const filter = {
        conversationId,
        status: "COMPLETED",
      };

      if (type) {
        filter["metadata.technical.fileType"] = type;
      }

      const skip = (page - 1) * limit;

      this.metrics.dbQueries += 2; // count + find
      const [files, totalCount] = await Promise.all([
        FileModel.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        FileModel.countDocuments(filter),
      ]);

      const result = {
        files: files.map((file) => ({
          ...file,
          displayUrl: file.metadata?.processing?.thumbnailUrl || file.url,
          formattedSize: this._formatFileSize(file.size),
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNext: page * limit < totalCount,
          hasPrevious: page > 1,
        },
        fromCache: false,
      };

      const processingTime = Date.now() - startTime;

      // Mettre en cache
      if (this.redisClient && useCache) {
        try {
          if (
            this.redisClient &&
            typeof this.redisClient.setex === "function"
          ) {
            await this.redisClient.setex(
              cacheKey,
              this.defaultTTL,
              JSON.stringify(result)
            );
          } else if (
            this.redisClient &&
            typeof this.redisClient.set === "function"
          ) {
            await this.redisClient.set(
              cacheKey,
              JSON.stringify(result),
              "EX",
              3600
            );
          } else {
            console.warn("⚠️ Redis client ne supporte pas setex ou set");
          }
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur cache fichiers conversation:",
            cacheError.message
          );
        }
      }

      console.log(
        `🔍 Fichiers conversation: ${conversationId} (${files.length} files, ${processingTime}ms)`
      );
      return result;
    } catch (error) {
      this.metrics.errors++;
      console.error(
        `❌ Erreur fichiers conversation ${conversationId}:`,
        error
      );
      throw error;
    }
  }

  async findByUploader(uploaderId, options = {}) {
    const { page = 1, limit = 20, type = null, useCache = true } = options;

    const startTime = Date.now();
    const cacheKey = `${this.cachePrefix}uploader:${uploaderId}:p${page}:l${limit}:t${type}`;

    try {
      // 🚀 CACHE REDIS
      if (this.redisClient && useCache) {
        try {
          const cached = await this.redisClient.get(cacheKey);
          if (cached) {
            this.metrics.cacheHits++;
            const data = JSON.parse(cached);
            console.log(
              `📦 Fichiers utilisateur depuis cache: ${uploaderId} (${
                Date.now() - startTime
              }ms)`
            );
            return {
              ...data,
              fromCache: true,
            };
          } else {
            this.metrics.cacheMisses++;
          }
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur cache fichiers utilisateur:",
            cacheError.message
          );
        }
      }

      const filter = {
        uploadedBy: uploaderId,
        status: { $ne: "DELETED" },
      };

      if (type) {
        filter["metadata.technical.fileType"] = type;
      }

      const skip = (page - 1) * limit;

      this.metrics.dbQueries += 2;
      const [files, totalCount] = await Promise.all([
        FileModel.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        FileModel.countDocuments(filter),
      ]);

      const result = {
        files: files.map((file) => ({
          ...file,
          displayUrl: file.metadata?.processing?.thumbnailUrl || file.url,
          formattedSize: this._formatFileSize(file.size),
          canDelete: true, // L'utilisateur peut supprimer ses propres fichiers
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNext: page * limit < totalCount,
          hasPrevious: page > 1,
        },
        statistics: {
          totalSize: files.reduce((sum, file) => sum + file.size, 0),
          fileTypes: this._groupByType(files),
        },
        fromCache: false,
      };

      const processingTime = Date.now() - startTime;

      // Mettre en cache
      if (this.redisClient && useCache) {
        try {
          if (
            this.redisClient &&
            typeof this.redisClient.setex === "function"
          ) {
            await this.redisClient.setex(
              cacheKey,
              this.defaultTTL,
              JSON.stringify(result)
            );
          } else if (
            this.redisClient &&
            typeof this.redisClient.set === "function"
          ) {
            await this.redisClient.set(
              cacheKey,
              JSON.stringify(result),
              "EX",
              3600
            );
          } else {
            console.warn("⚠️ Redis client ne supporte pas setex ou set");
          }
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur cache fichiers utilisateur:",
            cacheError.message
          );
        }
      }

      console.log(
        `🔍 Fichiers utilisateur: ${uploaderId} (${files.length} files, ${processingTime}ms)`
      );
      return result;
    } catch (error) {
      this.metrics.errors++;
      console.error(`❌ Erreur fichiers utilisateur ${uploaderId}:`, error);
      throw error;
    }
  }

  async incrementDownloadCount(fileId, userId = null, metadata = {}) {
    const startTime = Date.now();

    try {
      const updateData = {
        $inc: { downloadCount: 1 },
        $set: {
          "metadata.usage.lastDownload": new Date(),
          updatedAt: new Date(),
        },
      };

      // Ajouter à l'historique si userId fourni
      if (userId) {
        updateData.$push = {
          "metadata.usage.downloadHistory": {
            $each: [
              {
                userId,
                timestamp: new Date(),
                ip: metadata.ip || null,
                userAgent: metadata.userAgent || null,
              },
            ],
            $slice: -100, // Garder seulement les 100 derniers
          },
        };

        // Définir firstDownload si c'est le premier
        updateData.$setOnInsert = {
          "metadata.usage.firstDownload": new Date(),
        };
      }

      this.metrics.dbQueries++;
      const file = await FileModel.findByIdAndUpdate(fileId, updateData, {
        new: true,
        upsert: false,
      });

      if (!file) {
        throw new Error(`Fichier ${fileId} non trouvé`);
      }

      const processingTime = Date.now() - startTime;

      // 🗑️ INVALIDER CACHE
      if (this.redisClient) {
        try {
          await this._invalidateFileCache(fileId);
          if (file.conversationId) {
            await this._invalidateConversationFilesCache(file.conversationId);
          }
          if (userId) {
            await this._invalidateUserFilesCache(userId);
          }
        } catch (cacheError) {
          console.warn(
            "⚠️ Erreur invalidation download count:",
            cacheError.message
          );
        }
      }

      // 🚀 KAFKA
      if (this.kafkaProducer) {
        try {
          await this._publishFileEvent("FILE_DOWNLOADED", file, {
            downloadedBy: userId,
            downloadCount: file.downloadCount,
            processingTime,
            metadata,
          });
        } catch (kafkaError) {
          console.warn("⚠️ Erreur publication download:", kafkaError.message);
        }
      }

      console.log(
        `📥 Téléchargement compté: ${fileId} (count: ${file.downloadCount}, ${processingTime}ms)`
      );
      return file;
    } catch (error) {
      this.metrics.errors++;
      console.error(`❌ Erreur compteur téléchargement ${fileId}:`, error);
      throw error;
    }
  }

  async markAsCompleted(fileId, metadata = {}) {
    const startTime = Date.now();

    try {
      const updateData = {
        status: "COMPLETED",
        "metadata.processing.status": "completed",
        "metadata.processing.processed": true,
        "metadata.processing.processedAt": new Date(),
        updatedAt: new Date(),
      };

      // Ajouter les métadonnées de traitement
      if (metadata.thumbnailPath) {
        updateData["metadata.processing.thumbnailPath"] =
          metadata.thumbnailPath;
        updateData["metadata.processing.thumbnailGenerated"] = true;
      }
      if (metadata.thumbnailUrl) {
        updateData["metadata.processing.thumbnailUrl"] = metadata.thumbnailUrl;
      }
      if (metadata.compressionRatio) {
        updateData["metadata.processing.compressionRatio"] =
          metadata.compressionRatio;
        updateData["metadata.processing.compressed"] = true;
      }

      this.metrics.dbQueries++;
      const file = await FileModel.findByIdAndUpdate(
        fileId,
        { $set: updateData },
        { new: true }
      );

      if (!file) {
        throw new Error(`Fichier ${fileId} non trouvé`);
      }

      const processingTime = Date.now() - startTime;

      // 🗑️ INVALIDER CACHE
      if (this.redisClient) {
        try {
          await this._invalidateFileCache(fileId);
          if (file.conversationId) {
            await this._invalidateConversationFilesCache(file.conversationId);
          }
          await this._invalidateUserFilesCache(file.uploadedBy);
        } catch (cacheError) {
          console.warn("⚠️ Erreur invalidation completed:", cacheError.message);
        }
      }

      // 🚀 KAFKA
      if (this.kafkaProducer) {
        try {
          await this._publishFileEvent("FILE_PROCESSING_COMPLETED", file, {
            processingTime,
            metadata,
          });
        } catch (kafkaError) {
          console.warn("⚠️ Erreur publication completed:", kafkaError.message);
        }
      }

      console.log(
        `✅ Fichier marqué comme complété: ${fileId} (${processingTime}ms)`
      );
      return file;
    } catch (error) {
      this.metrics.errors++;
      console.error(`❌ Erreur mark completed ${fileId}:`, error);
      throw error;
    }
  }

  async markAsFailed(fileId, error) {
    const startTime = Date.now();

    try {
      const updateData = {
        status: "FAILED",
        "metadata.processing.status": "failed",
        "metadata.processing.processingErrors": [error.message],
        updatedAt: new Date(),
      };

      this.metrics.dbQueries++;
      const file = await FileModel.findByIdAndUpdate(
        fileId,
        {
          $set: updateData,
          $push: {
            "metadata.processing.processingErrors": {
              $each: [error.message],
              $slice: -10, // Garder les 10 dernières erreurs
            },
          },
        },
        { new: true }
      );

      if (!file) {
        throw new Error(`Fichier ${fileId} non trouvé`);
      }

      const processingTime = Date.now() - startTime;

      // 🗑️ INVALIDER CACHE
      if (this.redisClient) {
        try {
          await this._invalidateFileCache(fileId);
          if (file.conversationId) {
            await this._invalidateConversationFilesCache(file.conversationId);
          }
          await this._invalidateUserFilesCache(file.uploadedBy);
        } catch (cacheError) {
          console.warn("⚠️ Erreur invalidation failed:", cacheError.message);
        }
      }

      // 🚀 KAFKA
      if (this.kafkaProducer) {
        try {
          await this._publishFileEvent("FILE_PROCESSING_FAILED", file, {
            processingTime,
            error: error.message,
          });
        } catch (kafkaError) {
          console.warn("⚠️ Erreur publication failed:", kafkaError.message);
        }
      }

      console.log(
        `❌ Fichier marqué comme échoué: ${fileId} (${processingTime}ms)`
      );
      return file;
    } catch (error) {
      this.metrics.errors++;
      console.error(`❌ Erreur mark failed ${fileId}:`, error);
      throw error;
    }
  }

  async deleteFile(fileId, softDelete = true) {
    const startTime = Date.now();

    try {
      let file;

      if (softDelete) {
        // Soft delete - marquer comme supprimé
        this.metrics.dbQueries++;
        file = await FileModel.findByIdAndUpdate(
          fileId,
          {
            $set: {
              status: "DELETED",
              deletedAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { new: true }
        );
      } else {
        // Hard delete - supprimer complètement
        this.metrics.dbQueries++;
        file = await FileModel.findByIdAndDelete(fileId);
      }

      if (!file) {
        throw new Error(`Fichier ${fileId} non trouvé`);
      }

      const processingTime = Date.now() - startTime;

      // 🗑️ INVALIDER TOUS LES CACHES LIÉS
      if (this.redisClient) {
        try {
          await this._invalidateFileCache(fileId);
          if (file.conversationId) {
            await this._invalidateConversationFilesCache(file.conversationId);
          }
          await this._invalidateUserFilesCache(file.uploadedBy);
        } catch (cacheError) {
          console.warn("⚠️ Erreur invalidation delete:", cacheError.message);
        }
      }

      // 🚀 KAFKA
      if (this.kafkaProducer) {
        try {
          await this._publishFileEvent("FILE_DELETED", file, {
            softDelete,
            processingTime,
          });
        } catch (kafkaError) {
          console.warn("⚠️ Erreur publication delete:", kafkaError.message);
        }
      }

      console.log(
        `🗑️ Fichier supprimé: ${fileId} (soft: ${softDelete}, ${processingTime}ms)`
      );
      return file;
    } catch (error) {
      this.metrics.errors++;
      console.error(`❌ Erreur suppression fichier ${fileId}:`, error);
      throw error;
    }
  }

  // ================================
  // NOUVELLES MÉTHODES AVANCÉES
  // ================================

  async searchFiles(query, options = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = -1,
      useCache = true,
    } = options;

    const startTime = Date.now();
    const cacheKey = `${this.cachePrefix}search:${JSON.stringify(
      query
    )}:p${page}:l${limit}:s${sortBy}${sortOrder}`;

    try {
      // 🚀 CACHE REDIS
      if (this.redisClient && useCache) {
        try {
          const cached = await this.redisClient.get(cacheKey);
          if (cached) {
            this.metrics.cacheHits++;
            return JSON.parse(cached);
          } else {
            this.metrics.cacheMisses++;
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache recherche:", cacheError.message);
        }
      }

      const filter = { status: { $ne: "DELETED" } };

      // Construire le filtre de recherche
      if (query.text) {
        filter.$text = { $search: query.text };
      }
      if (query.type) {
        filter["metadata.technical.fileType"] = query.type;
      }
      if (query.uploadedBy) {
        filter.uploadedBy = query.uploadedBy;
      }
      if (query.conversationId) {
        filter.conversationId = query.conversationId;
      }
      if (query.sizeMin || query.sizeMax) {
        filter.size = {};
        if (query.sizeMin) filter.size.$gte = query.sizeMin;
        if (query.sizeMax) filter.size.$lte = query.sizeMax;
      }
      if (query.dateFrom || query.dateTo) {
        filter.createdAt = {};
        if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
        if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo);
      }

      const skip = (page - 1) * limit;
      const sortObj = { [sortBy]: sortOrder };

      this.metrics.dbQueries += 2;
      const [files, totalCount] = await Promise.all([
        FileModel.find(filter).sort(sortObj).skip(skip).limit(limit).lean(),
        FileModel.countDocuments(filter),
      ]);

      const result = {
        files: files.map((file) => ({
          ...file,
          displayUrl: file.metadata?.processing?.thumbnailUrl || file.url,
          formattedSize: this._formatFileSize(file.size),
          relevanceScore: query.text ? file.score : null,
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalCount,
          hasNext: page * limit < totalCount,
          hasPrevious: page > 1,
        },
        query,
        fromCache: false,
      };

      const processingTime = Date.now() - startTime;

      // Mettre en cache
      if (this.redisClient && useCache) {
        try {
          if (
            this.redisClient &&
            typeof this.redisClient.setex === "function"
          ) {
            await this.redisClient.setex(
              cacheKey,
              3600,
              JSON.stringify(result)
            );
          } else if (
            this.redisClient &&
            typeof this.redisClient.set === "function"
          ) {
            await this.redisClient.set(
              cacheKey,
              JSON.stringify(result),
              "EX",
              3600
            );
          } else {
            console.warn("⚠️ Redis client ne supporte pas setex ou set");
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache recherche:", cacheError.message);
        }
      }

      console.log(
        `🔍 Recherche fichiers: ${files.length} résultats (${processingTime}ms)`
      );
      return result;
    } catch (error) {
      this.metrics.errors++;
      console.error("❌ Erreur recherche fichiers:", error);
      throw error;
    }
  }

  async getFileStatistics(filter = {}) {
    const startTime = Date.now();
    const cacheKey = `${this.cachePrefix}stats:${JSON.stringify(filter)}`;

    try {
      // 🚀 CACHE REDIS
      if (this.redisClient) {
        try {
          const cached = await this.redisClient.get(cacheKey);
          if (cached) {
            this.metrics.cacheHits++;
            return JSON.parse(cached);
          } else {
            this.metrics.cacheMisses++;
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache stats:", cacheError.message);
        }
      }

      this.metrics.dbQueries++;
      const stats = await FileModel.aggregate([
        { $match: { status: { $ne: "DELETED" }, ...filter } },
        {
          $group: {
            _id: null,
            totalFiles: { $sum: 1 },
            totalSize: { $sum: "$size" },
            averageSize: { $avg: "$size" },
            totalDownloads: { $sum: "$downloadCount" },
            filesByType: {
              $push: {
                type: "$metadata.technical.fileType",
                size: "$size",
              },
            },
            newestFile: { $max: "$createdAt" },
            oldestFile: { $min: "$createdAt" },
          },
        },
        {
          $project: {
            _id: 0,
            totalFiles: 1,
            totalSize: 1,
            averageSize: { $round: ["$averageSize", 2] },
            totalDownloads: 1,
            filesByType: 1,
            newestFile: 1,
            oldestFile: 1,
            averageSizeFormatted: {
              $concat: [
                {
                  $toString: {
                    $round: [{ $divide: ["$averageSize", 1024] }, 2],
                  },
                },
                " KB",
              ],
            },
            totalSizeFormatted: {
              $concat: [
                {
                  $toString: {
                    $round: [{ $divide: ["$totalSize", 1048576] }, 2],
                  },
                },
                " MB",
              ],
            },
          },
        },
      ]);

      const result = stats[0] || {
        totalFiles: 0,
        totalSize: 0,
        averageSize: 0,
        totalDownloads: 0,
        filesByType: [],
        newestFile: null,
        oldestFile: null,
      };

      // Traiter les types de fichiers
      if (result.filesByType) {
        const typeStats = {};
        result.filesByType.forEach((item) => {
          const type = item.type || "UNKNOWN";
          if (!typeStats[type]) {
            typeStats[type] = { count: 0, totalSize: 0 };
          }
          typeStats[type].count++;
          typeStats[type].totalSize += item.size;
        });

        result.typeBreakdown = Object.entries(typeStats).map(
          ([type, data]) => ({
            type,
            count: data.count,
            totalSize: data.totalSize,
            percentage: ((data.count / result.totalFiles) * 100).toFixed(2),
            averageSize: (data.totalSize / data.count).toFixed(2),
          })
        );
      }

      const processingTime = Date.now() - startTime;
      result.generatedAt = new Date().toISOString();
      result.processingTime = `${processingTime}ms`;

      // Mettre en cache
      if (this.redisClient) {
        try {
          await this.redisClient.setex(
            cacheKey,
            3600, // 1 heure pour les stats
            JSON.stringify(result)
          );
        } catch (cacheError) {
          console.warn("⚠️ Erreur cache stats:", cacheError.message);
        }
      }

      console.log(`📊 Statistiques calculées (${processingTime}ms)`);
      return result;
    } catch (error) {
      this.metrics.errors++;
      console.error("❌ Erreur statistiques fichiers:", error);
      throw error;
    }
  }

  async bulkUpdateStatus(fileIds, status, metadata = {}) {
    const startTime = Date.now();

    try {
      const updateData = {
        status,
        updatedAt: new Date(),
        ...metadata,
      };

      this.metrics.dbQueries++;
      const result = await FileModel.updateMany(
        { _id: { $in: fileIds } },
        { $set: updateData }
      );

      const processingTime = Date.now() - startTime;

      // 🗑️ INVALIDER CACHES
      if (this.redisClient) {
        try {
          for (const fileId of fileIds) {
            await this._invalidateFileCache(fileId);
          }
        } catch (cacheError) {
          console.warn("⚠️ Erreur invalidation bulk:", cacheError.message);
        }
      }

      // 🚀 KAFKA
      if (this.kafkaProducer) {
        try {
          await this._publishFileEvent("FILES_BULK_UPDATED", null, {
            fileIds,
            status,
            modifiedCount: result.modifiedCount,
            processingTime,
          });
        } catch (kafkaError) {
          console.warn("⚠️ Erreur publication bulk:", kafkaError.message);
        }
      }

      console.log(
        `📦 Mise à jour bulk: ${result.modifiedCount}/${fileIds.length} fichiers (${processingTime}ms)`
      );
      return result;
    } catch (error) {
      this.metrics.errors++;
      console.error("❌ Erreur bulk update:", error);
      throw error;
    }
  }

  // ================================
  // MÉTHODES PRIVÉES (UTILITAIRES)
  // ================================

  async _cacheFile(file) {
    try {
      if (!this.redisClient) {
        console.warn("⚠️ Aucun client Redis disponible");
        return false;
      }

      const cacheKey = `${this.cachePrefix}${file._id}`;
      const cacheData = {
        ...(file.toObject ? file.toObject() : file),
        cached: true,
        cachedAt: new Date().toISOString(),
      };

      // ✅ UTILISER LA BONNE MÉTHODE REDIS
      if (typeof this.redisClient.setex === "function") {
        await this.redisClient.setex(
          cacheKey,
          this.defaultTTL,
          JSON.stringify(cacheData)
        );
      } else if (typeof this.redisClient.set === "function") {
        await this.redisClient.set(
          cacheKey,
          JSON.stringify(cacheData),
          "EX",
          this.defaultTTL
        );
      } else {
        console.warn("⚠️ Redis client ne supporte ni setex ni set");
        return false;
      }

      return true;
    } catch (error) {
      console.warn(`⚠️ Erreur cache fichier ${file._id}:`, error.message);
      return false;
    }
  }

  async _getCachedFile(fileId) {
    try {
      const cacheKey = `${this.cachePrefix}${fileId}`;
      const cached = await this.redisClient.get(cacheKey);

      if (!cached) {
        return null;
      }

      const data = JSON.parse(cached);

      // Incrémenter les hits du cache dans les métadonnées
      if (data.metadata?.redisMetadata) {
        data.metadata.redisMetadata.cacheHits =
          (data.metadata.redisMetadata.cacheHits || 0) + 1;
      }

      return data;
    } catch (error) {
      console.warn(`⚠️ Erreur lecture cache ${fileId}:`, error.message);
      return null;
    }
  }

  // ✅ S'ASSURER QUE _publishFileEvent N'INTERFÈRE PAS
  async _publishFileEvent(eventType, file, additionalData = {}) {
    try {
      if (!this.kafkaProducer) {
        console.warn("⚠️ Aucun producer Kafka disponible");
        return false;
      }

      if (typeof this.kafkaProducer.publishMessage !== "function") {
        console.warn(
          "⚠️ Méthode publishMessage non disponible sur le producer"
        );
        return false;
      }

      const eventData = {
        eventType,
        fileId: file._id?.toString(),
        fileName: file.originalName,
        fileSize: file.size,
        mimeType: file.mimeType,
        uploadedBy: file.uploadedBy,
        conversationId: file.conversationId?.toString(),
        status: file.status,
        timestamp: new Date().toISOString(),
        serverId: process.env.SERVER_ID || "chat-file-1",
        ...additionalData,
      };

      // ✅ PUBLIER SEULEMENT SUR KAFKA EXTERNE, PAS SUR LE MODÈLE
      const result = await this.kafkaProducer.publishMessage(eventData);

      if (result) {
        this.metrics.kafkaEvents++;
        console.log(`📤 Événement Kafka publié: ${eventType}`);
        return true;
      } else {
        console.warn(`⚠️ Échec publication Kafka: ${eventType}`);
        return false;
      }
    } catch (error) {
      this.metrics.kafkaErrors++;
      console.error(`❌ Erreur publication Kafka ${eventType}:`, error.message);
      return false;
    }
  }

  async _invalidateFileCache(fileId) {
    try {
      const cacheKey = `${this.cachePrefix}${fileId}`;
      await this.redisClient.del(cacheKey);
      console.log(`🗑️ Cache invalidé: ${fileId}`);
      return true;
    } catch (error) {
      console.warn(`⚠️ Erreur invalidation ${fileId}:`, error.message);
      return false;
    }
  }

  async _invalidateConversationFilesCache(conversationId) {
    try {
      const pattern = `${this.cachePrefix}conv:${conversationId}:*`;
      const keys = await this.redisClient.keys(pattern);

      if (keys.length > 0) {
        await this.redisClient.del(keys);
        console.log(
          `🗑️ Cache conversation invalidé: ${conversationId} (${keys.length} clés)`
        );
      }

      return true;
    } catch (error) {
      console.warn(
        `⚠️ Erreur invalidation conversation ${conversationId}:`,
        error.message
      );
      return false;
    }
  }

  async _invalidateUserFilesCache(userId) {
    try {
      const pattern = `${this.cachePrefix}uploader:${userId}:*`;
      const keys = await this.redisClient.keys(pattern);

      if (keys.length > 0) {
        await this.redisClient.del(keys);
        console.log(
          `🗑️ Cache utilisateur invalidé: ${userId} (${keys.length} clés)`
        );
      }

      return true;
    } catch (error) {
      console.warn(
        `⚠️ Erreur invalidation utilisateur ${userId}:`,
        error.message
      );
      return false;
    }
  }

  _formatFileSize(bytes) {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  _groupByType(files) {
    const grouped = {};

    files.forEach((file) => {
      const type = file.metadata?.technical?.fileType || "UNKNOWN";

      if (!grouped[type]) {
        grouped[type] = {
          count: 0,
          totalSize: 0,
          files: [],
        };
      }

      grouped[type].count++;
      grouped[type].totalSize += file.size;
      grouped[type].files.push({
        id: file._id,
        name: file.originalName,
        size: file.size,
      });
    });

    // Ajouter des statistiques calculées
    Object.keys(grouped).forEach((type) => {
      grouped[type].averageSize = grouped[type].totalSize / grouped[type].count;
      grouped[type].formattedTotalSize = this._formatFileSize(
        grouped[type].totalSize
      );
      grouped[type].formattedAverageSize = this._formatFileSize(
        grouped[type].averageSize
      );
    });

    return grouped;
  }

  // ================================
  // MÉTHODES DE MONITORING
  // ================================

  getMetrics() {
    return {
      ...this.metrics,
      cacheHitRate:
        this.metrics.cacheHits + this.metrics.cacheMisses > 0
          ? (
              (this.metrics.cacheHits /
                (this.metrics.cacheHits + this.metrics.cacheMisses)) *
              100
            ).toFixed(2) + "%"
          : "0%",
      kafkaSuccessRate:
        this.metrics.kafkaEvents + this.metrics.kafkaErrors > 0
          ? (
              (this.metrics.kafkaEvents /
                (this.metrics.kafkaEvents + this.metrics.kafkaErrors)) *
              100
            ).toFixed(2) + "%"
          : "0%",
      generatedAt: new Date().toISOString(),
    };
  }

  resetMetrics() {
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      kafkaEvents: 0,
      kafkaErrors: 0,
      dbQueries: 0,
      errors: 0,
    };
  }

  async healthCheck() {
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      checks: {},
    };

    // Test Redis
    if (this.redisClient) {
      try {
        await this.redisClient.ping();
        health.checks.redis = "healthy";
      } catch (error) {
        health.checks.redis = "unhealthy";
        health.status = "degraded";
      }
    } else {
      health.checks.redis = "disabled";
    }

    // Test Kafka
    if (this.kafkaProducer) {
      try {
        // Test basique de connectivité
        health.checks.kafka = "healthy"; // Améliorer avec un vrai test
      } catch (error) {
        health.checks.kafka = "unhealthy";
        health.status = "degraded";
      }
    } else {
      health.checks.kafka = "disabled";
    }

    // Test MongoDB
    try {
      await FileModel.findOne().limit(1);
      health.checks.mongodb = "healthy";
    } catch (error) {
      health.checks.mongodb = "unhealthy";
      health.status = "unhealthy";
    }

    health.metrics = this.getMetrics();

    return health;
  }

  // ✅ NOUVELLE MÉTHODE POUR TRAITEMENT ASYNCHRONE
  async processThumbnailsAsync(savedFile) {
    try {
      console.log(
        `🖼️ Début génération thumbnails pour ${savedFile.originalName}`
      );

      // Télécharger l'image depuis MinIO/SFTP
      const tempImagePath =
        await this.thumbnailService.downloadImageForProcessing(savedFile.path);

      // Générer les thumbnails
      const thumbnails = await this.thumbnailService.generateThumbnails(
        tempImagePath,
        savedFile.originalName,
        savedFile._id
      );

      // Mettre à jour le fichier en base avec les thumbnails
      await this.updateThumbnails(savedFile._id, thumbnails);

      // Nettoyer le fichier temporaire
      await fs.unlink(tempImagePath);

      console.log(`✅ Thumbnails générés et sauvegardés pour ${savedFile._id}`);
    } catch (error) {
      // Marquer le traitement comme échoué
      await this.markThumbnailProcessingFailed(savedFile._id, error);
      console.error(`❌ Échec génération thumbnails ${savedFile._id}:`, error);
    }
  }

  // ✅ NOUVELLE MÉTHODE POUR METTRE À JOUR LES THUMBNAILS
  async updateThumbnails(fileId, thumbnails) {
    try {
      const updateData = {
        "metadata.processing.thumbnailGenerated": true,
        "metadata.processing.thumbnails": thumbnails,
        "metadata.processing.status": "completed",
        "metadata.processing.processed": true,
        "metadata.processing.processedAt": new Date(),
        // URL du thumbnail principal (medium par défaut)
        "metadata.processing.thumbnailUrl":
          thumbnails.find((t) => t.size === "medium")?.url ||
          thumbnails[0]?.url,
        updatedAt: new Date(),
      };

      const updatedFile = await FileModel.findByIdAndUpdate(
        fileId,
        { $set: updateData },
        { new: true }
      );

      // Invalider le cache
      if (this.redisClient) {
        await this._invalidateFileCache(fileId);
      }

      // Publier événement Kafka
      if (this.kafkaProducer) {
        await this._publishFileEvent("THUMBNAILS_GENERATED", updatedFile, {
          thumbnailCount: thumbnails.length,
          sizes: thumbnails.map((t) => t.size),
        });
      }

      return updatedFile;
    } catch (error) {
      console.error(`❌ Erreur mise à jour thumbnails ${fileId}:`, error);
      throw error;
    }
  }

  // ✅ NOUVELLE MÉTHODE POUR MARQUER L'ÉCHEC
  async markThumbnailProcessingFailed(fileId, error) {
    try {
      await FileModel.findByIdAndUpdate(fileId, {
        $set: {
          "metadata.processing.status": "failed",
          "metadata.processing.processingErrors": [error.message],
          updatedAt: new Date(),
        },
      });
    } catch (updateError) {
      console.error(
        `❌ Erreur marking thumbnail failed ${fileId}:`,
        updateError
      );
    }
  }
}

module.exports = MongoFileRepository;
