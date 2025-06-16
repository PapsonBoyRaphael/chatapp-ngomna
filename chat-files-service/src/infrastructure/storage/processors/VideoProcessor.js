/**
 * Video Processor - Infrastructure
 * CENADI Chat-Files-Service
 */

const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('VideoProcessor');

class VideoProcessor {
  constructor(options = {}) {
    this.options = {
      enableThumbnails: true,
      enablePreview: true,
      enableCompression: true,
      maxDuration: 3600, // 1 heure max
      maxFileSize: 500 * 1024 * 1024, // 500MB max
      thumbnailCount: 3,
      previewDuration: 30, // 30 secondes
      outputFormats: ['mp4', 'webm'],
      quality: {
        low: { videoBitrate: '500k', audioBitrate: '64k' },
        medium: { videoBitrate: '1000k', audioBitrate: '128k' },
        high: { videoBitrate: '2000k', audioBitrate: '192k' }
      },
      ...options
    };

    this.supportedFormats = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp'];
    this.metrics = this.initializeMetrics();
    this.tempDir = path.join(__dirname, '../../../../temp/video');

    // S'assurer que le dossier temp existe
    this.ensureTempDir();

    logger.info('🎬 VideoProcessor créé', {
      supportedFormats: this.supportedFormats.length,
      enableCompression: this.options.enableCompression
    });
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.warn('⚠️ Impossible de créer le dossier temp:', { error: error.message });
    }
  }

  // Vérifier si le fichier est une vidéo
  isVideoFile(mimeType, fileName) {
    if (mimeType) {
      return mimeType.startsWith('video/');
    }

    const extension = fileName.split('.').pop().toLowerCase();
    return this.supportedFormats.includes(extension);
  }

  // Traitement principal d'une vidéo
  async processVideo(videoBuffer, options = {}) {
    const startTime = Date.now();
    const tempInputPath = path.join(this.tempDir, `input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.tmp`);

    try {
      logger.info('🔄 Traitement vidéo démarré:', {
        size: videoBuffer.length,
        options
      });

      // Écrire le buffer dans un fichier temporaire
      await fs.writeFile(tempInputPath, videoBuffer);

      // Analyser la vidéo
      const metadata = await this.getVideoMetadata(tempInputPath);
      
      // Valider la vidéo
      this.validateVideo(metadata, options);

      // Générer les versions
      const versions = await this.generateVersions(tempInputPath, metadata, options);

      const duration = Date.now() - startTime;
      this.updateMetrics('processed', duration, videoBuffer.length, true);

      logger.info('✅ Vidéo traitée avec succès:', {
        originalSize: videoBuffer.length,
        versionsCount: versions.length,
        duration: `${Math.round(duration / 1000)}s`
      });

      return {
        metadata,
        versions,
        processingTime: duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateMetrics('processed', duration, videoBuffer.length, false);

      logger.error('❌ Erreur traitement vidéo:', {
        error: error.message,
        duration
      });

      throw error;

    } finally {
      // Nettoyer le fichier temporaire
      try {
        await fs.unlink(tempInputPath);
      } catch (error) {
        logger.warn('⚠️ Impossible de supprimer le fichier temp:', { 
          path: tempInputPath,
          error: error.message 
        });
      }
    }
  }

  // Récupérer les métadonnées de la vidéo
  async getVideoMetadata(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (error, metadata) => {
        if (error) {
          logger.error('❌ Erreur lecture métadonnées vidéo:', { error: error.message });
          reject(new Error(`Impossible de lire la vidéo: ${error.message}`));
          return;
        }

        try {
          const videoStream = metadata.streams.find(s => s.codec_type === 'video');
          const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

          const result = {
            format: metadata.format.format_name,
            duration: parseFloat(metadata.format.duration) || 0,
            size: parseInt(metadata.format.size) || 0,
            bitrate: parseInt(metadata.format.bit_rate) || 0,
            
            video: videoStream ? {
              codec: videoStream.codec_name,
              width: videoStream.width,
              height: videoStream.height,
              frameRate: this.parseFrameRate(videoStream.r_frame_rate),
              bitrate: parseInt(videoStream.bit_rate) || 0,
              aspectRatio: videoStream.display_aspect_ratio
            } : null,
            
            audio: audioStream ? {
              codec: audioStream.codec_name,
              sampleRate: parseInt(audioStream.sample_rate) || 0,
              channels: audioStream.channels,
              bitrate: parseInt(audioStream.bit_rate) || 0
            } : null
          };

          resolve(result);

        } catch (parseError) {
          reject(new Error(`Erreur parsing métadonnées: ${parseError.message}`));
        }
      });
    });
  }

  parseFrameRate(frameRateString) {
    if (!frameRateString) return 0;
    
    try {
      const parts = frameRateString.split('/');
      if (parts.length === 2) {
        return parseFloat(parts[0]) / parseFloat(parts[1]);
      }
      return parseFloat(frameRateString);
    } catch (error) {
      return 0;
    }
  }

  // Validation de la vidéo
  validateVideo(metadata, options) {
    const validationErrors = [];

    // Durée maximale
    if (metadata.duration > this.options.maxDuration) {
      validationErrors.push(`Durée trop longue: ${Math.round(metadata.duration)}s > ${this.options.maxDuration}s`);
    }

    // Taille de fichier
    if (metadata.size > this.options.maxFileSize) {
      validationErrors.push(`Fichier trop volumineux: ${Math.round(metadata.size / 1024 / 1024)}MB > ${Math.round(this.options.maxFileSize / 1024 / 1024)}MB`);
    }

    // Présence de stream vidéo
    if (!metadata.video) {
      validationErrors.push('Aucun stream vidéo détecté');
    }

    if (validationErrors.length > 0) {
      throw new Error(`Validation vidéo échouée: ${validationErrors.join(', ')}`);
    }
  }

  // Générer les différentes versions
  async generateVersions(videoPath, metadata, options = {}) {
    const versions = [];

    try {
      // Thumbnails
      if (this.options.enableThumbnails) {
        const thumbnails = await this.generateThumbnails(videoPath, metadata);
        versions.push(...thumbnails);
      }

      // Prévisualisation courte
      if (this.options.enablePreview && metadata.duration > this.options.previewDuration) {
        const preview = await this.generatePreview(videoPath, metadata);
        versions.push(preview);
      }

      // Versions compressées
      if (this.options.enableCompression) {
        const compressed = await this.generateCompressedVersions(videoPath, metadata);
        versions.push(...compressed);
      }

      return versions;

    } catch (error) {
      logger.error('❌ Erreur génération versions vidéo:', { error: error.message });
      throw error;
    }
  }

  // Générer les thumbnails
  async generateThumbnails(videoPath, metadata) {
    const thumbnails = [];
    const count = this.options.thumbnailCount;
    const duration = metadata.duration;

    try {
      for (let i = 0; i < count; i++) {
        const timestamp = (duration / (count + 1)) * (i + 1);
        const outputPath = path.join(this.tempDir, `thumb_${Date.now()}_${i}.jpg`);

        await new Promise((resolve, reject) => {
          ffmpeg(videoPath)
            .seekInput(timestamp)
            .frames(1)
            .size('300x200')
            .format('image2')
            .output(outputPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });

        const thumbnailBuffer = await fs.readFile(outputPath);
        
        thumbnails.push({
          type: 'thumbnail',
          timestamp,
          buffer: thumbnailBuffer,
          width: 300,
          height: 200,
          format: 'jpeg',
          size: thumbnailBuffer.length
        });

        // Nettoyer le fichier temporaire
        try {
          await fs.unlink(outputPath);
        } catch (error) {
          logger.warn('⚠️ Impossible de supprimer thumbnail temp:', { error: error.message });
        }
      }

      this.updateMetrics('thumbnails', 0, 0, true, thumbnails.length);
      return thumbnails;

    } catch (error) {
      logger.error('❌ Erreur génération thumbnails vidéo:', { error: error.message });
      throw error;
    }
  }

  // Générer une prévisualisation courte
  async generatePreview(videoPath, metadata) {
    const outputPath = path.join(this.tempDir, `preview_${Date.now()}.mp4`);
    const startTime = metadata.duration * 0.1; // Commencer à 10% de la vidéo
    const duration = Math.min(this.options.previewDuration, metadata.duration * 0.8);

    try {
      await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .seekInput(startTime)
          .duration(duration)
          .size('640x360')
          .videoBitrate('500k')
          .audioCodec('aac')
          .videoCodec('libx264')
          .format('mp4')
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      const previewBuffer = await fs.readFile(outputPath);
      
      const result = {
        type: 'preview',
        buffer: previewBuffer,
        width: 640,
        height: 360,
        duration,
        format: 'mp4',
        size: previewBuffer.length,
        startTime,
        bitrate: '500k'
      };

      // Nettoyer le fichier temporaire
      try {
        await fs.unlink(outputPath);
      } catch (error) {
        logger.warn('⚠️ Impossible de supprimer preview temp:', { error: error.message });
      }

      this.updateMetrics('preview', 0, previewBuffer.length, true);
      return result;

    } catch (error) {
      logger.error('❌ Erreur génération preview vidéo:', { error: error.message });
      throw error;
    }
  }

  // Générer les versions compressées
  async generateCompressedVersions(videoPath, metadata) {
    const versions = [];

    try {
      for (const [qualityName, qualitySettings] of Object.entries(this.options.quality)) {
        // Skip si la qualité originale est déjà plus basse
        if (this.shouldSkipQuality(metadata, qualitySettings)) {
          continue;
        }

        const outputPath = path.join(this.tempDir, `compressed_${qualityName}_${Date.now()}.mp4`);

        await new Promise((resolve, reject) => {
          let command = ffmpeg(videoPath)
            .videoBitrate(qualitySettings.videoBitrate)
            .audioBitrate(qualitySettings.audioBitrate)
            .videoCodec('libx264')
            .audioCodec('aac')
            .format('mp4');

          // Ajuster la résolution selon la qualité
          if (qualityName === 'low') {
            command = command.size('640x360');
          } else if (qualityName === 'medium') {
            command = command.size('1280x720');
          }
          // high = résolution originale

          command
            .output(outputPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });

        const compressedBuffer = await fs.readFile(outputPath);
        
        versions.push({
          type: 'compressed',
          quality: qualityName,
          buffer: compressedBuffer,
          format: 'mp4',
          size: compressedBuffer.length,
          videoBitrate: qualitySettings.videoBitrate,
          audioBitrate: qualitySettings.audioBitrate
        });

        // Nettoyer le fichier temporaire
        try {
          await fs.unlink(outputPath);
        } catch (error) {
          logger.warn('⚠️ Impossible de supprimer compressed temp:', { error: error.message });
        }
      }

      this.updateMetrics('compressed', 0, 0, true, versions.length);
      return versions;

    } catch (error) {
      logger.error('❌ Erreur génération versions compressées:', { error: error.message });
      throw error;
    }
  }

  shouldSkipQuality(metadata, qualitySettings) {
    const currentBitrate = metadata.video?.bitrate || 0;
    const targetBitrate = parseInt(qualitySettings.videoBitrate.replace('k', '')) * 1000;
    
    // Skip si la qualité cible est plus élevée que l'original
    return currentBitrate > 0 && targetBitrate >= currentBitrate;
  }

  // Extraire un frame spécifique
  async extractFrame(videoBuffer, timestamp, options = {}) {
    const tempInputPath = path.join(this.tempDir, `extract_input_${Date.now()}.tmp`);
    const outputPath = path.join(this.tempDir, `frame_${Date.now()}.jpg`);

    try {
      await fs.writeFile(tempInputPath, videoBuffer);

      await new Promise((resolve, reject) => {
        ffmpeg(tempInputPath)
          .seekInput(timestamp)
          .frames(1)
          .size(options.size || '640x360')
          .format('image2')
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      const frameBuffer = await fs.readFile(outputPath);

      return {
        buffer: frameBuffer,
        timestamp,
        format: 'jpeg',
        size: frameBuffer.length
      };

    } finally {
      // Nettoyer les fichiers temporaires
      try {
        await fs.unlink(tempInputPath);
        await fs.unlink(outputPath);
      } catch (error) {
        logger.warn('⚠️ Erreur nettoyage fichiers temp:', { error: error.message });
      }
    }
  }

  // Convertir le format
  async convertFormat(videoBuffer, targetFormat, options = {}) {
    const tempInputPath = path.join(this.tempDir, `convert_input_${Date.now()}.tmp`);
    const outputPath = path.join(this.tempDir, `converted_${Date.now()}.${targetFormat}`);

    try {
      await fs.writeFile(tempInputPath, videoBuffer);

      await new Promise((resolve, reject) => {
        let command = ffmpeg(tempInputPath)
          .format(targetFormat);

        // Paramètres selon le format
        if (targetFormat === 'webm') {
          command = command
            .videoCodec('libvpx-vp9')
            .audioCodec('libvorbis');
        } else if (targetFormat === 'mp4') {
          command = command
            .videoCodec('libx264')
            .audioCodec('aac');
        }

        command
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      const convertedBuffer = await fs.readFile(outputPath);

      return {
        buffer: convertedBuffer,
        format: targetFormat,
        size: convertedBuffer.length
      };

    } finally {
      // Nettoyer les fichiers temporaires
      try {
        await fs.unlink(tempInputPath);
        await fs.unlink(outputPath);
      } catch (error) {
        logger.warn('⚠️ Erreur nettoyage fichiers conversion:', { error: error.message });
      }
    }
  }

  // Métriques
  initializeMetrics() {
    return {
      processed: { count: 0, totalDuration: 0, totalSize: 0, success: 0, failed: 0 },
      thumbnails: { count: 0, totalGenerated: 0 },
      preview: { count: 0, totalSize: 0 },
      compressed: { count: 0, totalVersions: 0, spaceSaved: 0 }
    };
  }

  updateMetrics(operation, duration = 0, size = 0, success = true, count = 1) {
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

      // Métriques spécifiques
      if (operation === 'thumbnails') {
        metric.totalGenerated += count;
      } else if (operation === 'compressed') {
        metric.totalVersions += count;
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
        averageProcessingTime: this.metrics.processed.success > 0 
          ? Math.round(this.metrics.processed.totalDuration / this.metrics.processed.success) 
          : 0,
        totalSizeProcessed: this.metrics.processed.totalSize
      },
      operations: {
        thumbnails: {
          count: this.metrics.thumbnails.count,
          totalGenerated: this.metrics.thumbnails.totalGenerated,
          averagePerVideo: this.metrics.thumbnails.count > 0 
            ? Math.round(this.metrics.thumbnails.totalGenerated / this.metrics.thumbnails.count) 
            : 0
        },
        preview: {
          count: this.metrics.preview.count,
          totalSize: this.metrics.preview.totalSize,
          averageSize: this.metrics.preview.count > 0 
            ? Math.round(this.metrics.preview.totalSize / this.metrics.preview.count) 
            : 0
        },
        compressed: {
          count: this.metrics.compressed.count,
          totalVersions: this.metrics.compressed.totalVersions,
          spaceSaved: this.metrics.compressed.spaceSaved
        }
      }
    };
  }

  // Nettoyage
  async cleanup() {
    logger.info('🧹 Nettoyage VideoProcessor...');
    
    try {
      // Nettoyer le dossier temporaire
      const files = await fs.readdir(this.tempDir);
      for (const file of files) {
        try {
          await fs.unlink(path.join(this.tempDir, file));
        } catch (error) {
          logger.warn('⚠️ Impossible de supprimer fichier temp:', { 
            file, 
            error: error.message 
          });
        }
      }
    } catch (error) {
      logger.warn('⚠️ Erreur nettoyage dossier temp:', { error: error.message });
    }

    logger.info('✅ VideoProcessor nettoyé');
  }
}

module.exports = VideoProcessor;
