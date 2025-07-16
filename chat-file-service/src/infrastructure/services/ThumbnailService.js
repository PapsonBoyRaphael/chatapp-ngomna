const sharp = require("sharp");
const path = require("path");
const fs = require("fs-extra");
const { v4: uuidv4 } = require("uuid");

class ThumbnailService {
  constructor(fileStorageService) {
    this.fileStorageService = fileStorageService;
    this.thumbnailSizes = [
      { name: "small", width: 150, height: 150 },
      { name: "medium", width: 300, height: 300 },
      { name: "large", width: 600, height: 600 },
    ];
  }

  async generateThumbnails(originalFilePath, originalFileName, fileId) {
    try {
      const thumbnails = [];
      const fileExtension = path.extname(originalFileName);
      const baseFileName = path.basename(originalFileName, fileExtension);

      for (const size of this.thumbnailSizes) {
        const thumbnailFileName = `thumbnail_${size.name}_${fileId}_${baseFileName}.webp`;
        const tempThumbnailPath = path.join(
          require("os").tmpdir(),
          thumbnailFileName
        );

        // Générer le thumbnail avec Sharp
        await sharp(originalFilePath)
          .resize(size.width, size.height, {
            fit: "cover",
            position: "center",
          })
          .webp({ quality: 80 })
          .toFile(tempThumbnailPath);

        // Upload vers MinIO/SFTP
        const remoteThumbnailPath = await this.fileStorageService.upload(
          tempThumbnailPath,
          `thumbnails/${thumbnailFileName}`
        );

        thumbnails.push({
          size: size.name,
          width: size.width,
          height: size.height,
          path: remoteThumbnailPath,
          url: this.generateThumbnailUrl(remoteThumbnailPath),
          fileName: thumbnailFileName,
        });

        // Nettoyer le fichier temporaire
        await fs.unlink(tempThumbnailPath);
      }

      console.log(
        `✅ ${thumbnails.length} thumbnails générés pour ${originalFileName}`
      );
      return thumbnails;
    } catch (error) {
      console.error(
        `❌ Erreur génération thumbnails pour ${originalFileName}:`,
        error
      );
      throw error;
    }
  }

  generateThumbnailUrl(remotePath) {
    const config = require("../../config/envValidator");

    if (config.env === "development") {
      // MinIO URL
      return `${config.s3Endpoint}/${config.s3Bucket}/${path.basename(
        remotePath
      )}`;
    } else {
      // SFTP - URL via le service
      return `/api/files/thumbnail/${path.basename(remotePath)}`;
    }
  }

  isImageFile(mimeType) {
    return (
      mimeType && mimeType.startsWith("image/") && !mimeType.includes("svg")
    ); // SVG ne peut pas être redimensionné avec Sharp
  }

  async downloadImageForProcessing(remotePath) {
    try {
      // Télécharger le fichier depuis MinIO/SFTP vers un fichier temporaire
      const tempFilePath = path.join(
        require("os").tmpdir(),
        `temp_${uuidv4()}.tmp`
      );
      const stream = await this.fileStorageService.download(
        remotePath,
        path.basename(remotePath)
      );

      const writeStream = fs.createWriteStream(tempFilePath);
      stream.pipe(writeStream);

      return new Promise((resolve, reject) => {
        writeStream.on("finish", () => resolve(tempFilePath));
        writeStream.on("error", reject);
      });
    } catch (error) {
      console.error("❌ Erreur téléchargement image pour traitement:", error);
      throw error;
    }
  }
}

module.exports = ThumbnailService;
