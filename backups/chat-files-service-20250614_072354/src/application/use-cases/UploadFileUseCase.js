const kafkaService = require('../../infrastructure/messaging/kafka/KafkaService');

class UploadFileUseCase {
  constructor(fileRepository, storageService) {
    this.fileRepository = fileRepository;
    this.storageService = storageService;
  }

  async execute(fileData, conversationId, uploadedBy) {
    try {
      // Sauvegarder le fichier
      const savedFile = await this.storageService.save(fileData);
      
      // Enregistrer en base
      const fileRecord = await this.fileRepository.save({
        ...savedFile,
        conversationId,
        uploadedBy,
        timestamp: new Date().toISOString()
      });

      // Publier sur Kafka
      await kafkaService.publishFileUpload({
        id: fileRecord.id,
        conversationId: fileRecord.conversationId,
        uploadedBy: fileRecord.uploadedBy,
        fileName: fileRecord.fileName,
        fileSize: fileRecord.fileSize,
        fileType: fileRecord.fileType,
        url: fileRecord.url,
        timestamp: fileRecord.timestamp
      });

      // Publier activité utilisateur
      await kafkaService.publishUserActivity({
        userId: uploadedBy,
        action: 'file_uploaded',
        conversationId: conversationId,
        metadata: {
          fileId: fileRecord.id,
          fileName: fileRecord.fileName,
          fileType: fileRecord.fileType
        }
      });

      return fileRecord;

    } catch (error) {
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }
}

module.exports = UploadFileUseCase;
