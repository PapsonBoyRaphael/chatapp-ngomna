/**
 * Local Storage Adapter - Chat Files Service
 * CENADI Chat-Files-Service
 * Adaptateur pour stockage local avec fonctionnalités avancées
 */

const BaseStorageAdapter = require('./BaseStorageAdapter');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createLogger } = require('../../../shared/utils/logger');
const { FileNotFoundException, StorageException } = require('../../../shared/exceptions');

const logger = createLogger('LocalStorageAdapter');

class LocalStorageAdapter extends BaseStorageAdapter {
  constructor(options = {}) {
    super(options);
    
    this.options = {
      basePath: options.basePath || process.env.LOCAL_STORAGE_PATH || './storage',
      enableBackup: options.enableBackup || false,
      backupPath: options.backupPath || './storage-backup',
      maxFileSize: options.maxFileSize || 100 * 1024 * 1024, // 100MB
      enableCompression: options.enableCompression || false,
      enableEncryption: options.enableEncryption || false,
      createDirectories: options.createDirectories !== false,
      permissions: options.permissions || 0o755,
      enableSymlinks: options.enableSymlinks || false,
      enableMetadataFiles: options.enableMetadataFiles || true,
      cleanupInterval: options.cleanupInterval || 24 * 60 * 60 * 1000, // 24h
      ...options
    };

    this.basePath = path.resolve(this.options.basePath);
    this.backupPath = path.resolve(this.options.backupPath);
    this.metadataExtension = '.meta.json';

    this.cleanupTimer = null;

    logger.info('💾 LocalStorageAdapter créé', {
      basePath: this.basePath,
      enableBackup: this.options.enableBackup,
      enableCompression: this.options.enableCompression,
      enableEncryption: this.options.enableEncryption
    });
  }

  // === IMPLÉMENTATION DES MÉTHODES ABSTRAITES ===

  async initialize() {
    try {
      // Créer les dossiers de base
      if (this.options.createDirectories) {
        await this.ensureDirectoryExists(this.basePath);
        
        if (this.options.enableBackup) {
          await this.ensureDirectoryExists(this.backupPath);
        }
      }

      // Vérifier les permissions
      await this.checkPermissions();

      // Démarrer le nettoyage automatique
      if (this.options.cleanupInterval > 0) {
        this.startCleanupTimer();
      }

      this.isConnected = true;
      logger.info('✅ LocalStorageAdapter initialisé');
      return true;

    } catch (error) {
      this.isConnected = false;
      logger.error('❌ Erreur initialisation LocalStorageAdapter:', { error: error.message });
      throw new StorageException(`Erreur initialisation storage local: ${error.message}`);
    }
  }

  async upload(fileBuffer, fileName, options = {}) {
    const startTime = Date.now();

    try {
      logger.debug('📤 Upload local démarré:', { fileName, size: fileBuffer.length });

      // Validation
      this.validateFile(fileBuffer, fileName, options);

      // Génération du chemin
      const storageKey = this.generateStorageKey(fileName, options);
      const filePath = this.getFilePath(storageKey);
      const metadataPath = this.getMetadataPath(storageKey);

      // S'assurer que le dossier existe
      await this.ensureDirectoryExists(path.dirname(filePath));

      let processedBuffer = fileBuffer;
      let fileMetadata = {
        ...options.metadata,
        originalSize: fileBuffer.length,
        storedAt: new Date().toISOString(),
        hash: this.calculateETag(fileBuffer),
        contentType: options.contentType || this.getMimeType(fileName)
      };

      // Compression si activée
      if (this.options.enableCompression) {
        const compressed = await this.compressBuffer(processedBuffer);
        if (compressed.length < processedBuffer.length) {
          processedBuffer = compressed;
          fileMetadata.compressed = true;
          fileMetadata.compressedSize = compressed.length;
          fileMetadata.compressionRatio = Math.round((1 - compressed.length / fileBuffer.length) * 100);
        }
      }

      // Chiffrement si activé
      if (this.options.enableEncryption) {
        const encrypted = await this.encryptBuffer(processedBuffer, options.encryptionKey);
        processedBuffer = encrypted.buffer;
        fileMetadata.encrypted = true;
        fileMetadata.encryptionMetadata = encrypted.metadata;
      }

      // Écriture du fichier
      await fs.writeFile(filePath, processedBuffer, { mode: this.options.permissions });

      // Écriture des métadonnées
      if (this.options.enableMetadataFiles) {
        await fs.writeFile(metadataPath, JSON.stringify(fileMetadata, null, 2));
      }

      // Backup si activé
      if (this.options.enableBackup) {
        await this.createBackup(filePath, metadataPath, storageKey);
      }

      const duration = Date.now() - startTime;
      this.updateMetrics('upload', duration, fileBuffer.length, true);

      logger.info('✅ Upload local réussi:', {
        fileName,
        storageKey,
        size: fileBuffer.length,
        finalSize: processedBuffer.length,
        duration: `${duration}ms`
      });

      return {
        key: storageKey,
        location: filePath,
        size: fileBuffer.length,
        etag: fileMetadata.hash,
        metadata: fileMetadata
      };

    } catch (error) {
      this.updateMetrics('upload', Date.now() - startTime, 0, false);
      logger.error('❌ Erreur upload local:', error);
      throw new StorageException(`Erreur upload local: ${error.message}`);
    }
  }

  async download(storageKey, options = {}) {
    const startTime = Date.now();

    try {
      logger.debug('📥 Download local démarré:', { storageKey });

      const filePath = this.getFilePath(storageKey);
      const metadataPath = this.getMetadataPath(storageKey);

      // Vérifier l'existence
      if (!await this.fileExists(filePath)) {
        throw new FileNotFoundException(`Fichier non trouvé: ${storageKey}`);
      }

      // Lecture du fichier
      let fileBuffer = await fs.readFile(filePath);
      let metadata = {};

      // Lecture des métadonnées
      if (this.options.enableMetadataFiles && await this.fileExists(metadataPath)) {
        try {
          const metadataContent = await fs.readFile(metadataPath, 'utf8');
          metadata = JSON.parse(metadataContent);
        } catch (metaError) {
          logger.warn('⚠️ Erreur lecture métadonnées:', { 
            storageKey, 
            error: metaError.message 
          });
        }
      }

      // Déchiffrement si nécessaire
      if (metadata.encrypted && this.options.enableEncryption) {
        fileBuffer = await this.decryptBuffer(
          fileBuffer, 
          metadata.encryptionMetadata,
          options.encryptionKey
        );
      }

      // Décompression si nécessaire
      if (metadata.compressed && this.options.enableCompression) {
        fileBuffer = await this.decompressBuffer(fileBuffer);
      }

      const duration = Date.now() - startTime;
      this.updateMetrics('download', duration, fileBuffer.length, true);

      logger.debug('✅ Download local réussi:', {
        storageKey,
        size: fileBuffer.length,
        duration: `${duration}ms`
      });

      return fileBuffer;

    } catch (error) {
      this.updateMetrics('download', Date.now() - startTime, 0, false);
      
      if (error instanceof FileNotFoundException) {
        throw error;
      }
      
      logger.error('❌ Erreur download local:', error);
      throw new StorageException(`Erreur download local: ${error.message}`);
    }
  }

  async delete(storageKey, options = {}) {
    const startTime = Date.now();

    try {
      logger.debug('🗑️ Suppression locale démarrée:', { storageKey });

      const filePath = this.getFilePath(storageKey);
      const metadataPath = this.getMetadataPath(storageKey);

      let deleted = false;

      // Supprimer le fichier principal
      if (await this.fileExists(filePath)) {
        await fs.unlink(filePath);
        deleted = true;
      }

      // Supprimer les métadonnées
      if (this.options.enableMetadataFiles && await this.fileExists(metadataPath)) {
        await fs.unlink(metadataPath);
      }

      // Nettoyer les dossiers vides
      if (options.removeEmptyDirs) {
        await this.cleanupEmptyDirectories(path.dirname(filePath));
      }

      const duration = Date.now() - startTime;
      this.updateMetrics('delete', duration, 0, deleted);

      logger.debug('✅ Suppression locale réussie:', { storageKey });
      return true;

    } catch (error) {
      this.updateMetrics('delete', Date.now() - startTime, 0, false);
      logger.error('❌ Erreur suppression locale:', error);
      throw new StorageException(`Erreur suppression locale: ${error.message}`);
    }
  }

  async exists(storageKey) {
    try {
      const filePath = this.getFilePath(storageKey);
      return await this.fileExists(filePath);
    } catch (error) {
      logger.warn('⚠️ Erreur vérification existence:', error);
      return false;
    }
  }

  async getMetadata(storageKey) {
    try {
      const filePath = this.getFilePath(storageKey);
      const metadataPath = this.getMetadataPath(storageKey);

      if (!await this.fileExists(filePath)) {
        throw new FileNotFoundException(`Fichier non trouvé: ${storageKey}`);
      }

      // Stats du fichier
      const stats = await fs.stat(filePath);
      
      let metadata = {
        size: stats.size,
        lastModified: stats.mtime,
        etag: await this.calculateFileETag(filePath),
        contentType: this.getMimeType(storageKey),
        created: stats.birthtime,
        accessed: stats.atime,
        permissions: stats.mode
      };

      // Métadonnées étendues si disponibles
      if (this.options.enableMetadataFiles && await this.fileExists(metadataPath)) {
        try {
          const extendedMetadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
          metadata = { ...metadata, ...extendedMetadata };
        } catch (error) {
          logger.warn('⚠️ Erreur lecture métadonnées étendues:', { 
            storageKey, 
            error: error.message 
          });
        }
      }

      return metadata;

    } catch (error) {
      if (error instanceof FileNotFoundException) {
        throw error;
      }
      
      logger.error('❌ Erreur métadonnées locales:', error);
      throw new StorageException(`Erreur métadonnées: ${error.message}`);
    }
  }

  async list(prefix = '', options = {}) {
    try {
      const searchPath = path.join(this.basePath, prefix);
      const files = [];

      await this.scanDirectory(searchPath, files, {
        recursive: options.recursive !== false,
        includeMetadata: options.includeMetadata || false,
        limit: options.limit || 1000,
        offset: options.offset || 0
      });

      // Filtrer et paginer
      const startIndex = options.offset || 0;
      const endIndex = options.limit ? startIndex + options.limit : files.length;
      
      return {
        items: files.slice(startIndex, endIndex).map(file => ({
          key: path.relative(this.basePath, file.path),
          size: file.size,
          lastModified: file.modified,
          etag: null,
          isDirectory: false,
          metadata: file.metadata
        })),
        totalCount: files.length,
        hasMore: endIndex < files.length,
        nextOffset: endIndex < files.length ? endIndex : null
      };

    } catch (error) {
      logger.error('❌ Erreur listing local:', error);
      throw new StorageException(`Erreur listing: ${error.message}`);
    }
  }

  // === MÉTHODES UTILITAIRES ===

  generateStorageKey(fileName, options = {}) {
    const category = options.category || 'misc';
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return path.join(category, year.toString(), month, day, fileName);
  }

  getFilePath(storageKey) {
    const cleanKey = storageKey.replace(/\.\./g, '').replace(/^\/+/, '');
    return path.join(this.basePath, cleanKey);
  }

  getMetadataPath(storageKey) {
    const filePath = this.getFilePath(storageKey);
    return filePath + this.metadataExtension;
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  getMimeType(fileName) {
    const mime = require('mime-types');
    return mime.lookup(fileName) || 'application/octet-stream';
  }

  // Les autres méthodes (compression, chiffrement, etc.) restent identiques
  // ... [inclure toutes les méthodes du LocalStorageProvider existant]
  
  // === HEALTH CHECK ===

  async healthCheck() {
    try {
      // Test d'écriture
      const testFile = path.join(this.basePath, '.health-check');
      const testData = Buffer.from(`test-${Date.now()}`);
      
      await fs.writeFile(testFile, testData);
      const readData = await fs.readFile(testFile);
      await fs.unlink(testFile);

      const isValid = Buffer.compare(testData, readData) === 0;
      
      return {
        healthy: isValid,
        provider: 'local',
        basePath: this.basePath,
        writable: true
      };
      
    } catch (error) {
      return {
        healthy: false,
        provider: 'local',
        basePath: this.basePath,
        error: error.message
      };
    }
  }

  // Inclure toutes les autres méthodes du LocalStorageProvider...
  // [pour la brièveté, je ne répète pas tout le code, mais toutes les méthodes doivent être incluses]
}

module.exports = LocalStorageAdapter;
