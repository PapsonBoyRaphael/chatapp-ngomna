const File = require("../../domain/entities/File");
const musicMetadata = require("music-metadata");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

class UploadFile {
  constructor(
    fileRepository,
    kafkaProducer = null,
    resilientMessageService = null
  ) {
    this.fileRepository = fileRepository;
    this.kafkaProducer = kafkaProducer;
    this.resilientMessageService = resilientMessageService;
  }

  async execute(fileData) {
    try {
      console.log("📤 Démarrage de l'upload du fichier:", fileData);

      // ✅ VALIDATION DES DONNÉES
      if (!fileData.originalName || !fileData.fileName) {
        throw new Error("Données de fichier incomplètes");
      }

      // ✅ GÉNÉRER UUID CUSTOM (32 caractères hex sans tirets)
      const fileId = uuidv4().replace(/-/g, "");
      console.log(`🆔 ID fichier généré (UUID): ${fileId}`);

      // ✅ CONSTRUIRE LE NOM DU FICHIER BASÉ SUR L'UUID
      const ext = path.extname(fileData.originalName) || ".bin";
      const safeFileName = `${fileId}${ext.toLowerCase()}`;
      console.log(`📝 Nom sécurisé généré: ${safeFileName}`);

      // ✅ CRÉER UNE INSTANCE DE L'ENTITÉ FILE AVEC LES MÉTADONNÉES
      const fileEntity = new File({
        _id: fileId, // Assigner l'ID custom (string)
        originalName: fileData.originalName,
        fileName: safeFileName, // Utiliser le nom sécurisé généré
        mimeType: fileData.mimeType,
        size: fileData.size,
        path: fileData.path,
        url: fileData.url,
        uploadedBy: fileData.uploadedBy,
        conversationId: fileData.conversationId,
        status: "COMPLETED",
        metadata: {
          technical: fileData.metadata?.technical,
          content: fileData.metadata?.content,
          processing: fileData.metadata?.processing,
          kafkaMetadata: fileData.metadata?.kafkaMetadata,
          redisMetadata: fileData.metadata?.redisMetadata,
          security: fileData.metadata?.security,
          storage: fileData.metadata?.storage,
          usage: fileData.metadata?.usage,
        },
      });

      // ✅ SAUVEGARDER VIA LE REPOSITORY
      const savedFile = await this.fileRepository.save(fileEntity);

      if (!savedFile) {
        throw new Error("Échec de la sauvegarde du fichier");
      }

      console.log(`✅ Fichier sauvé avec ID custom: ${fileId}`);

      // ✅ PUBLIER DANS REDIS STREAMS events:files
      if (this.resilientMessageService) {
        try {
          await this.resilientMessageService.addToStream("events:files", {
            event: "file.uploaded",
            fileId: savedFile._id,
            conversationId: savedFile.conversationId?.toString() || "unknown",
            uploaderId: savedFile.uploadedBy?.toString() || "unknown",
            originalName: savedFile.originalName,
            mimeType: savedFile.mimeType,
            size: savedFile.size.toString(),
            url: savedFile.url,
            timestamp: Date.now().toString(),
          });
          console.log(`📤 [file.uploaded] publié dans events:files`);
        } catch (streamErr) {
          console.error(
            "❌ Erreur publication stream file.uploaded:",
            streamErr.message
          );
        }
      }

      // ✅ TRAITEMENT DES MÉTADONNÉES AUDIO SI BESOIN
      // if (fileEntity.mimeType && fileEntity.mimeType.startsWith("audio/")) {
      //   await processAudioFile(savedFile);
      // }

      return {
        id: savedFile._id, // Retourne l'ID custom
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
