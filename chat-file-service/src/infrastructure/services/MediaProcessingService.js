// services/MediaProcessingService.js
const ffmpeg = require("fluent-ffmpeg");
const mm = require("music-metadata");
const pdfParse = require("pdf-parse");
const { exec } = require("child_process");
const util = require("util");
const path = require("path");
const fs = require("fs").promises;
const mime = require("mime-types");
const crypto = require("crypto");
const sharp = require("sharp");

const execAsync = util.promisify(exec);

class MediaProcessingService {
  constructor() {
    this.supportedFormats = {
      IMAGE: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "svg"],
      AUDIO: ["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"],
      VIDEO: ["mp4", "avi", "mov", "mkv", "webm", "flv", "wmv", "mpeg"],
      DOCUMENT: ["pdf", "doc", "docx", "txt", "rtf", "odt"],
    };
    this.metrics = { processed: 0, errors: 0 };
  }

  // Validation buffer/MIME
  validateBuffer(buffer, mimeType) {
    if (buffer.length > this.maxBufferSize)
      throw new Error("Buffer trop grand");
    if (!this.isSupportedMimeType(mimeType))
      throw new Error("Type MIME non supporté");
  }

  /**
   * Traite un fichier et extrait ses métadonnées (SANS thumbnails)
   */
  async processFile(buffer, originalName, mimeType) {
    this.validateBuffer(buffer, mimeType);

    try {
      console.log(`🔍 Traitement du fichier: ${originalName}`);
      const fileType = this.getFileType(mimeType, originalName);

      let metadata = {
        technical: {
          extension: path.extname(originalName).toLowerCase(),
          fileType: fileType,
          category: this.getFileCategory(fileType),
          encoding: "binary",
        },
        content: {},
      };

      // Traitement spécifique selon le type avec timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout processing")), this.timeout)
      );

      switch (fileType) {
        case "AUDIO":
          metadata = await this.processAudio(buffer, metadata);
          break;
        case "IMAGE":
          metadata = await this.processImage(buffer, metadata);
          break;
        case "VIDEO":
          metadata = await this.processVideo(buffer, metadata);
          break;
        case "DOCUMENT":
          metadata = await this.processDocument(buffer, metadata);
          break;
        default:
          metadata = await this.processOtherFile(buffer, metadata);
      }

      metadata = await Promise.race([timeoutPromise, processingPromise]);

      // Générer les checksums depuis le buffer
      metadata.technical.checksums = {
        md5: crypto.createHash("md5").update(buffer).digest("hex"),
        sha1: crypto.createHash("sha1").update(buffer).digest("hex"),
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
      };

      this.metrics.processed++;
      return metadata;
    } catch (error) {
      console.error(`❌ Erreur traitement fichier ${originalName}:`, error);
      this.metrics.errors++;
      return { error: error.message, technical: {}, content: {} }; // Fallback metadata vide
    }
  }

  /**
   * Traitement des images (SANS génération de thumbnails)
   */
  async processImage(buffer, metadata) {
    try {
      const imageInfo = await sharp(buffer).metadata();

      metadata.content = {
        dimensions: {
          width: imageInfo.width,
          height: imageInfo.height,
        },
        format: imageInfo.format,
        space: imageInfo.space,
        hasAlpha: imageInfo.hasAlpha,
        channels: imageInfo.channels,
      };

      return metadata;
    } catch (error) {
      console.warn("⚠️ Erreur traitement image:", error.message);
      return metadata;
    }
  }

  /**
   * Obtient les informations basiques d'une image
   */
  async getImageInfo(filePath) {
    try {
      // Utiliser une commande système légère pour les infos basiques
      const { stdout } = await execAsync(`file "${filePath}"`);
      const fileInfo = stdout.toString();

      // Extraire les dimensions si possible (approximation)
      const dimensionsMatch = fileInfo.match(/(\d+) x (\d+)/);
      const width = dimensionsMatch ? parseInt(dimensionsMatch[1]) : null;
      const height = dimensionsMatch ? parseInt(dimensionsMatch[2]) : null;

      return {
        width,
        height,
        format: this.getImageFormat(filePath),
        space: "RGB", // Valeur par défaut
        hasAlpha:
          filePath.toLowerCase().includes(".png") ||
          filePath.toLowerCase().includes(".gif"),
        size: (await fs.stat(filePath)).size,
      };
    } catch (error) {
      console.warn("⚠️ Erreur getImageInfo:", error.message);
      return {
        width: null,
        height: null,
        format: path.extname(filePath).replace(".", "").toUpperCase(),
        space: "RGB",
        hasAlpha: false,
        size: (await fs.stat(filePath)).size,
      };
    }
  }

  /**
   * Détermine le format d'image
   */
  getImageFormat(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case ".jpg":
      case ".jpeg":
        return "JPEG";
      case ".png":
        return "PNG";
      case ".gif":
        return "GIF";
      case ".webp":
        return "WEBP";
      case ".bmp":
        return "BMP";
      case ".tiff":
        return "TIFF";
      default:
        return ext.replace(".", "").toUpperCase();
    }
  }

  /**
   * Traitement des fichiers audio
   */
  async processAudio(buffer, metadata) {
    try {
      // Utiliser music-metadata pour les métadonnées audio
      const audioMetadata = await mm.parseBuffer(buffer);

      metadata.content = {
        duration: audioMetadata.format.duration,
        bitrate: audioMetadata.format.bitrate,
        sampleRate: audioMetadata.format.sampleRate,
        channels: audioMetadata.format.numberOfChannels,
        codec: audioMetadata.format.codec,
      };

      // Métadonnées ID3 si disponibles
      if (audioMetadata.common) {
        metadata.content = {
          ...metadata.content,
          title: audioMetadata.common.title,
          artist: audioMetadata.common.artist,
          album: audioMetadata.common.album,
          genre: audioMetadata.common.genre?.[0],
          year: audioMetadata.common.year,
        };
      }

      return metadata;
    } catch (error) {
      console.warn("⚠️ Erreur traitement audio:", error.message);
      return metadata;
    }
  }

  /**
   * Fallback pour l'audio avec FFprobe
   */
  async processAudioWithFFprobe(filePath, metadata) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        const stream = data.streams.find((s) => s.codec_type === "audio");
        if (stream) {
          metadata.content.duration = parseFloat(stream.duration);
          metadata.content.bitrate = parseInt(stream.bit_rate);
          metadata.content.sampleRate = parseInt(stream.sample_rate);
          metadata.content.channels = stream.channels;
          metadata.content.codec = stream.codec_name;
        }

        resolve(metadata);
      });
    });
  }

  /**
   * Traitement des vidéos
   */
  async processVideo(filePath, metadata) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, async (err, data) => {
        if (err) {
          console.warn("⚠️ Erreur traitement vidéo:", err.message);
          resolve(metadata);
          return;
        }

        try {
          const videoStream = data.streams.find(
            (s) => s.codec_type === "video"
          );
          const audioStream = data.streams.find(
            (s) => s.codec_type === "audio"
          );

          if (videoStream) {
            metadata.content.dimensions = {
              width: videoStream.width,
              height: videoStream.height,
            };
            metadata.content.duration = parseFloat(videoStream.duration);
            metadata.content.bitrate = parseInt(videoStream.bit_rate);
            metadata.content.fps = this.parseFps(videoStream.r_frame_rate);
            metadata.content.aspectRatio = videoStream.display_aspect_ratio;
            metadata.content.videoCodec = videoStream.codec_name;
          }

          if (audioStream) {
            metadata.content.audioCodec = audioStream.codec_name;
            metadata.content.audioChannels = audioStream.channels;
            metadata.content.audioSampleRate = parseInt(
              audioStream.sample_rate
            );
          }

          resolve(metadata);
        } catch (error) {
          console.warn("⚠️ Erreur extraction métadonnées vidéo:", error);
          resolve(metadata);
        }
      });
    });
  }

  /**
   * Traitement des documents
   */
  async processDocument(buffer, metadata) {
    try {
      // 1. Pour les PDF
      if (metadata.technical.extension === ".pdf") {
        const pdfData = await pdfParse(buffer);
        metadata.content = {
          pageCount: pdfData.numpages || 0,
          text: pdfData.text ? pdfData.text.substring(0, 1000) : null,
          wordCount: pdfData.text ? pdfData.text.split(/\s+/).length : 0,
          hasImages: pdfData.text ? pdfData.text.includes("/Image") : false,
          author: pdfData.info?.Author || null,
          title: pdfData.info?.Title || null,
          creator: pdfData.info?.Creator || null,
          size: buffer.length,
          encoding: "binary",
        };
      }
      // 2. Pour les fichiers texte
      else if (metadata.technical.extension.match(/\.(txt|rtf|md)$/)) {
        try {
          const text = buffer.toString("utf8");
          metadata.content = {
            text: text.substring(0, 1000),
            wordCount: text.split(/\s+/).length,
            lineCount: text.split("\n").length,
            encoding: "utf8",
            size: buffer.length,
          };
        } catch {
          // Si échec décodage UTF8, traiter comme binaire
          metadata.content = {
            size: buffer.length,
            encoding: "binary",
          };
        }
      }
      // 3. Pour les documents Office
      else if (
        metadata.technical.extension.match(/\.(doc|docx|xls|xlsx|ppt|pptx)$/)
      ) {
        metadata.content = {
          size: buffer.length,
          encoding: "binary",
          type: metadata.technical.extension.substring(1).toUpperCase(),
        };
      }
      // 4. Pour tout autre type de document
      else {
        metadata.content = {
          size: buffer.length,
          encoding: "binary",
        };
      }

      return metadata;
    } catch (error) {
      console.warn("⚠️ Erreur traitement document:", error.message);
      // En cas d'erreur, retourner au moins les métadonnées basiques
      metadata.content = {
        size: buffer.length,
        encoding: "binary",
      };
      return metadata;
    }
  }

  /**
   * Traitement des PDF
   */
  async processPDF(filePath, metadata) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);

      metadata.content.pageCount = pdfData.numpages;
      metadata.content.text = pdfData.text.substring(0, 1000); // Extraire les premiers caractères
      metadata.content.wordCount = pdfData.text.split(/\s+/).length;
      metadata.content.hasImages = pdfData.text.includes("/Image");
      metadata.content.author = pdfData.info?.Author;
      metadata.content.title = pdfData.info?.Title;
      metadata.content.creator = pdfData.info?.Creator;

      return metadata;
    } catch (error) {
      console.warn("⚠️ Erreur traitement PDF:", error.message);
      return metadata;
    }
  }

  /**
   * Traitement des fichiers texte
   */
  async processTextFile(filePath, metadata) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      metadata.content.text = content.substring(0, 2000); // Limiter la taille
      metadata.content.wordCount = content.split(/\s+/).length;
      metadata.content.lineCount = content.split("\n").length;
      metadata.content.encoding = "utf8";

      return metadata;
    } catch (error) {
      console.warn("⚠️ Erreur traitement fichier texte:", error.message);
      return metadata;
    }
  }

  /**
   * Traitement des documents génériques
   */
  async processGenericDocument(filePath, metadata) {
    // Pour les documents non supportés, on se contente des infos basiques
    const stats = await fs.stat(filePath);
    metadata.content.size = stats.size;

    return metadata;
  }

  /**
   * Traitement des autres types de fichiers
   */
  async processOtherFile(filePath, metadata) {
    // Métadonnées basiques pour les types non supportés
    const stats = await fs.stat(filePath);
    metadata.content.size = stats.size;

    return metadata;
  }

  /**
   * Génère un waveform basique pour l'audio
   */
  async generateAudioWaveform(filePath) {
    // Implémentation simplifiée - retourne des données simulées
    const waveform = [];
    for (let i = 0; i < 50; i++) {
      waveform.push(Math.random() * 0.8 + 0.2); // Valeurs entre 0.2 et 1.0
    }
    return waveform;
  }

  /**
   * Extrait les données EXIF des images
   */
  async extractExifData(filePath) {
    try {
      // Pour une implémentation légère sans Sharp
      // On pourrait utiliser 'exif-reader' si nécessaire
      const exif = {};

      // Extraction basique via commande système
      try {
        const { stdout } = await execAsync(
          `exiftool -j "${filePath}" 2>/dev/null || echo "{}"`
        );
        const exifData = JSON.parse(stdout)[0];

        if (exifData) {
          exif.orientation = exifData.Orientation;
          exif.camera = exifData.Model;
          exif.software = exifData.Software;

          // Extraction GPS si disponible
          if (exifData.GPSLatitude && exifData.GPSLongitude) {
            exif.location = {
              latitude: this.convertExifGps(
                exifData.GPSLatitude,
                exifData.GPSLatitudeRef
              ),
              longitude: this.convertExifGps(
                exifData.GPSLongitude,
                exifData.GPSLongitudeRef
              ),
            };
          }
        }
      } catch (exifError) {
        console.warn("⚠️ exiftool non disponible:", exifError.message);
      }

      return exif;
    } catch (error) {
      console.warn("⚠️ Erreur extraction EXIF:", error.message);
      return {};
    }
  }

  /**
   * Convertit les coordonnées GPS EXIF
   */
  convertExifGps(coordinate, ref) {
    if (!coordinate) return null;

    try {
      // Format: "40 deg 44' 54.00" N" -> 40.748333
      const parts = coordinate.toString().split(" ");
      const degrees = parseFloat(parts[0]);
      const minutes = parseFloat(parts[2]);
      const seconds = parseFloat(parts[3]);

      const decimal = degrees + minutes / 60 + seconds / 3600;

      if (ref === "S" || ref === "W") {
        return -decimal;
      }
      return decimal;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse les FPS vidéo
   */
  parseFps(fpsString) {
    if (!fpsString) return null;

    try {
      const [numerator, denominator] = fpsString.split("/");
      return denominator ? numerator / denominator : parseFloat(numerator);
    } catch (error) {
      return null;
    }
  }

  /**
   * Génère les checksums du fichier
   */
  async generateChecksums(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);

      return {
        md5: crypto.createHash("md5").update(fileBuffer).digest("hex"),
        sha1: crypto.createHash("sha1").update(fileBuffer).digest("hex"),
        sha256: crypto.createHash("sha256").update(fileBuffer).digest("hex"),
      };
    } catch (error) {
      console.warn("⚠️ Erreur génération checksums:", error.message);
      return {};
    }
  }

  /**
   * Détermine le type de fichier
   */
  getFileType(mimeType, fileName) {
    const extension = path.extname(fileName).toLowerCase().replace(".", "");

    if (
      mimeType.startsWith("image/") ||
      this.supportedFormats.IMAGE.includes(extension)
    ) {
      return "IMAGE";
    }
    if (
      mimeType.startsWith("audio/") ||
      this.supportedFormats.AUDIO.includes(extension)
    ) {
      return "AUDIO";
    }
    if (
      mimeType.startsWith("video/") ||
      this.supportedFormats.VIDEO.includes(extension)
    ) {
      return "VIDEO";
    }
    if (
      mimeType.includes("pdf") ||
      mimeType.includes("text/") ||
      mimeType.includes("application/") ||
      this.supportedFormats.DOCUMENT.includes(extension)
    ) {
      return "DOCUMENT";
    }

    return "OTHER";
  }

  /**
   * Détermine la catégorie du fichier
   */
  getFileCategory(fileType) {
    const categories = {
      IMAGE: "media",
      AUDIO: "media",
      VIDEO: "media",
      DOCUMENT: "document",
      OTHER: "other",
    };

    return categories[fileType] || "other";
  }

  /**
   * Vérifie si un type MIME est supporté
   */
  isSupportedMimeType(mimeType) {
    const supportedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/bmp",
      "audio/mpeg",
      "audio/wav",
      "audio/ogg",
      "audio/flac",
      "audio/aac",
      "video/mp4",
      "video/avi",
      "video/quicktime",
      "audio/flac",
      "audio/aac",
      "video/mp4",
      "video/webm",
      "video/x-msvideo",
      "video/x-matroska",
      "application/pdf",
      "text/plain",
      "text/rtf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];

    return supportedTypes.includes(mimeType);
  }

  /**
   * Récupère des informations basiques sur un fichier
   */
  async getBasicFileInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const mimeType = mime.lookup(filePath) || "application/octet-stream";

      return {
        size: stats.size,
        mimeType: mimeType,
        created: stats.birthtime,
        modified: stats.mtime,
        fileType: this.getFileType(mimeType, filePath),
      };
    } catch (error) {
      throw new Error(
        `Impossible d'obtenir les infos du fichier: ${error.message}`
      );
    }
  }

  getMetrics() {
    return this.metrics;
  }
}

module.exports = MediaProcessingService;
