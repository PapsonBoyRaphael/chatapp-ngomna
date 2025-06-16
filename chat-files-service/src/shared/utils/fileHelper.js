/**
 * File Helper Utility - Chat Files Service
 * CENADI Chat-Files-Service
 * Utilitaires pour la manipulation de fichiers
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const mime = require('mime-types');
const sharp = require('sharp');
const { UTILS, THUMBNAIL_SIZES, FILE_TYPES } = require('../constants');
const { createLogger } = require('./logger');

const logger = createLogger('FileHelper');

class FileHelper {
  constructor(options = {}) {
    this.options = {
      uploadsDir: options.uploadsDir || './storage/uploads',
      thumbnailsDir: options.thumbnailsDir || './storage/thumbnails',
      tempDir: options.tempDir || './storage/temp',
      ...options
    };
  }

  // Initialiser les répertoires
  async initializeDirectories() {
    const dirs = [
      this.options.uploadsDir,
      this.options.thumbnailsDir,
      this.options.tempDir
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
        logger.debug(`📁 Répertoire créé/vérifié: ${dir}`);
      } catch (error) {
        logger.error(`❌ Erreur création répertoire ${dir}:`, error);
        throw error;
      }
    }
  }

  // Générer un nom de fichier unique
  generateUniqueFileName(originalName, userId) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension);
    
    // Format: timestamp_userId_random_nom.ext
    return `${timestamp}_${userId}_${random}_${this.sanitizeFileName(baseName)}${extension}`;
  }

  // Calculer le hash d'un fichier
  async calculateFileHash(filePath, algorithm = 'sha256') {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const hash = crypto.createHash(algorithm);
      hash.update(fileBuffer);
      return hash.digest('hex');
    } catch (error) {
      logger.error('❌ Erreur calcul hash:', error);
      throw error;
    }
  }

  // Obtenir les métadonnées d'un fichier
  async getFileMetadata(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const mimeType = mime.lookup(filePath) || 'application/octet-stream';
      const extension = path.extname(filePath);
      
      const metadata = {
        size: stats.size,
        mimeType,
        extension,
        category: UTILS.getCategoryFromMimeType(mimeType),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime
      };

      // Métadonnées spécifiques aux images
      if (metadata.category === 'image') {
        try {
          const imageMetadata = await sharp(filePath).metadata();
          metadata.width = imageMetadata.width;
          metadata.height = imageMetadata.height;
          metadata.format = imageMetadata.format;
          metadata.hasAlpha = imageMetadata.hasAlpha;
        } catch (imageError) {
          logger.warn('⚠️ Impossible de lire métadonnées image:', imageError.message);
        }
      }

      return metadata;
    } catch (error) {
      logger.error('❌ Erreur lecture métadonnées:', error);
      throw error;
    }
  }

  // Déplacer un fichier uploadé vers le stockage permanent
  async moveUploadedFile(tempPath, targetFileName) {
    try {
      const targetPath = path.join(this.options.uploadsDir, targetFileName);
      await fs.rename(tempPath, targetPath);
      
      logger.info('📁 Fichier déplacé:', {
        from: tempPath,
        to: targetPath,
        fileName: targetFileName
      });

      return targetPath;
    } catch (error) {
      logger.error('❌ Erreur déplacement fichier:', error);
      throw error;
    }
  }

  // Créer des thumbnails pour les images
  async createThumbnails(imagePath, fileId) {
    const thumbnails = {};
    
    try {
      for (const [sizeName, config] of Object.entries(THUMBNAIL_SIZES)) {
        const thumbnailFileName = `${fileId}${config.suffix}.jpg`;
        const thumbnailPath = path.join(this.options.thumbnailsDir, thumbnailFileName);

        await sharp(imagePath)
          .resize(config.width, config.height, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality: 80 })
          .toFile(thumbnailPath);

        thumbnails[sizeName.toLowerCase()] = {
          fileName: thumbnailFileName,
          path: thumbnailPath,
          width: config.width,
          height: config.height
        };

        logger.debug(`🖼️ Thumbnail créé: ${sizeName} (${config.width}x${config.height})`);
      }

      return thumbnails;
    } catch (error) {
      logger.error('❌ Erreur création thumbnails:', error);
      throw error;
    }
  }

  // Obtenir le chemin complet d'un fichier
  getFilePath(fileName, type = 'upload') {
    const baseDir = type === 'thumbnail' ? this.options.thumbnailsDir : this.options.uploadsDir;
    return path.join(baseDir, fileName);
  }

  // Vérifier si un fichier existe
  async fileExists(fileName, type = 'upload') {
    try {
      const filePath = this.getFilePath(fileName, type);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // Supprimer un fichier
  async deleteFile(fileName, type = 'upload') {
    try {
      const filePath = this.getFilePath(fileName, type);
      await fs.unlink(filePath);
      
      logger.info('🗑️ Fichier supprimé:', {
        fileName,
        type,
        path: filePath
      });

      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn('⚠️ Fichier déjà supprimé:', fileName);
        return true;
      }
      
      logger.error('❌ Erreur suppression fichier:', error);
      throw error;
    }
  }

  // Supprimer tous les fichiers liés (original + thumbnails)
  async deleteFileAndThumbnails(fileName, fileId) {
    const deletions = [];

    // Supprimer le fichier original
    deletions.push(this.deleteFile(fileName, 'upload'));

    // Supprimer les thumbnails
    for (const config of Object.values(THUMBNAIL_SIZES)) {
      const thumbnailName = `${fileId}${config.suffix}.jpg`;
      deletions.push(
        this.deleteFile(thumbnailName, 'thumbnail').catch(error => {
          if (error.code !== 'ENOENT') {
            logger.warn('⚠️ Erreur suppression thumbnail:', error.message);
          }
        })
      );
    }

    await Promise.all(deletions);
  }

  // Créer un stream de lecture
  createReadStream(fileName, type = 'upload', options = {}) {
    const filePath = this.getFilePath(fileName, type);
    return require('fs').createReadStream(filePath, options);
  }

  // Obtenir la taille d'un fichier
  async getFileSize(fileName, type = 'upload') {
    try {
      const filePath = this.getFilePath(fileName, type);
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      logger.error('❌ Erreur lecture taille fichier:', error);
      throw error;
    }
  }

  // Nettoyer les fichiers temporaires anciens
  async cleanupTempFiles(maxAge = 24 * 60 * 60 * 1000) { // 24h par défaut
    try {
      const tempFiles = await fs.readdir(this.options.tempDir);
      const now = Date.now();
      let cleaned = 0;

      for (const file of tempFiles) {
        const filePath = path.join(this.options.tempDir, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filePath);
          cleaned++;
          logger.debug(`🧹 Fichier temp supprimé: ${file}`);
        }
      }

      logger.info(`🧹 Nettoyage temp terminé: ${cleaned} fichiers supprimés`);
      return cleaned;
    } catch (error) {
      logger.error('❌ Erreur nettoyage temp:', error);
      throw error;
    }
  }

  // Calculer l'espace disque utilisé
  async calculateStorageUsage() {
    try {
      const usage = {
        uploads: 0,
        thumbnails: 0,
        temp: 0,
        total: 0
      };

      // Calculer pour chaque répertoire
      for (const [type, dir] of Object.entries({
        uploads: this.options.uploadsDir,
        thumbnails: this.options.thumbnailsDir,
        temp: this.options.tempDir
      })) {
        try {
          const files = await fs.readdir(dir);
          for (const file of files) {
            const stats = await fs.stat(path.join(dir, file));
            usage[type] += stats.size;
          }
        } catch (error) {
          logger.warn(`⚠️ Erreur calcul usage ${type}:`, error.message);
        }
      }

      usage.total = usage.uploads + usage.thumbnails + usage.temp;

      logger.debug('📊 Usage stockage calculé:', usage);
      return usage;
    } catch (error) {
      logger.error('❌ Erreur calcul usage stockage:', error);
      throw error;
    }
  }

  // Utilitaires de noms de fichiers
  sanitizeFileName(fileName) {
    return fileName
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\.\./g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100);
  }

  extractExtension(fileName) {
    return path.extname(fileName).toLowerCase();
  }

  // Vérifier l'intégrité d'un fichier
  async verifyFileIntegrity(fileName, expectedHash, algorithm = 'sha256') {
    try {
      const filePath = this.getFilePath(fileName);
      const actualHash = await this.calculateFileHash(filePath, algorithm);
      return actualHash === expectedHash;
    } catch (error) {
      logger.error('❌ Erreur vérification intégrité:', error);
      return false;
    }
  }

  // Créer une archive des fichiers (pour export)
  async createArchive(fileIds, outputPath) {
    // TODO: Implémenter avec archiver ou similaire
    throw new Error('Création d\'archive non implémentée');
  }

  // Statistiques de stockage par catégorie
  async getStorageStatsByCategory() {
    // TODO: Implémenter en parcourant les fichiers et en les catégorisant
    throw new Error('Statistiques par catégorie non implémentées');
  }
}

module.exports = FileHelper;
