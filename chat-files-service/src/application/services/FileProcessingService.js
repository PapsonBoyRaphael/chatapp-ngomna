/**
 * File Processing Service - Chat Files Service
 * CENADI Chat-Files-Service
 * Service applicatif unique pour le traitement de fichiers
 */

const { createLogger } = require("../../shared/utils/logger");
const fileHelper = require("../../shared/utils/fileHelper");
const {
  ProcessingException,
  UnsupportedFileTypeException,
} = require("../../shared/exceptions");

// Import des processeurs spécialisés
const ImageProcessor = require("../../infrastructure/storage/processors/ImageProcessor");
const VideoProcessor = require("../../infrastructure/storage/processors/VideoProcessor");
const AudioProcessor = require("../../infrastructure/storage/processors/AudioProcessor");
const DocumentProcessor = require("../../infrastructure/storage/processors/DocumentProcessor");
const ArchiveProcessor = require("../../infrastructure/storage/processors/ArchiveProcessor");

const logger = createLogger("FileProcessingService");

class FileProcessingService {
  constructor(options = {}) {
    this.options = {
      maxConcurrentProcessing: options.maxConcurrentProcessing || 5,
      enableThumbnails: options.enableThumbnails !== false,
      enableMetadataExtraction: options.enableMetadataExtraction !== false,
      enableOptimization: options.enableOptimization || false,
      tempDir: options.tempDir || "./temp",
      thumbnailsDir: options.thumbnailsDir || "./storage/thumbnails",
      ...options,
    };

    // Processeurs spécialisés
    this.processors = new Map();
    this.initializeProcessors();

    // Gestion des processus actifs
    this.activeProcesses = new Map();
    this.processingQueue = [];
    this.isProcessing = false;

    // Métriques
    this.metrics = {
      totalProcessed: 0,
      processingTime: [],
      errorCount: 0,
      byType: {},
      queueSize: 0,
    };

    logger.info("🔄 FileProcessingService initialisé", {
      maxConcurrent: this.options.maxConcurrentProcessing,
      enableThumbnails: this.options.enableThumbnails,
      enableMetadata: this.options.enableMetadataExtraction,
    });
  }

  /**
   * Initialiser les processeurs spécialisés
   */
  initializeProcessors() {
    try {
      this.processors.set(
        "image",
        new ImageProcessor({
          enableThumbnails: this.options.enableThumbnails,
          thumbnailsDir: this.options.thumbnailsDir,
          enableOptimization: this.options.enableOptimization,
        })
      );

      this.processors.set(
        "video",
        new VideoProcessor({
          enableThumbnails: this.options.enableThumbnails,
          thumbnailsDir: this.options.thumbnailsDir,
          tempDir: this.options.tempDir,
        })
      );

      this.processors.set(
        "audio",
        new AudioProcessor({
          enableMetadata: this.options.enableMetadataExtraction,
          tempDir: this.options.tempDir,
        })
      );

      this.processors.set(
        "document",
        new DocumentProcessor({
          enableThumbnails: this.options.enableThumbnails,
          enableTextExtraction: this.options.enableMetadataExtraction,
          thumbnailsDir: this.options.thumbnailsDir,
        })
      );

      this.processors.set(
        "archive",
        new ArchiveProcessor({
          tempDir: this.options.tempDir,
          enableAnalysis: this.options.enableMetadataExtraction,
        })
      );

      logger.debug("✅ Processeurs spécialisés initialisés", {
        processorsCount: this.processors.size,
      });
    } catch (error) {
      logger.error("❌ Erreur initialisation processeurs:", error);
      throw new ProcessingException(
        `Erreur initialisation processeurs: ${error.message}`
      );
    }
  }

  /**
   * Traiter un fichier de manière asynchrone
   */
  async processFile(fileBuffer, fileName, options = {}) {
    const startTime = Date.now();
    const processId = `proc_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      logger.info("🔄 Début traitement fichier", {
        processId,
        fileName,
        size: fileBuffer.length,
        options: Object.keys(options),
      });

      // Ajouter à la file d'attente si trop de processus actifs
      if (this.activeProcesses.size >= this.options.maxConcurrentProcessing) {
        return await this.queueProcessing(
          processId,
          fileBuffer,
          fileName,
          options
        );
      }

      // Marquer comme processus actif
      this.activeProcesses.set(processId, {
        fileName,
        startTime,
        status: "processing",
      });

      // Traitement principal
      const result = await this.doProcessFile(
        processId,
        fileBuffer,
        fileName,
        options
      );

      // Mettre à jour les métriques
      const duration = Date.now() - startTime;
      this.updateMetrics(fileName, duration, true);

      logger.info("✅ Traitement fichier terminé", {
        processId,
        fileName,
        duration: `${duration}ms`,
        thumbnails: result.thumbnails?.length || 0,
        metadataKeys: Object.keys(result.metadata || {}).length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics(fileName, duration, false);

      logger.error("❌ Erreur traitement fichier:", {
        processId,
        fileName,
        error: error.message,
        duration: `${duration}ms`,
      });

      throw error;
    } finally {
      // Nettoyer le processus actif
      this.activeProcesses.delete(processId);

      // Traiter la file d'attente si disponible
      this.processQueue();
    }
  }

  /**
   * Logique principale de traitement
   */
  async doProcessFile(processId, fileBuffer, fileName, options = {}) {
    // 1. Déterminer le type de fichier
    const fileCategory = this.getFileCategory(fileName, fileBuffer);
    const processor = this.processors.get(fileCategory);

    if (!processor) {
      throw new UnsupportedFileTypeException(
        `Type de fichier non supporté: ${fileCategory}`
      );
    }

    // 2. Traitement spécialisé
    const processingResult = await processor.process(fileBuffer, fileName, {
      processId,
      ...options,
    });

    // 3. Résultat consolidé
    return {
      category: fileCategory,
      originalSize: fileBuffer.length,
      processedAt: new Date().toISOString(),
      processor: processor.constructor.name,
      ...processingResult,
    };
  }

  /**
   * Déterminer la catégorie d'un fichier
   */
  getFileCategory(fileName, fileBuffer = null) {
    const extension = fileHelper.getFileExtension(fileName).toLowerCase();
    const mimeType = fileHelper.getMimeType(fileName);

    // Images
    const imageExtensions = [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "bmp",
      "webp",
      "svg",
      "tiff",
    ];
    if (imageExtensions.includes(extension) || mimeType.startsWith("image/")) {
      return "image";
    }

    // Vidéos
    const videoExtensions = [
      "mp4",
      "avi",
      "mov",
      "wmv",
      "flv",
      "webm",
      "mkv",
      "m4v",
    ];
    if (videoExtensions.includes(extension) || mimeType.startsWith("video/")) {
      return "video";
    }

    // Audio
    const audioExtensions = ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma"];
    if (audioExtensions.includes(extension) || mimeType.startsWith("audio/")) {
      return "audio";
    }

    // Documents
    const documentExtensions = [
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "txt",
      "rtf",
      "odt",
    ];
    if (
      documentExtensions.includes(extension) ||
      mimeType.includes("pdf") ||
      mimeType.includes("document") ||
      mimeType.includes("text")
    ) {
      return "document";
    }

    // Archives
    const archiveExtensions = ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"];
    if (
      archiveExtensions.includes(extension) ||
      mimeType.includes("zip") ||
      mimeType.includes("compressed")
    ) {
      return "archive";
    }

    // Défaut : traitement générique
    return "document";
  }

  /**
   * Ajouter à la file d'attente
   */
  async queueProcessing(processId, fileBuffer, fileName, options) {
    return new Promise((resolve, reject) => {
      this.processingQueue.push({
        processId,
        fileBuffer,
        fileName,
        options,
        resolve,
        reject,
        queuedAt: Date.now(),
      });

      this.metrics.queueSize = this.processingQueue.length;

      logger.debug("📝 Fichier ajouté à la file d'attente", {
        processId,
        fileName,
        queueSize: this.processingQueue.length,
      });
    });
  }

  /**
   * Traiter la file d'attente
   */
  async processQueue() {
    if (
      this.isProcessing ||
      this.processingQueue.length === 0 ||
      this.activeProcesses.size >= this.options.maxConcurrentProcessing
    ) {
      return;
    }

    this.isProcessing = true;

    try {
      while (
        this.processingQueue.length > 0 &&
        this.activeProcesses.size < this.options.maxConcurrentProcessing
      ) {
        const queueItem = this.processingQueue.shift();
        this.metrics.queueSize = this.processingQueue.length;

        // Traitement asynchrone sans attendre
        this.processFile(
          queueItem.fileBuffer,
          queueItem.fileName,
          queueItem.options
        )
          .then(queueItem.resolve)
          .catch(queueItem.reject);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Mettre à jour les métriques
   */
  updateMetrics(fileName, duration, success) {
    this.metrics.totalProcessed++;
    this.metrics.processingTime.push(duration);

    // Garder seulement les 100 derniers temps
    if (this.metrics.processingTime.length > 100) {
      this.metrics.processingTime.shift();
    }

    if (!success) {
      this.metrics.errorCount++;
    }

    // Métriques par type
    const category = this.getFileCategory(fileName);
    if (!this.metrics.byType[category]) {
      this.metrics.byType[category] = { count: 0, totalTime: 0, errors: 0 };
    }

    this.metrics.byType[category].count++;
    this.metrics.byType[category].totalTime += duration;

    if (!success) {
      this.metrics.byType[category].errors++;
    }
  }

  /**
   * Obtenir les métriques de performance
   */
  getMetrics() {
    const avgTime =
      this.metrics.processingTime.length > 0
        ? this.metrics.processingTime.reduce((a, b) => a + b, 0) /
          this.metrics.processingTime.length
        : 0;

    return {
      totalProcessed: this.metrics.totalProcessed,
      errorCount: this.metrics.errorCount,
      errorRate:
        this.metrics.totalProcessed > 0
          ? (
              (this.metrics.errorCount / this.metrics.totalProcessed) *
              100
            ).toFixed(2) + "%"
          : "0%",
      averageProcessingTime: Math.round(avgTime) + "ms",
      activeProcesses: this.activeProcesses.size,
      queueSize: this.metrics.queueSize,
      byType: Object.entries(this.metrics.byType).map(([type, stats]) => ({
        type,
        count: stats.count,
        averageTime:
          stats.count > 0
            ? Math.round(stats.totalTime / stats.count) + "ms"
            : "0ms",
        errorRate:
          stats.count > 0
            ? ((stats.errors / stats.count) * 100).toFixed(2) + "%"
            : "0%",
      })),
    };
  }

  /**
   * Obtenir le statut des processus actifs
   */
  getActiveProcesses() {
    return Array.from(this.activeProcesses.entries()).map(([id, process]) => ({
      processId: id,
      fileName: process.fileName,
      status: process.status,
      duration: Date.now() - process.startTime,
      startTime: process.startTime,
    }));
  }

  /**
   * Vérifier si un processeur est disponible pour un type
   */
  canProcess(fileCategory) {
    return this.processors.has(fileCategory);
  }

  /**
   * Obtenir les types supportés
   */
  getSupportedTypes() {
    return Array.from(this.processors.keys());
  }

  /**
   * Nettoyer les ressources
   */
  async cleanup() {
    logger.info("🧹 Nettoyage FileProcessingService...");

    try {
      // Attendre que tous les processus actifs se terminent
      const activePromises = Array.from(this.activeProcesses.keys()).map(
        async (processId) => {
          // Attendre max 30 secondes par processus
          const timeout = new Promise((resolve) => setTimeout(resolve, 30000));
          return Promise.race([
            new Promise((resolve) => {
              const checkInterval = setInterval(() => {
                if (!this.activeProcesses.has(processId)) {
                  clearInterval(checkInterval);
                  resolve();
                }
              }, 100);
            }),
            timeout,
          ]);
        }
      );

      await Promise.all(activePromises);

      // Nettoyer les processeurs
      for (const processor of this.processors.values()) {
        if (processor.cleanup) {
          await processor.cleanup();
        }
      }

      // Vider la file d'attente
      this.processingQueue.forEach((item) => {
        item.reject(new Error("Service fermé"));
      });
      this.processingQueue = [];

      logger.info("✅ FileProcessingService nettoyé");
    } catch (error) {
      logger.warn("⚠️ Erreur nettoyage FileProcessingService:", error);
    }
  }
}

module.exports = FileProcessingService;
