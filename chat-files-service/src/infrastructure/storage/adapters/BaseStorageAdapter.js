/**
 * Base Storage Adapter - Infrastructure
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('BaseStorageAdapter');

class BaseStorageAdapter {
  constructor(config = {}) {
    this.config = {
      region: 'us-east-1',
      bucket: 'chat-files-default',
      enableEncryption: true,
      enableVersioning: false,
      enableCompression: false,
      enableMetadata: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      allowedMimeTypes: [],
      ...config
    };

    this.isConnected = false;
    this.metrics = this.initializeMetrics();

    logger.info('🗄️ BaseStorageAdapter créé', {
      type: this.constructor.name,
      bucket: this.config.bucket
    });
  }

  // Méthodes à implémenter dans les sous-classes
  async connect() {
    throw new Error('connect() doit être implémentée');
  }

  async disconnect() {
    throw new Error('disconnect() doit être implémentée');
  }

  async upload(fileBuffer, key, options = {}) {
    throw new Error('upload() doit être implémentée');
  }

  async download(key, options = {}) {
    throw new Error('download() doit être implémentée');
  }

  async delete(key, options = {}) {
    throw new Error('delete() doit être implémentée');
  }

  async exists(key) {
    throw new Error('exists() doit être implémentée');
  }

  async getMetadata(key) {
    throw new Error('getMetadata() doit être implémentée');
  }

  async list(prefix = '', options = {}) {
    throw new Error('list() doit être implémentée');
  }

  // Méthodes communes

  // Validation des fichiers
  validateFile(fileBuffer, fileName, options = {}) {
    const validationErrors = [];

    // Taille du fichier
    if (fileBuffer.length > this.config.maxFileSize) {
      validationErrors.push(`Fichier trop volumineux: ${fileBuffer.length} > ${this.config.maxFileSize}`);
    }

    if (fileBuffer.length === 0) {
      validationErrors.push('Fichier vide');
    }

    // Type MIME si spécifié
    if (this.config.allowedMimeTypes.length > 0 && options.mimeType) {
      if (!this.config.allowedMimeTypes.includes(options.mimeType)) {
        validationErrors.push(`Type MIME non autorisé: ${options.mimeType}`);
      }
    }

    // Nom du fichier
    if (!fileName || fileName.trim().length === 0) {
      validationErrors.push('Nom de fichier requis');
    }

    if (fileName.length > 255) {
      validationErrors.push('Nom de fichier trop long');
    }

    // Caractères dangereux
    const dangerousChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (dangerousChars.test(fileName)) {
      validationErrors.push('Nom de fichier contient des caractères non autorisés');
    }

    if (validationErrors.length > 0) {
      throw new Error(`Validation échouée: ${validationErrors.join(', ')}`);
    }

    return true;
  }

  // Génération de clés de stockage
  generateStorageKey(fileName, options = {}) {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    
    // Structure: year/month/day/hour/randomId_fileName
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');

    const prefix = options.prefix || 'files';
    const sanitizedFileName = this.sanitizeFileName(fileName);

    return `${prefix}/${year}/${month}/${day}/${hour}/${timestamp}_${randomId}_${sanitizedFileName}`;
  }

  sanitizeFileName(fileName) {
    return fileName
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .toLowerCase();
  }

  // Calcul de hash pour intégrité
  calculateFileHash(fileBuffer, algorithm = 'md5') {
    const crypto = require('crypto');
    return crypto.createHash(algorithm).update(fileBuffer).digest('hex');
  }

  // Détection du type MIME
  detectMimeType(fileName, fileBuffer) {
    const path = require('path');
    const extension = path.extname(fileName).toLowerCase();

    // Mapping basique des extensions
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.zip': 'application/zip'
    };

    // Détection par extension
    let mimeType = mimeTypes[extension] || 'application/octet-stream';

    // Détection par signature de fichier (magic numbers)
    if (fileBuffer && fileBuffer.length > 0) {
      const signature = fileBuffer.slice(0, 4).toString('hex').toUpperCase();
      
      const signatures = {
        'FFD8FFE0': 'image/jpeg',
        'FFD8FFE1': 'image/jpeg',
        '89504E47': 'image/png',
        '47494638': 'image/gif',
        '25504446': 'application/pdf',
        '504B0304': 'application/zip'
      };

      if (signatures[signature]) {
        mimeType = signatures[signature];
      }
    }

    return mimeType;
  }

  // Compression des fichiers
  async compressFile(fileBuffer, options = {}) {
    if (!this.config.enableCompression) {
      return fileBuffer;
    }

    try {
      const zlib = require('zlib');
      const compressed = await new Promise((resolve, reject) => {
        zlib.gzip(fileBuffer, { level: options.compressionLevel || 6 }, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      logger.debug('📦 Fichier compressé:', {
        originalSize: fileBuffer.length,
        compressedSize: compressed.length,
        ratio: Math.round((1 - compressed.length / fileBuffer.length) * 100)
      });

      return compressed;
    } catch (error) {
      logger.error('❌ Erreur compression:', { error: error.message });
      return fileBuffer; // Retourner l'original en cas d'erreur
    }
  }

  // Décompression des fichiers
  async decompressFile(compressedBuffer, options = {}) {
    if (!this.config.enableCompression || !options.isCompressed) {
      return compressedBuffer;
    }

    try {
      const zlib = require('zlib');
      const decompressed = await new Promise((resolve, reject) => {
        zlib.gunzip(compressedBuffer, (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      return decompressed;
    } catch (error) {
      logger.error('❌ Erreur décompression:', { error: error.message });
      throw error;
    }
  }

  // Chiffrement des fichiers
  async encryptFile(fileBuffer, options = {}) {
    if (!this.config.enableEncryption) {
      return { buffer: fileBuffer, metadata: {} };
    }

    try {
      const crypto = require('crypto');
      const algorithm = 'aes-256-gcm';
      const key = options.encryptionKey || this.generateEncryptionKey();
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipher(algorithm, key);
      cipher.setAAD(Buffer.from('chat-files-service'));

      const encrypted = Buffer.concat([
        cipher.update(fileBuffer),
        cipher.final()
      ]);

      const authTag = cipher.getAuthTag();

      return {
        buffer: encrypted,
        metadata: {
          algorithm,
          iv: iv.toString('hex'),
          authTag: authTag.toString('hex'),
          encrypted: true
        }
      };
    } catch (error) {
      logger.error('❌ Erreur chiffrement:', { error: error.message });
      throw error;
    }
  }

  // Déchiffrement des fichiers
  async decryptFile(encryptedBuffer, metadata, options = {}) {
    if (!metadata.encrypted) {
      return encryptedBuffer;
    }

    try {
      const crypto = require('crypto');
      const key = options.encryptionKey || this.generateEncryptionKey();
      const iv = Buffer.from(metadata.iv, 'hex');
      const authTag = Buffer.from(metadata.authTag, 'hex');

      const decipher = crypto.createDecipher(metadata.algorithm, key);
      decipher.setAAD(Buffer.from('chat-files-service'));
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encryptedBuffer),
        decipher.final()
      ]);

      return decrypted;
    } catch (error) {
      logger.error('❌ Erreur déchiffrement:', { error: error.message });
      throw error;
    }
  }

  generateEncryptionKey() {
    // En production, utiliser une clé depuis les variables d'environnement
    return process.env.FILE_ENCRYPTION_KEY || 'default-encryption-key-change-in-production';
  }

  // Métriques
  initializeMetrics() {
    return {
      uploads: { count: 0, totalSize: 0, totalDuration: 0 },
      downloads: { count: 0, totalSize: 0, totalDuration: 0 },
      deletes: { count: 0, totalDuration: 0 },
      errors: { count: 0 },
      connections: { count: 0, failures: 0 }
    };
  }

  updateMetrics(operation, duration = 0, size = 0, success = true) {
    if (!success) {
      this.metrics.errors.count++;
      return;
    }

    if (this.metrics[operation]) {
      this.metrics[operation].count++;
      this.metrics[operation].totalDuration += duration;
      if (size > 0) {
        this.metrics[operation].totalSize += size;
      }
    }
  }

  getMetrics() {
    const summary = {
      overview: {
        totalUploads: this.metrics.uploads.count,
        totalDownloads: this.metrics.downloads.count,
        totalDeletes: this.metrics.deletes.count,
        totalErrors: this.metrics.errors.count,
        isConnected: this.isConnected
      },
      performance: {},
      storage: {
        totalSizeUploaded: this.metrics.uploads.totalSize,
        totalSizeDownloaded: this.metrics.downloads.totalSize,
        averageUploadSize: this.metrics.uploads.count > 0 
          ? Math.round(this.metrics.uploads.totalSize / this.metrics.uploads.count) 
          : 0,
        averageDownloadSize: this.metrics.downloads.count > 0 
          ? Math.round(this.metrics.downloads.totalSize / this.metrics.downloads.count) 
          : 0
      }
    };

    // Calcul des performances moyennes
    ['uploads', 'downloads', 'deletes'].forEach(operation => {
      const metrics = this.metrics[operation];
      if (metrics.count > 0) {
        summary.performance[operation] = {
          averageDuration: Math.round(metrics.totalDuration / metrics.count),
          totalOperations: metrics.count
        };
      }
    });

    return summary;
  }

  // URL pré-signées (à implémenter dans les sous-classes)
  async generatePresignedUrl(key, operation = 'GET', expiresIn = 3600) {
    throw new Error('generatePresignedUrl() doit être implémentée');
  }

  // Copie entre buckets/containers
  async copy(sourceKey, destinationKey, options = {}) {
    throw new Error('copy() doit être implémentée');
  }

  // Listing avec pagination
  async listPaginated(prefix = '', options = {}) {
    const { limit = 100, continuationToken = null } = options;
    
    const result = await this.list(prefix, {
      limit,
      continuationToken,
      ...options
    });

    return {
      objects: result.objects || [],
      isTruncated: result.isTruncated || false,
      nextContinuationToken: result.nextContinuationToken || null,
      totalCount: result.totalCount || result.objects.length
    };
  }

  // Santé du storage
  async healthCheck() {
    try {
      // Test de connexion basique
      if (!this.isConnected) {
        await this.connect();
      }

      // Test d'écriture/lecture rapide
      const testKey = `health-check-${Date.now()}`;
      const testData = Buffer.from('health-check-data');

      await this.upload(testData, testKey);
      const downloaded = await this.download(testKey);
      await this.delete(testKey);

      const isHealthy = Buffer.compare(testData, downloaded) === 0;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        connected: this.isConnected,
        metrics: this.getMetrics().overview,
        lastCheck: new Date().toISOString()
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message,
        lastCheck: new Date().toISOString()
      };
    }
  }

  // Nettoyage des ressources
  async cleanup() {
    logger.info('🧹 Nettoyage des ressources storage...');
    
    try {
      await this.disconnect();
      logger.info('✅ Ressources storage nettoyées');
    } catch (error) {
      logger.error('❌ Erreur nettoyage storage:', { error: error.message });
      throw error;
    }
  }
}

module.exports = BaseStorageAdapter;
