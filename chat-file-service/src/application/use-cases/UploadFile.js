const File = require("../../domain/entities/File");

class UploadFile {
  constructor(fileRepository, kafkaProducer = null, redisClient = null) {
    this.fileRepository = fileRepository;
    this.kafkaProducer = kafkaProducer;
    this.redisClient = redisClient;
  }

  async execute(fileData) {
    try {
      console.log("📤 Démarrage de l'upload du fichier:", fileData);
      // Validation des données
      if (!fileData.originalName || !fileData.fileName) {
        throw new Error("Données de fichier incomplètes");
      }

      const fileEntity = new File({
        originalName: fileData.originalName,
        fileName: fileData.fileName, // attention à la cohérence des noms
        mimeType: fileData.mimeType || fileData.mimetype,
        size: fileData.size,
        path: fileData.path,
        uploadedBy: fileData.uploadedBy,
        conversationId: fileData.conversationId,
        url: fileData.url,
        status: "UPLOADING",
        uploadedAt: new Date(),
        // ...autres champs si besoin
      });

      // Sauvegarder le fichier
      const savedFile = await this.fileRepository.save(fileEntity);

      // Publier événement Kafka
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "FILE_UPLOADED_SUCCESS",
            fileId: String(savedFile.id),
            userId: fileData.uploadedBy,
            filename: fileData.originalName,
            size: String(fileData.size),
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaError) {
          console.warn("⚠️ Erreur Kafka upload:", kafkaError.message);
        }
      }

      return {
        id: savedFile.id,
        originalName: savedFile.originalName,
        filename: savedFile.filename,
        size: savedFile.size,
        mimetype: savedFile.mimetype,
        uploadedAt: savedFile.uploadedAt,
        url: `/uploads/${savedFile.filename}`,
      };
    } catch (error) {
      console.error("❌ Erreur UploadFile use case:", error);
      throw error;
    }
  }
}

module.exports = UploadFile;
