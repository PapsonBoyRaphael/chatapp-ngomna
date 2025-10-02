const File = require("../../domain/entities/File");
const musicMetadata = require("music-metadata");
const path = require("path");

class UploadFile {
  constructor(fileRepository, kafkaProducer = null) {
    this.fileRepository = fileRepository;
    this.kafkaProducer = kafkaProducer;
  }

  async execute(fileData) {
    try {
      console.log("📤 Démarrage de l'upload du fichier:", fileData);

      // ✅ VALIDATION DES DONNÉES
      if (!fileData.originalName || !fileData.fileName) {
        throw new Error("Données de fichier incomplètes");
      }

      // ✅ CRÉER UNE INSTANCE DE L'ENTITÉ FILE
      const fileEntity = new File({
        originalName: fileData.originalName,
        fileName: fileData.fileName,
        mimeType: fileData.mimeType,
        size: fileData.size,
        path: fileData.path,
        url: fileData.url,
        uploadedBy: fileData.uploadedBy,
        conversationId: fileData.conversationId,
        status: "COMPLETED", // ✅ MARQUER COMME COMPLÉTÉ DIRECTEMENT
        uploadedAt: new Date(),
      });

      // ✅ SAUVEGARDER VIA LE REPOSITORY
      const savedFile = await this.fileRepository.save(fileEntity);

      if (!savedFile) {
        throw new Error("Échec de la sauvegarde du fichier");
      }

      // ✅ TRAITEMENT DES MÉTADONNÉES AUDIO SI BESOIN
      // if (fileEntity.mimeType && fileEntity.mimeType.startsWith("audio/")) {
      //   await processAudioFile(savedFile);
      // }

      // ✅ PUBLIER ÉVÉNEMENT KAFKA VIA LE USE CASE
      if (
        this.kafkaProducer &&
        typeof this.kafkaProducer.publishMessage === "function"
      ) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "FILE_UPLOADED_SUCCESS",
            fileId: savedFile._id?.toString(),
            userId: fileData.uploadedBy,
            filename: fileData.originalName,
            size: fileData.size?.toString(),
            mimeType: fileData.mimeType,
            conversationId: fileData.conversationId?.toString() || "",
            timestamp: new Date().toISOString(),
          });
          console.log("✅ Événement Kafka publié depuis UploadFile");
        } catch (kafkaError) {
          console.warn("⚠️ Erreur Kafka UploadFile:", kafkaError.message);
        }
      }

      return {
        id: savedFile._id,
        originalName: savedFile.originalName,
        fileName: savedFile.fileName,
        size: savedFile.size,
        mimeType: savedFile.mimeType,
        uploadedAt: savedFile.createdAt,
        url: savedFile.url,
        status: savedFile.status,
      };
    } catch (error) {
      console.error("❌ Erreur UploadFile use case:", error);
      throw error;
    }
  }
}

module.exports = UploadFile;
