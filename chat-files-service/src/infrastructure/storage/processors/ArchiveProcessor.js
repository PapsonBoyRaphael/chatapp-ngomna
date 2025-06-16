/**
 * Archive Processor - Infrastructure
 * CENADI Chat-Files-Service
 */

const archiver = require('archiver');
const unzipper = require('unzipper');
const tar = require('tar-stream');
const zlib = require('zlib');
const path = require('path');
const fs = require('fs').promises;
const { createLogger } = require('../../../shared/utils/logger');
const { PassThrough } = require('stream');

const logger = createLogger('ArchiveProcessor');

class ArchiveProcessor {
  constructor(options = {}) {
    this.options = {
      enableExtraction: true,
      enableCreation: true,
      enableListOnly: true,
      maxFileSize: 500 * 1024 * 1024, // 500MB max
      maxFiles: 10000, // 10k fichiers max
      maxDepth: 20, // Profondeur max des dossiers
      passwordProtected: false,
      compression: {
        level: 6, // 0-9
        algorithm: 'gzip'
      },
      extractLimits: {
        maxFileSize: 50 * 1024 * 1024, // 50MB par fichier extrait
        maxTotalSize: 1000 * 1024 * 1024, // 1GB total
        allowedExtensions: null // null = tous, sinon array des extensions autorisées
      },
      ...options
    };

    this.supportedFormats = {
      zip: ['application/zip', 'application/x-zip-compressed'],
      tar: ['application/x-tar'],
      'tar.gz': ['application/gzip', 'application/x-gzip'],
      'tar.bz2': ['application/x-bzip2'],
      rar: ['application/vnd.rar', 'application/x-rar-compressed'],
      '7z': ['application/x-7z-compressed']
    };

    this.metrics = this.initializeMetrics();
    this.tempDir = path.join(__dirname, '../../../../temp/archives');

    // S'assurer que le dossier temp existe
    this.ensureTempDir();

    logger.info('📦 ArchiveProcessor créé', {
      supportedFormats: Object.keys(this.supportedFormats).length,
      enableExtraction: this.options.enableExtraction,
      enableCreation: this.options.enableCreation
    });
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.warn('⚠️ Impossible de créer le dossier temp archives:', { error: error.message });
    }
  }

  // Vérifier si le fichier est une archive
  isArchiveFile(mimeType, fileName) {
    if (mimeType) {
      return Object.values(this.supportedFormats).some(mimeTypes => 
        mimeTypes.includes(mimeType)
      );
    }

    const extension = this.getFileExtension(fileName).toLowerCase();
    return Object.keys(this.supportedFormats).includes(extension);
  }

  // Détecter le type d'archive
  detectArchiveType(mimeType, fileName) {
    // Par MIME type
    for (const [type, mimeTypes] of Object.entries(this.supportedFormats)) {
      if (mimeTypes.includes(mimeType)) {
        return type;
      }
    }

    // Par extension
    const extension = this.getFileExtension(fileName).toLowerCase();
    if (Object.keys(this.supportedFormats).includes(extension)) {
      return extension;
    }

    return 'unknown';
  }

  getFileExtension(fileName) {
    const name = fileName.toLowerCase();
    
    // Extensions composées
    if (name.endsWith('.tar.gz')) return 'tar.gz';
    if (name.endsWith('.tar.bz2')) return 'tar.bz2';
    
    // Extensions simples
    return path.extname(name).substring(1);
  }

  // Traitement principal d'une archive
  async processArchive(archiveBuffer, options = {}) {
    const startTime = Date.now();
    const archiveType = this.detectArchiveType(options.mimeType, options.fileName || '');

    try {
      logger.info('🔄 Traitement archive démarré:', {
        type: archiveType,
        size: archiveBuffer.length,
        fileName: options.fileName
      });

      // Validation
      this.validateArchive(archiveBuffer, archiveType, options);

      // Traitement selon le type
      const result = await this.processArchiveByType(archiveBuffer, archiveType, options);

      const duration = Date.now() - startTime;
      this.updateMetrics(archiveType, 'processed', duration, archiveBuffer.length, true);

      logger.info('✅ Archive traitée avec succès:', {
        type: archiveType,
        originalSize: archiveBuffer.length,
        filesCount: result.contents?.length || 0,
        extractedCount: result.extracted?.length || 0,
        duration: `${Math.round(duration / 1000)}s`
      });

      return {
        type: archiveType,
        ...result,
        processingTime: duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics(archiveType, 'processed', duration, archiveBuffer.length, false);

      logger.error('❌ Erreur traitement archive:', {
        type: archiveType,
        error: error.message,
        duration
      });

      throw error;
    }
  }

  // Validation de l'archive
  validateArchive(archiveBuffer, archiveType, options) {
    const validationErrors = [];

    // Taille de fichier
    if (archiveBuffer.length > this.options.maxFileSize) {
      validationErrors.push(`Archive trop volumineuse: ${Math.round(archiveBuffer.length / 1024 / 1024)}MB > ${Math.round(this.options.maxFileSize / 1024 / 1024)}MB`);
    }

    // Buffer non vide
    if (archiveBuffer.length === 0) {
      validationErrors.push('Archive vide');
    }

    // Type supporté
    if (archiveType === 'unknown') {
      validationErrors.push('Type d\'archive non supporté');
    }

    if (validationErrors.length > 0) {
      throw new Error(`Validation archive échouée: ${validationErrors.join(', ')}`);
    }
  }

  // Traitement selon le type d'archive
  async processArchiveByType(archiveBuffer, archiveType, options) {
    switch (archiveType) {
      case 'zip':
        return await this.processZip(archiveBuffer, options);
      case 'tar':
        return await this.processTar(archiveBuffer, options);
      case 'tar.gz':
        return await this.processTarGz(archiveBuffer, options);
      case 'tar.bz2':
        return await this.processTarBz2(archiveBuffer, options);
      case 'rar':
        return await this.processRar(archiveBuffer, options);
      case '7z':
        return await this.process7z(archiveBuffer, options);
      default:
        throw new Error(`Type d'archive non supporté: ${archiveType}`);
    }
  }

  // Traitement ZIP
  async processZip(zipBuffer, options = {}) {
    try {
      logger.debug('📦 Traitement ZIP...');

      const result = {
        metadata: {},
        contents: [],
        extracted: []
      };

      // Analyse de l'archive
      const directory = await unzipper.Open.buffer(zipBuffer);
      
      result.metadata = {
        filesCount: directory.files.length,
        size: zipBuffer.length,
        comment: directory.comment || null
      };

      // Validation du nombre de fichiers
      if (directory.files.length > this.options.maxFiles) {
        throw new Error(`Trop de fichiers dans l'archive: ${directory.files.length} > ${this.options.maxFiles}`);
      }

      let totalUncompressedSize = 0;

      // Parcourir les fichiers
      for (const file of directory.files) {
        const fileInfo = {
          path: file.path,
          size: file.uncompressedSize,
          compressedSize: file.compressedSize,
          isDirectory: file.type === 'Directory',
          lastModified: file.lastModifiedDateTime,
          crc32: file.crc32,
          compression: file.compressionMethod
        };

        result.contents.push(fileInfo);
        totalUncompressedSize += file.uncompressedSize;

        // Vérifier les limites
        if (totalUncompressedSize > this.options.extractLimits.maxTotalSize) {
          logger.warn('⚠️ Limite de taille totale atteinte, arrêt de l\'extraction');
          break;
        }

        // Extraire si demandé et si pas un dossier
        if (this.options.enableExtraction && !file.type === 'Directory') {
          try {
            const extracted = await this.extractZipFile(file, fileInfo);
            if (extracted) {
              result.extracted.push(extracted);
            }
          } catch (extractError) {
            logger.warn('⚠️ Erreur extraction fichier ZIP:', { 
              path: file.path, 
              error: extractError.message 
            });
          }
        }
      }

      result.metadata.totalUncompressedSize = totalUncompressedSize;
      result.metadata.compressionRatio = totalUncompressedSize > 0 
        ? Math.round((1 - zipBuffer.length / totalUncompressedSize) * 100) 
        : 0;

      this.updateMetrics('zip', 'extracted', 0, result.extracted.length, true);
      return result;

    } catch (error) {
      logger.error('❌ Erreur traitement ZIP:', { error: error.message });
      throw error;
    }
  }

  // Extraction d'un fichier ZIP
  async extractZipFile(zipFile, fileInfo) {
    try {
      // Vérifications de sécurité
      if (!this.isFileAllowed(fileInfo.path)) {
        logger.warn('⚠️ Fichier non autorisé ignoré:', { path: fileInfo.path });
        return null;
      }

      if (fileInfo.size > this.options.extractLimits.maxFileSize) {
        logger.warn('⚠️ Fichier trop volumineux ignoré:', { 
          path: fileInfo.path, 
          size: fileInfo.size 
        });
        return null;
      }

      // Validation du chemin (sécurité)
      if (this.isPathTraversal(fileInfo.path)) {
        logger.warn('⚠️ Tentative de path traversal détectée:', { path: fileInfo.path });
        return null;
      }

      // Extraction
      const buffer = await zipFile.buffer();

      return {
        path: fileInfo.path,
        buffer: buffer,
        size: buffer.length,
        originalSize: fileInfo.size,
        metadata: fileInfo
      };

    } catch (error) {
      logger.error('❌ Erreur extraction fichier ZIP:', { 
        path: fileInfo.path, 
        error: error.message 
      });
      return null;
    }
  }

  // Traitement TAR
  async processTar(tarBuffer, options = {}) {
    try {
      logger.debug('📦 Traitement TAR...');

      const result = {
        metadata: {},
        contents: [],
        extracted: []
      };

      const extract = tar.extract();
      let filesCount = 0;
      let totalSize = 0;

      return new Promise((resolve, reject) => {
        extract.on('entry', async (header, stream, next) => {
          try {
            filesCount++;
            totalSize += header.size || 0;

            const fileInfo = {
              path: header.name,
              size: header.size || 0,
              isDirectory: header.type === 'directory',
              mode: header.mode,
              uid: header.uid,
              gid: header.gid,
              lastModified: header.mtime
            };

            result.contents.push(fileInfo);

            // Validation
            if (filesCount > this.options.maxFiles) {
              stream.destroy();
              reject(new Error(`Trop de fichiers: ${filesCount} > ${this.options.maxFiles}`));
              return;
            }

            if (totalSize > this.options.extractLimits.maxTotalSize) {
              stream.destroy();
              reject(new Error(`Archive trop volumineuse: ${totalSize} > ${this.options.extractLimits.maxTotalSize}`));
              return;
            }

            // Extraction si demandée
            if (this.options.enableExtraction && header.type === 'file') {
              if (this.isFileAllowed(header.name) && 
                  !this.isPathTraversal(header.name) &&
                  (header.size || 0) <= this.options.extractLimits.maxFileSize) {
                
                const chunks = [];
                stream.on('data', chunk => chunks.push(chunk));
                stream.on('end', () => {
                  const buffer = Buffer.concat(chunks);
                  result.extracted.push({
                    path: header.name,
                    buffer: buffer,
                    size: buffer.length,
                    metadata: fileInfo
                  });
                });
              }
            }

            stream.on('end', next);
            stream.resume();

          } catch (error) {
            stream.destroy();
            next(error);
          }
        });

        extract.on('finish', () => {
          result.metadata = {
            filesCount,
            totalSize,
            size: tarBuffer.length,
            compressionRatio: 0 // TAR non compressé
          };

          this.updateMetrics('tar', 'extracted', 0, result.extracted.length, true);
          resolve(result);
        });

        extract.on('error', reject);

        // Alimenter le stream
        const stream = new PassThrough();
        stream.end(tarBuffer);
        stream.pipe(extract);
      });

    } catch (error) {
      logger.error('❌ Erreur traitement TAR:', { error: error.message });
      throw error;
    }
  }

  // Traitement TAR.GZ
  async processTarGz(tarGzBuffer, options = {}) {
    try {
      logger.debug('📦 Traitement TAR.GZ...');

      // Décompresser d'abord avec gzip
      const tarBuffer = await new Promise((resolve, reject) => {
        const chunks = [];
        const gunzip = zlib.createGunzip();
        
        gunzip.on('data', chunk => chunks.push(chunk));
        gunzip.on('end', () => resolve(Buffer.concat(chunks)));
        gunzip.on('error', reject);
        
        gunzip.end(tarGzBuffer);
      });

      // Traiter le TAR décompressé
      const result = await this.processTar(tarBuffer, options);
      
      // Ajouter les infos de compression
      result.metadata.originalSize = tarGzBuffer.length;
      result.metadata.uncompressedSize = tarBuffer.length;
      result.metadata.compressionRatio = Math.round((1 - tarGzBuffer.length / tarBuffer.length) * 100);

      return result;

    } catch (error) {
      logger.error('❌ Erreur traitement TAR.GZ:', { error: error.message });
      throw error;
    }
  }

  // Traitement TAR.BZ2
  async processTarBz2(tarBz2Buffer, options = {}) {
    try {
      logger.debug('📦 Traitement TAR.BZ2...');
      
      // Note: Pour BZ2, il faudrait une librairie comme 'bzip2' ou 'compressjs'
      // Ici on simule
      throw new Error('TAR.BZ2 non implémenté dans cette simulation');

    } catch (error) {
      logger.error('❌ Erreur traitement TAR.BZ2:', { error: error.message });
      throw error;
    }
  }

  // Traitement RAR
  async processRar(rarBuffer, options = {}) {
    try {
      logger.debug('📦 Traitement RAR...');
      
      // Note: RAR nécessite une librairie spécialisée ou un binaire externe
      // Ici on simule
      throw new Error('RAR non implémenté dans cette simulation');

    } catch (error) {
      logger.error('❌ Erreur traitement RAR:', { error: error.message });
      throw error;
    }
  }

  // Traitement 7Z
  async process7z(sevenZBuffer, options = {}) {
    try {
      logger.debug('📦 Traitement 7Z...');
      
      // Note: 7Z nécessite une librairie spécialisée comme 'node-7z'
      // Ici on simule
      throw new Error('7Z non implémenté dans cette simulation');

    } catch (error) {
      logger.error('❌ Erreur traitement 7Z:', { error: error.message });
      throw error;
    }
  }

  // Création d'archives
  async createArchive(files, archiveType = 'zip', options = {}) {
    const startTime = Date.now();

    try {
      logger.info('📦 Création archive démarrée:', {
        type: archiveType,
        filesCount: files.length
      });

      let result;

      switch (archiveType) {
        case 'zip':
          result = await this.createZip(files, options);
          break;
        case 'tar':
          result = await this.createTar(files, options);
          break;
        case 'tar.gz':
          result = await this.createTarGz(files, options);
          break;
        default:
          throw new Error(`Type d'archive non supporté pour la création: ${archiveType}`);
      }

      const duration = Date.now() - startTime;
      this.updateMetrics(archiveType, 'created', duration, result.size, true);

      logger.info('✅ Archive créée avec succès:', {
        type: archiveType,
        size: result.size,
        filesCount: files.length,
        duration: `${Math.round(duration / 1000)}s`
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics(archiveType, 'created', duration, 0, false);

      logger.error('❌ Erreur création archive:', {
        type: archiveType,
        error: error.message,
        duration
      });

      throw error;
    }
  }

  // Création ZIP
  async createZip(files, options = {}) {
    return new Promise((resolve, reject) => {
      const archive = archiver('zip', {
        zlib: { level: this.options.compression.level }
      });

      const chunks = [];
      
      archive.on('data', chunk => chunks.push(chunk));
      archive.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          buffer,
          size: buffer.length,
          type: 'zip',
          filesCount: files.length
        });
      });
      archive.on('error', reject);

      // Ajouter les fichiers
      for (const file of files) {
        if (file.buffer) {
          archive.append(file.buffer, { name: file.path });
        } else if (file.content) {
          archive.append(file.content, { name: file.path });
        }
      }

      archive.finalize();
    });
  }

  // Création TAR
  async createTar(files, options = {}) {
    return new Promise((resolve, reject) => {
      const pack = tar.pack();
      const chunks = [];

      pack.on('data', chunk => chunks.push(chunk));
      pack.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          buffer,
          size: buffer.length,
          type: 'tar',
          filesCount: files.length
        });
      });
      pack.on('error', reject);

      // Ajouter les fichiers
      for (const file of files) {
        const entry = pack.entry({
          name: file.path,
          size: file.buffer ? file.buffer.length : Buffer.byteLength(file.content || '')
        });

        if (file.buffer) {
          entry.end(file.buffer);
        } else if (file.content) {
          entry.end(file.content);
        } else {
          entry.end();
        }
      }

      pack.finalize();
    });
  }

  // Création TAR.GZ
  async createTarGz(files, options = {}) {
    const tarResult = await this.createTar(files, options);
    
    return new Promise((resolve, reject) => {
      const chunks = [];
      const gzip = zlib.createGzip({ level: this.options.compression.level });
      
      gzip.on('data', chunk => chunks.push(chunk));
      gzip.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          buffer,
          size: buffer.length,
          type: 'tar.gz',
          filesCount: files.length,
          uncompressedSize: tarResult.size,
          compressionRatio: Math.round((1 - buffer.length / tarResult.size) * 100)
        });
      });
      gzip.on('error', reject);
      
      gzip.end(tarResult.buffer);
    });
  }

  // Utilitaires de sécurité
  isFileAllowed(filePath) {
    if (!this.options.extractLimits.allowedExtensions) {
      return true; // Tous les fichiers autorisés
    }

    const extension = path.extname(filePath).toLowerCase().substring(1);
    return this.options.extractLimits.allowedExtensions.includes(extension);
  }

  isPathTraversal(filePath) {
    // Vérifier les tentatives de path traversal
    const normalizedPath = path.normalize(filePath);
    return normalizedPath.includes('..') || 
           normalizedPath.startsWith('/') || 
           normalizedPath.includes('\\..\\') ||
           normalizedPath.match(/^[a-zA-Z]:\\/); // Windows absolute path
  }

  // Métriques
  initializeMetrics() {
    return {
      processed: new Map(),
      extracted: new Map(),
      created: new Map(),
      totalArchives: 0,
      totalFilesExtracted: 0,
      totalArchivesCreated: 0,
      totalProcessingTime: 0
    };
  }

  updateMetrics(archiveType, operation, duration = 0, size = 0, success = true) {
    const metricKey = `${archiveType}_${operation}`;
    const current = this.metrics[operation].get(metricKey) || { 
      count: 0, 
      totalDuration: 0, 
      totalSize: 0, 
      success: 0, 
      failed: 0 
    };

    current.count++;
    current.totalDuration += duration;
    current.totalSize += size;

    if (success) {
      current.success++;
    } else {
      current.failed++;
    }

    this.metrics[operation].set(metricKey, current);

    // Métriques globales
    if (operation === 'processed') {
      this.metrics.totalArchives++;
      this.metrics.totalProcessingTime += duration;
    } else if (operation === 'extracted') {
      this.metrics.totalFilesExtracted += size;
    } else if (operation === 'created') {
      this.metrics.totalArchivesCreated++;
    }
  }

  getMetrics() {
    const summary = {
      overview: {
        totalArchives: this.metrics.totalArchives,
        totalFilesExtracted: this.metrics.totalFilesExtracted,
        totalArchivesCreated: this.metrics.totalArchivesCreated,
        averageProcessingTime: this.metrics.totalArchives > 0 
          ? Math.round(this.metrics.totalProcessingTime / this.metrics.totalArchives) 
          : 0
      },
      byArchiveType: {},
      byOperation: {}
    };

    // Métriques par type d'archive
    Object.keys(this.supportedFormats).forEach(archiveType => {
      const processed = this.metrics.processed.get(`${archiveType}_processed`) || { count: 0, success: 0, failed: 0 };
      const extracted = this.metrics.extracted.get(`${archiveType}_extracted`) || { count: 0, totalSize: 0 };
      const created = this.metrics.created.get(`${archiveType}_created`) || { count: 0, success: 0 };

      summary.byArchiveType[archiveType] = {
        processed: processed.count,
        extracted: extracted.totalSize,
        created: created.count,
        successRate: processed.count > 0 ? Math.round((processed.success / processed.count) * 100) : 0
      };
    });

    return summary;
  }

  // Nettoyage
  async cleanup() {
    logger.info('🧹 Nettoyage ArchiveProcessor...');
    
    try {
      // Nettoyer le dossier temporaire
      const files = await fs.readdir(this.tempDir);
      for (const file of files) {
        try {
          await fs.unlink(path.join(this.tempDir, file));
        } catch (error) {
          logger.warn('⚠️ Impossible de supprimer fichier temp archive:', { 
            file, 
            error: error.message 
          });
        }
      }
    } catch (error) {
      logger.warn('⚠️ Erreur nettoyage dossier temp archives:', { error: error.message });
    }

    logger.info('✅ ArchiveProcessor nettoyé');
  }
}

module.exports = ArchiveProcessor;
