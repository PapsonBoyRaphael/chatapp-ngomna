const fs = require("fs-extra");
const path = require("path");

class GetFile {
  constructor(fileRepository, kafkaProducer = null, redisClient = null) {
    this.fileRepository = fileRepository;
    this.kafkaProducer = kafkaProducer;
    this.redisClient = redisClient;
  }

  async execute(fileId, userId, trackDownload = true) {
    try {
      if (!fileId || !userId) {
        throw new Error("fileId et userId sont requis");
      }

      const file = await this.fileRepository.getFileById(fileId);

      if (!file) {
        throw new Error("Fichier non trouvé");
      }

      // Vérifier l'accès (si le fichier a une conversation associée)
      if (file.conversationId) {
        // Vérifier que l'utilisateur fait partie de la conversation
        // Cette logique peut être améliorée selon vos besoins
      }

      // Vérifier que le fichier existe physiquement
      if (!(await fs.pathExists(file.path))) {
        throw new Error("Fichier physique non trouvé");
      }

      // 🚀 PUBLIER TÉLÉCHARGEMENT DANS KAFKA
      if (this.kafkaProducer && trackDownload) {
        try {
          await this.kafkaProducer.publishFileUpload({
            eventType: "FILE_DOWNLOADED",
            fileId,
            fileName: file.originalName,
            downloadedBy: userId,
            conversationId: file.conversationId,
            fileSize: file.size,
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaError) {
          console.warn(
            "⚠️ Erreur publication téléchargement Kafka:",
            kafkaError.message
          );
        }
      }

      // Incrémenter le compteur de téléchargements
      await this.fileRepository.incrementDownloadCount(fileId);

      return {
        file,
        filePath: file.path,
        downloadUrl: file.url,
        metadata: {
          originalName: file.originalName,
          size: file.size,
          mimeType: file.mimeType,
          downloadedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("❌ Erreur GetFile:", error);
      throw error;
    }
  }
}

module.exports = GetFile;
