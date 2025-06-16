/**
 * File Processor - Orchestrateur Principal
 * CENADI Chat-Files-Service
 */

const ImageProcessor = require('./ImageProcessor');
const VideoProcessor = require('./VideoProcessor');
const AudioProcessor = require('./AudioProcessor');
const DocumentProcessor = require('./DocumentProcessor');
const ArchiveProcessor = require('./ArchiveProcessor');
const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('FileProcessor');

class FileProcessor {
  constructor(options = {}) {
    this.options = {
      enableParallelProcessing: true,
      maxConcurrentProcesses: 3,
      enableMetrics: true,
      enableCaching: false,
      processingTimeout: 300000, // 5 minutes timeout
      retryAttempts: 2,
      retryDelay: 1000,
      ...options
    };

    // Initialisation des processeurs spécialisés
    this.processors = {
      image: new ImageProcessor(options.image || {}),
      video: new VideoProcessor(options.video || {}),
      audio: new AudioProcessor(options.audio || {}),
      document: new DocumentProcessor(options.document || {}),
      archive: new ArchiveProcessor(options.archive || {})
    };

    // Mapping des types de fichiers vers les processeurs
    this.processorMapping = {
      'image/jpeg': 'image',
      'image/png': 'image',
      'image/gif': 'image',
      'image/webp': 'image',
      'image/bmp': 'image',
      'image/tiff': 'image',
      'image/svg+xml': 'image',

      'video/mp4': 'video',
      'video/avi': 'video',
      'video/mov': 'video',
      'video/wmv': 'video',
      'video/flv': 'video',
      'video/webm': 'video',
      'video/mkv': 'video',
      'video/3gp': 'video',

      'audio/mp3': 'audio',
      'audio/wav': 'audio',
      'audio/ogg': 'audio',
      'audio/flac': 'audio',
      'audio/aac': 'audio',
      'audio/m4a': 'audio',
      'audio/wma': 'audio',
      'audio/aiff': 'audio',

      'application/pdf': 'document',
      'application/msword': 'document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
      'application/vnd.ms-excel': 'document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
      'application/vnd.ms-powerpoint': 'document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
      'text/plain': 'document',
      'text/html': 'document',
      'text/csv': 'document',

      'application/zip': 'archive',
      'application/x-zip-compressed': 'archive',
      'application/x-tar': 'archive',
      'application/gzip': 'archive',
      'application/x-gzip': 'archive',
      'application/x-bzip2': 'archive',
      'application/vnd.rar': 'archive',
      'application/x-rar-compressed': 'archive',
      'application/x-7z-compressed': 'archive'
    };

    this.metrics = this.initializeMetrics();
    this.activeProcesses = new Map();

    logger.info('🗂️ FileProcessor créé', {
      processorsCount: Object.keys(this.processors).length,
      supportedTypes: Object.keys(this.processorMapping).length,
      enableParallelProcessing: this.options.enableParallelProcessing
    });
  }

  // Traitement principal d'un fichier
  async processFile(fileBuffer, fileInfo, options = {}) {
    const startTime = Date.now();
    const processId = this.generateProcessId();

    try {
      logger.info('🔄 Traitement fichier démarré:', {
        processId,
        fileName: fileInfo.fileName,
        mimeType: fileInfo.mimeType,
        size: fileBuffer.length
      });

      // Ajouter aux processus actifs
      this.activeProcesses.set(processId, {
        fileName: fileInfo.fileName,
        mimeType: fileInfo.mimeType,
        size: fileBuffer.length,
        startTime,
        status: 'processing'
      });

      // Détecter le type et le processeur
      const processorType = this.detectProcessorType(fileInfo.mimeType, fileInfo.fileName);
      
      if (!processorType) {
        throw new Error(`Type de fichier non supporté: ${fileInfo.mimeType || 'unknown'}`);
      }

      // Traitement avec timeout et retry
      const result = await this.processWithRetry(
        fileBuffer, 
        fileInfo, 
        processorType, 
        options, 
        processId
      );

      const duration = Date.now() - startTime;
      this.updateMetrics(processorType, 'success', duration, fileBuffer.length);

      // Mettre à jour le processus
      this.activeProcesses.set(processId, {
        ...this.activeProcesses.get(processId),
        status: 'completed',
        duration
      });

      logger.info('✅ Fichier traité avec succès:', {
        processId,
        processorType,
        fileName: fileInfo.fileName,
        originalSize: fileBuffer.length,
        versionsCount: result.versions?.length || 0,
        duration: `${Math.round(duration / 1000)}s`
      });

      // Nettoyer après un délai
      setTimeout(() => {
        this.activeProcesses.delete(processId);
      }, 60000); // Garder 1 minute pour consultation

      return {
        processId,
        processorType,
        ...result,
        processingTime: duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics('unknown', 'error', duration, fileBuffer.length);

      // Mettre à jour le processus
      this.activeProcesses.set(processId, {
        ...this.activeProcesses.get(processId),
        status: 'failed',
        error: error.message,
        duration
      });

      logger.error('❌ Erreur traitement fichier:', {
        processId,
        fileName: fileInfo.fileName,
        error: error.message,
        duration
      });

      throw error;
    }
  }

  // Traitement avec retry logic
  async processWithRetry(fileBuffer, fileInfo, processorType, options, processId) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.options.retryAttempts + 1; attempt++) {
      try {
        // Ajouter un timeout
        const processingPromise = this.processWithProcessor(
          fileBuffer, 
          fileInfo, 
          processorType, 
          options
        );

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Timeout de traitement atteint: ${this.options.processingTimeout}ms`));
          }, this.options.processingTimeout);
        });

        return await Promise.race([processingPromise, timeoutPromise]);

      } catch (error) {
        lastError = error;
        
        if (attempt <= this.options.retryAttempts) {
          logger.warn(`⚠️ Tentative ${attempt} échouée, retry dans ${this.options.retryDelay}ms:`, {
            processId,
            error: error.message
          });

          // Mettre à jour le statut
          this.activeProcesses.set(processId, {
            ...this.activeProcesses.get(processId),
            status: `retry_${attempt}`,
            lastError: error.message
          });

          await this.sleep(this.options.retryDelay);
        }
      }
    }

    throw lastError;
  }

  // Traitement avec le processeur spécialisé
  async processWithProcessor(fileBuffer, fileInfo, processorType, options) {
    const processor = this.processors[processorType];
    
    if (!processor) {
      throw new Error(`Processeur non trouvé pour le type: ${processorType}`);
    }

    // Méthode de traitement selon le type
    switch (processorType) {
      case 'image':
        return await processor.processImage(fileBuffer, options);
      case 'video':
        return await processor.processVideo(fileBuffer, options);
      case 'audio':
        return await processor.processAudio(fileBuffer, options);
      case 'document':
        return await processor.processDocument(fileBuffer, {
          ...options,
          mimeType: fileInfo.mimeType,
          fileName: fileInfo.fileName
        });
      case 'archive':
        return await processor.processArchive(fileBuffer, {
          ...options,
          mimeType: fileInfo.mimeType,
          fileName: fileInfo.fileName
        });
      default:
        throw new Error(`Type de processeur non supporté: ${processorType}`);
    }
  }

  // Détection du type de processeur
  detectProcessorType(mimeType, fileName) {
    // Par MIME type
    if (mimeType && this.processorMapping[mimeType]) {
      return this.processorMapping[mimeType];
    }

    // Par extension de fichier
    if (fileName) {
      const extension = fileName.split('.').pop().toLowerCase();
      
      // Vérifier dans chaque processeur
      for (const [type, processor] of Object.entries(this.processors)) {
        if (this.isFileTypeSupported(type, mimeType, fileName)) {
          return type;
        }
      }
    }

    return null;
  }

  // Vérifier si un type de fichier est supporté
  isFileTypeSupported(processorType, mimeType, fileName) {
    const processor = this.processors[processorType];
    
    switch (processorType) {
      case 'image':
        return processor.isImageFile(mimeType, fileName);
      case 'video':
        return processor.isVideoFile(mimeType, fileName);
      case 'audio':
        return processor.isAudioFile(mimeType, fileName);
      case 'document':
        return processor.isDocumentFile(mimeType, fileName);
      case 'archive':
        return processor.isArchiveFile(mimeType, fileName);
      default:
        return false;
    }
  }

  // Traitement par lot (batch)
  async processBatch(files, options = {}) {
    const startTime = Date.now();
    const batchId = this.generateProcessId('batch');

    try {
      logger.info('📦 Traitement par lot démarré:', {
        batchId,
        filesCount: files.length
      });

      const results = [];
      const errors = [];

      if (this.options.enableParallelProcessing) {
        // Traitement parallèle avec limite de concurrence
        const chunks = this.chunkArray(files, this.options.maxConcurrentProcesses);
        
        for (const chunk of chunks) {
          const chunkPromises = chunk.map(async (file) => {
            try {
              const result = await this.processFile(file.buffer, file.info, options);
              return { success: true, file: file.info, result };
            } catch (error) {
              return { success: false, file: file.info, error: error.message };
            }
          });

          const chunkResults = await Promise.all(chunkPromises);
          
          chunkResults.forEach(result => {
            if (result.success) {
              results.push(result);
            } else {
              errors.push(result);
            }
          });
        }
      } else {
        // Traitement séquentiel
        for (const file of files) {
          try {
            const result = await this.processFile(file.buffer, file.info, options);
            results.push({ success: true, file: file.info, result });
          } catch (error) {
            errors.push({ success: false, file: file.info, error: error.message });
          }
        }
      }

      const duration = Date.now() - startTime;

      logger.info('✅ Traitement par lot terminé:', {
        batchId,
        totalFiles: files.length,
        successCount: results.length,
        errorCount: errors.length,
        duration: `${Math.round(duration / 1000)}s`
      });

      return {
        batchId,
        totalFiles: files.length,
        successCount: results.length,
        errorCount: errors.length,
        results,
        errors,
        processingTime: duration
      };

    } catch (error) {
      logger.error('❌ Erreur traitement par lot:', {
        batchId,
        error: error.message
      });
      throw error;
    }
  }

  // Création d'archives
  async createArchive(files, archiveType = 'zip', options = {}) {
    try {
      logger.info('📦 Création archive démarrée:', {
        archiveType,
        filesCount: files.length
      });

      const archiveProcessor = this.processors.archive;
      return await archiveProcessor.createArchive(files, archiveType, options);

    } catch (error) {
      logger.error('❌ Erreur création archive:', { error: error.message });
      throw error;
    }
  }

  // Obtenir les informations d'un processus actif
  getProcessInfo(processId) {
    return this.activeProcesses.get(processId);
  }

  // Obtenir tous les processus actifs
  getActiveProcesses() {
    return Array.from(this.activeProcesses.entries()).map(([id, info]) => ({
      processId: id,
      ...info
    }));
  }

  // Annuler un processus (si possible)
  async cancelProcess(processId) {
    const process = this.activeProcesses.get(processId);
    
    if (!process) {
      throw new Error(`Processus non trouvé: ${processId}`);
    }

    if (process.status === 'completed' || process.status === 'failed') {
      throw new Error(`Processus déjà terminé: ${processId}`);
    }

    // Marquer comme annulé
    this.activeProcesses.set(processId, {
      ...process,
      status: 'cancelled',
      cancelledAt: Date.now()
    });

    logger.info('🚫 Processus annulé:', { processId });
    return true;
  }

  // Métriques globales
  getMetrics() {
    const globalMetrics = {
      overview: {
        totalProcessed: this.metrics.totalProcessed,
        totalSuccess: this.metrics.totalSuccess,
        totalErrors: this.metrics.totalErrors,
        averageProcessingTime: this.metrics.totalSuccess > 0 
          ? Math.round(this.metrics.totalProcessingTime / this.metrics.totalSuccess) 
          : 0,
        successRate: this.metrics.totalProcessed > 0 
          ? Math.round((this.metrics.totalSuccess / this.metrics.totalProcessed) * 100) 
          : 0
      },
      activeProcesses: this.activeProcesses.size,
      byProcessor: {}
    };

    // Métriques par processeur
    for (const [type, processor] of Object.entries(this.processors)) {
      try {
        globalMetrics.byProcessor[type] = processor.getMetrics();
      } catch (error) {
        logger.warn(`⚠️ Erreur récupération métriques ${type}:`, { error: error.message });
        globalMetrics.byProcessor[type] = { error: error.message };
      }
    }

    return globalMetrics;
  }

  // Utilitaires
  generateProcessId(prefix = 'proc') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Métriques
  initializeMetrics() {
    return {
      totalProcessed: 0,
      totalSuccess: 0,
      totalErrors: 0,
      totalProcessingTime: 0,
      byProcessor: new Map()
    };
  }

  updateMetrics(processorType, status, duration = 0, size = 0) {
    this.metrics.totalProcessed++;
    
    if (status === 'success') {
      this.metrics.totalSuccess++;
      this.metrics.totalProcessingTime += duration;
    } else {
      this.metrics.totalErrors++;
    }

    // Métriques par processeur
    const processorMetrics = this.metrics.byProcessor.get(processorType) || {
      processed: 0,
      success: 0,
      errors: 0,
      totalTime: 0,
      totalSize: 0
    };

    processorMetrics.processed++;
    processorMetrics.totalTime += duration;
    processorMetrics.totalSize += size;

    if (status === 'success') {
      processorMetrics.success++;
    } else {
      processorMetrics.errors++;
    }

    this.metrics.byProcessor.set(processorType, processorMetrics);
  }

  // Nettoyage
  async cleanup() {
    logger.info('🧹 Nettoyage FileProcessor...');

    // Nettoyer les processeurs spécialisés
    const cleanupPromises = Object.entries(this.processors).map(async ([type, processor]) => {
      try {
        if (processor.cleanup) {
          await processor.cleanup();
        }
      } catch (error) {
        logger.warn(`⚠️ Erreur nettoyage processeur ${type}:`, { error: error.message });
      }
    });

    await Promise.all(cleanupPromises);

    // Nettoyer les processus actifs
    this.activeProcesses.clear();

    logger.info('✅ FileProcessor nettoyé');
  }
}

module.exports = FileProcessor;
