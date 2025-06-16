/**
 * Audio Processor - Infrastructure
 * CENADI Chat-Files-Service
 */

const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('AudioProcessor');

class AudioProcessor {
  constructor(options = {}) {
    this.options = {
      enableCompression: true,
      enableTranscoding: true,
      enableWaveform: true,
      enableSpectogram: false,
      maxDuration: 7200, // 2 heures max
      maxFileSize: 100 * 1024 * 1024, // 100MB max
      outputFormats: ['mp3', 'ogg', 'wav'],
      quality: {
        low: { bitrate: '64k', sampleRate: '22050' },
        medium: { bitrate: '128k', sampleRate: '44100' },
        high: { bitrate: '320k', sampleRate: '48000' }
      },
      waveform: {
        width: 800,
        height: 200,
        samples: 1000,
        colors: ['#3498db', '#e74c3c']
      },
      ...options
    };

    this.supportedFormats = [
      'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 
      'aiff', 'au', 'ra', 'amr', 'opus'
    ];
    
    this.metrics = this.initializeMetrics();
    this.tempDir = path.join(__dirname, '../../../../temp/audio');

    // S'assurer que le dossier temp existe
    this.ensureTempDir();

    logger.info('🎵 AudioProcessor créé', {
      supportedFormats: this.supportedFormats.length,
      enableCompression: this.options.enableCompression,
      enableWaveform: this.options.enableWaveform
    });
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.warn('⚠️ Impossible de créer le dossier temp audio:', { error: error.message });
    }
  }

  // Vérifier si le fichier est un audio
  isAudioFile(mimeType, fileName) {
    if (mimeType) {
      return mimeType.startsWith('audio/');
    }

    const extension = fileName.split('.').pop().toLowerCase();
    return this.supportedFormats.includes(extension);
  }

  // Traitement principal d'un fichier audio
  async processAudio(audioBuffer, options = {}) {
    const startTime = Date.now();
    const tempInputPath = path.join(this.tempDir, `input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.tmp`);

    try {
      logger.info('🔄 Traitement audio démarré:', {
        size: audioBuffer.length,
        options
      });

      // Écrire le buffer dans un fichier temporaire
      await fs.writeFile(tempInputPath, audioBuffer);

      // Analyser l'audio
      const metadata = await this.getAudioMetadata(tempInputPath);
      
      // Valider l'audio
      this.validateAudio(metadata, options);

      // Générer les versions
      const versions = await this.generateVersions(tempInputPath, metadata, options);

      const duration = Date.now() - startTime;
      this.updateMetrics('processed', duration, audioBuffer.length, true);

      logger.info('✅ Audio traité avec succès:', {
        originalSize: audioBuffer.length,
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
      this.updateMetrics('processed', duration, audioBuffer.length, false);

      logger.error('❌ Erreur traitement audio:', {
        error: error.message,
        duration
      });

      throw error;

    } finally {
      // Nettoyer le fichier temporaire
      try {
        await fs.unlink(tempInputPath);
      } catch (error) {
        logger.warn('⚠️ Impossible de supprimer le fichier temp audio:', { 
          path: tempInputPath,
          error: error.message 
        });
      }
    }
  }

  // Récupérer les métadonnées audio
  async getAudioMetadata(audioPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (error, metadata) => {
        if (error) {
          logger.error('❌ Erreur lecture métadonnées audio:', { error: error.message });
          reject(new Error(`Impossible de lire l'audio: ${error.message}`));
          return;
        }

        try {
          const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
          
          if (!audioStream) {
            reject(new Error('Aucun stream audio trouvé'));
            return;
          }

          const result = {
            format: metadata.format.format_name,
            duration: parseFloat(metadata.format.duration) || 0,
            size: parseInt(metadata.format.size) || 0,
            bitrate: parseInt(metadata.format.bit_rate) || 0,
            
            audio: {
              codec: audioStream.codec_name,
              sampleRate: parseInt(audioStream.sample_rate) || 0,
              channels: audioStream.channels || 0,
              channelLayout: audioStream.channel_layout,
              bitrate: parseInt(audioStream.bit_rate) || 0,
              bitsPerSample: audioStream.bits_per_sample || 0
            },

            // Métadonnées de tags si disponibles
            tags: metadata.format.tags || {}
          };

          resolve(result);

        } catch (parseError) {
          reject(new Error(`Erreur parsing métadonnées audio: ${parseError.message}`));
        }
      });
    });
  }

  // Validation de l'audio
  validateAudio(metadata, options) {
    const validationErrors = [];

    // Durée maximale
    if (metadata.duration > this.options.maxDuration) {
      validationErrors.push(`Durée trop longue: ${Math.round(metadata.duration)}s > ${this.options.maxDuration}s`);
    }

    // Taille de fichier
    if (metadata.size > this.options.maxFileSize) {
      validationErrors.push(`Fichier trop volumineux: ${Math.round(metadata.size / 1024 / 1024)}MB > ${Math.round(this.options.maxFileSize / 1024 / 1024)}MB`);
    }

    // Sample rate minimum
    if (metadata.audio.sampleRate < 8000) {
      validationErrors.push(`Sample rate trop bas: ${metadata.audio.sampleRate}Hz < 8000Hz`);
    }

    // Channels valides
    if (metadata.audio.channels < 1 || metadata.audio.channels > 8) {
      validationErrors.push(`Nombre de channels invalide: ${metadata.audio.channels}`);
    }

    if (validationErrors.length > 0) {
      throw new Error(`Validation audio échouée: ${validationErrors.join(', ')}`);
    }
  }

  // Générer les différentes versions
  async generateVersions(audioPath, metadata, options = {}) {
    const versions = [];

    try {
      // Waveform
      if (this.options.enableWaveform) {
        const waveform = await this.generateWaveform(audioPath, metadata);
        versions.push(waveform);
      }

      // Spectrogramme (optionnel)
      if (this.options.enableSpectogram) {
        const spectogram = await this.generateSpectogram(audioPath, metadata);
        versions.push(spectogram);
      }

      // Versions compressées
      if (this.options.enableCompression) {
        const compressed = await this.generateCompressedVersions(audioPath, metadata);
        versions.push(...compressed);
      }

      // Transcodage vers d'autres formats
      if (this.options.enableTranscoding) {
        const transcoded = await this.transcodeToFormats(audioPath, metadata);
        versions.push(...transcoded);
      }

      return versions;

    } catch (error) {
      logger.error('❌ Erreur génération versions audio:', { error: error.message });
      throw error;
    }
  }

  // Générer la waveform
  async generateWaveform(audioPath, metadata) {
    const outputPath = path.join(this.tempDir, `waveform_${Date.now()}.png`);
    const samples = this.options.waveform.samples;
    const width = this.options.waveform.width;
    const height = this.options.waveform.height;

    try {
      // Extraire les données audio pour la waveform
      const waveformData = await this.extractAudioData(audioPath, samples);
      
      // Générer l'image de la waveform
      const waveformImage = await this.renderWaveform(waveformData, {
        width,
        height,
        colors: this.options.waveform.colors
      });

      const result = {
        type: 'waveform',
        buffer: waveformImage,
        width,
        height,
        format: 'png',
        size: waveformImage.length,
        samples: samples,
        data: waveformData // Données brutes pour usage client
      };

      this.updateMetrics('waveform', 0, waveformImage.length, true);
      return result;

    } catch (error) {
      logger.error('❌ Erreur génération waveform:', { error: error.message });
      throw error;
    }
  }

  // Extraire les données audio pour waveform
  async extractAudioData(audioPath, samples) {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(this.tempDir, `wavedata_${Date.now()}.txt`);
      
      ffmpeg(audioPath)
        .audioFilters([
          `aresample=${samples}`,
          'volumedetect'
        ])
        .format('null')
        .output(outputPath)
        .on('end', async () => {
          try {
            // Simuler l'extraction de données - dans un vrai projet,
            // on utiliserait une librairie spécialisée comme node-wav
            const sampleData = Array.from({ length: samples }, (_, i) => {
              return Math.sin(2 * Math.PI * i / samples) * Math.random();
            });
            
            resolve(sampleData);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject)
        .run();
    });
  }

  // Rendre la waveform en image
  async renderWaveform(waveformData, options) {
    // Dans un vrai projet, on utiliserait Canvas ou une librairie de rendu
    // Ici on simule avec un buffer PNG minimal
    const { width, height } = options;
    
    // Simuler la génération d'une image PNG
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    ]);
    
    const imageData = Buffer.alloc(width * height * 4); // RGBA
    
    // Dessiner la waveform (simulation)
    for (let x = 0; x < width; x++) {
      const sampleIndex = Math.floor((x / width) * waveformData.length);
      const amplitude = Math.abs(waveformData[sampleIndex] || 0);
      const waveHeight = Math.floor(amplitude * height / 2);
      
      for (let y = height / 2 - waveHeight; y < height / 2 + waveHeight; y++) {
        if (y >= 0 && y < height) {
          const pixelIndex = (y * width + x) * 4;
          imageData[pixelIndex] = 52;     // R
          imageData[pixelIndex + 1] = 152; // G
          imageData[pixelIndex + 2] = 219; // B
          imageData[pixelIndex + 3] = 255; // A
        }
      }
    }
    
    return Buffer.concat([pngHeader, imageData]);
  }

  // Générer le spectrogramme
  async generateSpectogram(audioPath, metadata) {
    const outputPath = path.join(this.tempDir, `spectogram_${Date.now()}.png`);

    try {
      await new Promise((resolve, reject) => {
        ffmpeg(audioPath)
          .audioFilters([
            'showspectrumpic=s=800x600:mode=combined:color=rainbow'
          ])
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      const spectogramBuffer = await fs.readFile(outputPath);
      
      const result = {
        type: 'spectogram',
        buffer: spectogramBuffer,
        width: 800,
        height: 600,
        format: 'png',
        size: spectogramBuffer.length
      };

      // Nettoyer le fichier temporaire
      try {
        await fs.unlink(outputPath);
      } catch (error) {
        logger.warn('⚠️ Impossible de supprimer spectogram temp:', { error: error.message });
      }

      this.updateMetrics('spectogram', 0, spectogramBuffer.length, true);
      return result;

    } catch (error) {
      logger.error('❌ Erreur génération spectogramme:', { error: error.message });
      throw error;
    }
  }

  // Générer les versions compressées
  async generateCompressedVersions(audioPath, metadata) {
    const versions = [];

    try {
      for (const [qualityName, qualitySettings] of Object.entries(this.options.quality)) {
        // Skip si la qualité originale est déjà plus basse
        if (this.shouldSkipQuality(metadata, qualitySettings)) {
          continue;
        }

        const outputPath = path.join(this.tempDir, `compressed_${qualityName}_${Date.now()}.mp3`);

        await new Promise((resolve, reject) => {
          ffmpeg(audioPath)
            .audioBitrate(qualitySettings.bitrate)
            .audioFrequency(parseInt(qualitySettings.sampleRate))
            .audioCodec('mp3')
            .format('mp3')
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
          format: 'mp3',
          size: compressedBuffer.length,
          bitrate: qualitySettings.bitrate,
          sampleRate: qualitySettings.sampleRate
        });

        // Nettoyer le fichier temporaire
        try {
          await fs.unlink(outputPath);
        } catch (error) {
          logger.warn('⚠️ Impossible de supprimer audio compressé temp:', { error: error.message });
        }
      }

      this.updateMetrics('compressed', 0, 0, true, versions.length);
      return versions;

    } catch (error) {
      logger.error('❌ Erreur génération versions compressées audio:', { error: error.message });
      throw error;
    }
  }

  shouldSkipQuality(metadata, qualitySettings) {
    const currentBitrate = metadata.audio?.bitrate || 0;
    const targetBitrate = parseInt(qualitySettings.bitrate.replace('k', '')) * 1000;
    
    // Skip si la qualité cible est plus élevée que l'original
    return currentBitrate > 0 && targetBitrate >= currentBitrate;
  }

  // Transcoder vers d'autres formats
  async transcodeToFormats(audioPath, metadata) {
    const versions = [];
    const targetFormats = this.options.outputFormats.filter(format => 
      !metadata.format.includes(format)
    );

    try {
      for (const format of targetFormats) {
        const outputPath = path.join(this.tempDir, `transcoded_${format}_${Date.now()}.${format}`);
        
        await new Promise((resolve, reject) => {
          let command = ffmpeg(audioPath);

          // Configuration selon le format
          switch (format) {
            case 'ogg':
              command = command.audioCodec('libvorbis');
              break;
            case 'wav':
              command = command.audioCodec('pcm_s16le');
              break;
            case 'mp3':
              command = command.audioCodec('mp3');
              break;
            case 'aac':
              command = command.audioCodec('aac');
              break;
            default:
              // Format par défaut
              break;
          }

          command
            .format(format)
            .output(outputPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });

        const transcodedBuffer = await fs.readFile(outputPath);
        
        versions.push({
          type: 'transcoded',
          buffer: transcodedBuffer,
          format,
          size: transcodedBuffer.length,
          originalFormat: metadata.format
        });

        // Nettoyer le fichier temporaire
        try {
          await fs.unlink(outputPath);
        } catch (error) {
          logger.warn('⚠️ Impossible de supprimer audio transcodé temp:', { error: error.message });
        }
      }

      this.updateMetrics('transcoded', 0, 0, true, versions.length);
      return versions;

    } catch (error) {
      logger.error('❌ Erreur transcodage audio:', { error: error.message });
      throw error;
    }
  }

  // Extraire un segment audio
  async extractSegment(audioBuffer, startTime, duration, options = {}) {
    const tempInputPath = path.join(this.tempDir, `segment_input_${Date.now()}.tmp`);
    const outputPath = path.join(this.tempDir, `segment_${Date.now()}.mp3`);

    try {
      await fs.writeFile(tempInputPath, audioBuffer);

      await new Promise((resolve, reject) => {
        ffmpeg(tempInputPath)
          .seekInput(startTime)
          .duration(duration)
          .audioCodec('mp3')
          .format('mp3')
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      const segmentBuffer = await fs.readFile(outputPath);

      return {
        buffer: segmentBuffer,
        startTime,
        duration,
        format: 'mp3',
        size: segmentBuffer.length
      };

    } finally {
      // Nettoyer les fichiers temporaires
      try {
        await fs.unlink(tempInputPath);
        await fs.unlink(outputPath);
      } catch (error) {
        logger.warn('⚠️ Erreur nettoyage fichiers segment audio:', { error: error.message });
      }
    }
  }

  // Normaliser le volume
  async normalizeVolume(audioBuffer, targetLevel = -23, options = {}) {
    const tempInputPath = path.join(this.tempDir, `normalize_input_${Date.now()}.tmp`);
    const outputPath = path.join(this.tempDir, `normalized_${Date.now()}.mp3`);

    try {
      await fs.writeFile(tempInputPath, audioBuffer);

      await new Promise((resolve, reject) => {
        ffmpeg(tempInputPath)
          .audioFilters([
            `loudnorm=I=${targetLevel}:TP=-1.5:LRA=11`
          ])
          .audioCodec('mp3')
          .format('mp3')
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      const normalizedBuffer = await fs.readFile(outputPath);

      return {
        buffer: normalizedBuffer,
        targetLevel,
        format: 'mp3',
        size: normalizedBuffer.length
      };

    } finally {
      // Nettoyer les fichiers temporaires
      try {
        await fs.unlink(tempInputPath);
        await fs.unlink(outputPath);
      } catch (error) {
        logger.warn('⚠️ Erreur nettoyage fichiers normalisation:', { error: error.message });
      }
    }
  }

  // Métriques
  initializeMetrics() {
    return {
      processed: { count: 0, totalDuration: 0, totalSize: 0, success: 0, failed: 0 },
      waveform: { count: 0, totalSize: 0 },
      spectogram: { count: 0, totalSize: 0 },
      compressed: { count: 0, totalVersions: 0, spaceSaved: 0 },
      transcoded: { count: 0, totalVersions: 0 }
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
      if (operation === 'compressed' || operation === 'transcoded') {
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
        waveform: {
          count: this.metrics.waveform.count,
          totalSize: this.metrics.waveform.totalSize,
          averageSize: this.metrics.waveform.count > 0 
            ? Math.round(this.metrics.waveform.totalSize / this.metrics.waveform.count) 
            : 0
        },
        spectogram: {
          count: this.metrics.spectogram.count,
          totalSize: this.metrics.spectogram.totalSize
        },
        compressed: {
          count: this.metrics.compressed.count,
          totalVersions: this.metrics.compressed.totalVersions,
          spaceSaved: this.metrics.compressed.spaceSaved
        },
        transcoded: {
          count: this.metrics.transcoded.count,
          totalVersions: this.metrics.transcoded.totalVersions
        }
      }
    };
  }

  // Nettoyage
  async cleanup() {
    logger.info('🧹 Nettoyage AudioProcessor...');
    
    try {
      // Nettoyer le dossier temporaire
      const files = await fs.readdir(this.tempDir);
      for (const file of files) {
        try {
          await fs.unlink(path.join(this.tempDir, file));
        } catch (error) {
          logger.warn('⚠️ Impossible de supprimer fichier temp audio:', { 
            file, 
            error: error.message 
          });
        }
      }
    } catch (error) {
      logger.warn('⚠️ Erreur nettoyage dossier temp audio:', { error: error.message });
    }

    logger.info('✅ AudioProcessor nettoyé');
  }
}

module.exports = AudioProcessor;
