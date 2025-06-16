/**
 * Image Processor - Infrastructure
 * CENADI Chat-Files-Service
 */

const sharp = require('sharp');
const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('ImageProcessor');

class ImageProcessor {
  constructor(options = {}) {
    this.options = {
      enableOptimization: true,
      enableWebP: true,
      enableThumbnails: true,
      maxWidth: 4096,
      maxHeight: 4096,
      thumbnailSizes: [150, 300, 600],
      quality: {
        jpeg: 85,
        webp: 80,
        png: 95
      },
      ...options
    };

    this.supportedFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'tiff', 'svg'];
    this.metrics = this.initializeMetrics();

    logger.info('🖼️ ImageProcessor créé', {
      enableOptimization: this.options.enableOptimization,
      supportedFormats: this.supportedFormats.length
    });
  }

  // Vérifier si le fichier est une image
  isImageFile(mimeType, fileName) {
    if (mimeType) {
      return mimeType.startsWith('image/');
    }

    const extension = fileName.split('.').pop().toLowerCase();
    return this.supportedFormats.includes(extension);
  }

  // Traitement principal d'une image
  async processImage(imageBuffer, options = {}) {
    const startTime = Date.now();

    try {
      logger.debug('🔄 Traitement image démarré:', {
        size: imageBuffer.length,
        format: options.format
      });

      // Analyser l'image
      const metadata = await this.getImageMetadata(imageBuffer);
      
      // Valider l'image
      this.validateImage(metadata, options);

      // Générer les versions
      const versions = await this.generateVersions(imageBuffer, metadata, options);

      const duration = Date.now() - startTime;
      this.updateMetrics('processed', duration, imageBuffer.length, true);

      logger.info('✅ Image traitée avec succès:', {
        originalSize: imageBuffer.length,
        versionsCount: versions.length,
        duration
      });

      return {
        metadata,
        versions,
        processingTime: duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics('processed', duration, imageBuffer.length, false);

      logger.error('❌ Erreur traitement image:', {
        error: error.message,
        duration
      });

      throw error;
    }
  }

  // Récupérer les métadonnées de l'image
  async getImageMetadata(imageBuffer) {
    try {
      const metadata = await sharp(imageBuffer).metadata();

      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        channels: metadata.channels,
        colorSpace: metadata.space,
        hasAlpha: metadata.hasAlpha,
        density: metadata.density,
        orientation: metadata.orientation,
        isAnimated: metadata.pages > 1,
        pages: metadata.pages || 1,
        size: imageBuffer.length
      };

    } catch (error) {
      logger.error('❌ Erreur lecture métadonnées image:', { error: error.message });
      throw new Error(`Impossible de lire l'image: ${error.message}`);
    }
  }

  // Validation de l'image
  validateImage(metadata, options) {
    const validationErrors = [];

    // Taille maximale
    if (metadata.width > this.options.maxWidth) {
      validationErrors.push(`Largeur trop importante: ${metadata.width} > ${this.options.maxWidth}`);
    }

    if (metadata.height > this.options.maxHeight) {
      validationErrors.push(`Hauteur trop importante: ${metadata.height} > ${this.options.maxHeight}`);
    }

    // Format supporté
    if (!this.supportedFormats.includes(metadata.format)) {
      validationErrors.push(`Format non supporté: ${metadata.format}`);
    }

    if (validationErrors.length > 0) {
      throw new Error(`Validation image échouée: ${validationErrors.join(', ')}`);
    }
  }

  // Générer les différentes versions de l'image
  async generateVersions(imageBuffer, metadata, options = {}) {
    const versions = [];

    try {
      // Version originale optimisée
      if (this.options.enableOptimization) {
        const optimized = await this.optimizeImage(imageBuffer, metadata, options);
        versions.push({
          type: 'optimized',
          buffer: optimized.buffer,
          width: optimized.width,
          height: optimized.height,
          format: optimized.format,
          size: optimized.buffer.length,
          quality: optimized.quality
        });
      }

      // Thumbnails
      if (this.options.enableThumbnails) {
        const thumbnails = await this.generateThumbnails(imageBuffer, metadata);
        versions.push(...thumbnails);
      }

      // Version WebP si activée
      if (this.options.enableWebP && metadata.format !== 'webp') {
        const webp = await this.convertToWebP(imageBuffer, metadata);
        versions.push(webp);
      }

      // Version pour prévisualisation (format standard, taille réduite)
      const preview = await this.generatePreview(imageBuffer, metadata);
      versions.push(preview);

      return versions;

    } catch (error) {
      logger.error('❌ Erreur génération versions:', { error: error.message });
      throw error;
    }
  }

  // Optimiser l'image originale
  async optimizeImage(imageBuffer, metadata, options = {}) {
    try {
      let pipeline = sharp(imageBuffer);

      // Rotation automatique selon EXIF
      pipeline = pipeline.rotate();

      // Redimensionnement si nécessaire
      if (metadata.width > this.options.maxWidth || metadata.height > this.options.maxHeight) {
        pipeline = pipeline.resize(this.options.maxWidth, this.options.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }

      // Optimisation selon le format
      const format = options.format || metadata.format;
      const quality = this.options.quality[format] || 85;

      switch (format) {
        case 'jpeg':
        case 'jpg':
          pipeline = pipeline.jpeg({ 
            quality,
            progressive: true,
            mozjpeg: true
          });
          break;

        case 'png':
          pipeline = pipeline.png({ 
            quality,
            progressive: true,
            compressionLevel: 9
          });
          break;

        case 'webp':
          pipeline = pipeline.webp({ 
            quality: this.options.quality.webp,
            effort: 6
          });
          break;

        default:
          // Garder le format original
          break;
      }

      const result = await pipeline.toBuffer({ resolveWithObject: true });

      return {
        buffer: result.data,
        width: result.info.width,
        height: result.info.height,
        format: result.info.format,
        quality
      };

    } catch (error) {
      logger.error('❌ Erreur optimisation image:', { error: error.message });
      throw error;
    }
  }

  // Générer les thumbnails
  async generateThumbnails(imageBuffer, metadata) {
    const thumbnails = [];

    try {
      for (const size of this.options.thumbnailSizes) {
        const thumbnail = await sharp(imageBuffer)
          .rotate()
          .resize(size, size, {
            fit: 'cover',
            position: 'center'
          })
          .jpeg({ 
            quality: this.options.quality.jpeg,
            progressive: true 
          })
          .toBuffer({ resolveWithObject: true });

        thumbnails.push({
          type: 'thumbnail',
          size: size,
          buffer: thumbnail.data,
          width: thumbnail.info.width,
          height: thumbnail.info.height,
          format: 'jpeg',
          size: thumbnail.data.length
        });
      }

      return thumbnails;

    } catch (error) {
      logger.error('❌ Erreur génération thumbnails:', { error: error.message });
      throw error;
    }
  }

  // Convertir en WebP
  async convertToWebP(imageBuffer, metadata) {
    try {
      const webp = await sharp(imageBuffer)
        .rotate()
        .webp({ 
          quality: this.options.quality.webp,
          effort: 6 
        })
        .toBuffer({ resolveWithObject: true });

      return {
        type: 'webp',
        buffer: webp.data,
        width: webp.info.width,
        height: webp.info.height,
        format: 'webp',
        size: webp.data.length
      };

    } catch (error) {
      logger.error('❌ Erreur conversion WebP:', { error: error.message });
      throw error;
    }
  }

  // Générer une prévisualisation
  async generatePreview(imageBuffer, metadata) {
    try {
      const maxSize = 800; // Taille max pour prévisualisation
      
      const preview = await sharp(imageBuffer)
        .rotate()
        .resize(maxSize, maxSize, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ 
          quality: 80,
          progressive: true 
        })
        .toBuffer({ resolveWithObject: true });

      return {
        type: 'preview',
        buffer: preview.data,
        width: preview.info.width,
        height: preview.info.height,
        format: 'jpeg',
        size: preview.data.length
      };

    } catch (error) {
      logger.error('❌ Erreur génération prévisualisation:', { error: error.message });
      throw error;
    }
  }

  // Redimensionner une image
  async resizeImage(imageBuffer, width, height, options = {}) {
    try {
      const resized = await sharp(imageBuffer)
        .rotate()
        .resize(width, height, {
          fit: options.fit || 'cover',
          position: options.position || 'center',
          withoutEnlargement: options.withoutEnlargement !== false
        })
        .toBuffer({ resolveWithObject: true });

      return {
        buffer: resized.data,
        width: resized.info.width,
        height: resized.info.height,
        format: resized.info.format,
        size: resized.data.length
      };

    } catch (error) {
      logger.error('❌ Erreur redimensionnement:', { error: error.message });
      throw error;
    }
  }

  // Extraire la couleur dominante
  async extractDominantColor(imageBuffer) {
    try {
      const { dominant } = await sharp(imageBuffer)
        .resize(1, 1)
        .raw()
        .toBuffer({ resolveWithObject: true });

      return {
        r: dominant.r,
        g: dominant.g,
        b: dominant.b,
        hex: `#${dominant.r.toString(16).padStart(2, '0')}${dominant.g.toString(16).padStart(2, '0')}${dominant.b.toString(16).padStart(2, '0')}`
      };

    } catch (error) {
      logger.warn('⚠️ Impossible d\'extraire la couleur dominante:', { error: error.message });
      return null;
    }
  }

  // Générer un hash visuel (pour détecter les doublons)
  async generatePerceptualHash(imageBuffer) {
    try {
      // Redimensionner à 8x8 et convertir en niveaux de gris
      const { data } = await sharp(imageBuffer)
        .resize(8, 8)
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Calculer la moyenne
      const average = Array.from(data).reduce((sum, pixel) => sum + pixel, 0) / data.length;

      // Générer le hash binaire
      let hash = '';
      for (let i = 0; i < data.length; i++) {
        hash += data[i] >= average ? '1' : '0';
      }

      return hash;

    } catch (error) {
      logger.warn('⚠️ Impossible de générer le hash perceptuel:', { error: error.message });
      return null;
    }
  }

  // Métriques
  initializeMetrics() {
    return {
      processed: { count: 0, totalDuration: 0, totalSize: 0, success: 0, failed: 0 },
      thumbnails: { count: 0, totalSize: 0 },
      webp: { count: 0, totalSize: 0, compressionRatio: 0 },
      optimizations: { count: 0, spaceSaved: 0 }
    };
  }

  updateMetrics(operation, duration = 0, size = 0, success = true) {
    const metric = this.metrics[operation];
    if (metric) {
      metric.count++;
      metric.totalDuration += duration;
      metric.totalSize += size;
      
      if (success) {
        metric.success++;
      } else {
        metric.failed++;
      }
    }
  }

  getMetrics() {
    return {
      overview: {
        totalProcessed: this.metrics.processed.count,
        successRate: this.metrics.processed.count > 0 
          ? Math.round((this.metrics.processed.success / this.metrics.processed.count) * 100) 
          : 0,
        averageDuration: this.metrics.processed.count > 0 
          ? Math.round(this.metrics.processed.totalDuration / this.metrics.processed.count) 
          : 0,
        totalSizeProcessed: this.metrics.processed.totalSize
      },
      details: {
        thumbnails: {
          generated: this.metrics.thumbnails.count,
          totalSize: this.metrics.thumbnails.totalSize
        },
        webp: {
          converted: this.metrics.webp.count,
          averageCompressionRatio: this.metrics.webp.count > 0 
            ? Math.round(this.metrics.webp.compressionRatio / this.metrics.webp.count) 
            : 0
        },
        optimizations: {
          performed: this.metrics.optimizations.count,
          spaceSaved: this.metrics.optimizations.spaceSaved
        }
      }
    };
  }

  // Nettoyage
  async cleanup() {
    logger.info('🧹 Nettoyage ImageProcessor...');
    // Aucune ressource particulière à nettoyer pour Sharp
    logger.info('✅ ImageProcessor nettoyé');
  }
}

module.exports = ImageProcessor;
