class UploadFile {
  constructor(fileRepository, kafkaProducer = null, redisClient = null) {
    this.fileRepository = fileRepository;
    this.kafkaProducer = kafkaProducer;
    this.redisClient = redisClient;
  }

  async execute(fileData) {
    try {
      // Validation des données
      if (!fileData.originalName || !fileData.filename) {
        throw new Error('Données de fichier incomplètes');
      }

      // Sauvegarder le fichier
      const savedFile = await this.fileRepository.save({
        originalName: fileData.originalName,
        filename: fileData.filename,
        path: fileData.path,
        size: fileData.size,
        mimetype: fileData.mimetype,
        uploadedBy: fileData.uploadedBy,
        conversationId: fileData.conversationId,
        uploadedAt: new Date(),
        status: 'active'
      });

      // Publier événement Kafka
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: 'FILE_UPLOADED_SUCCESS',
            fileId: String(savedFile.id),
            userId: fileData.uploadedBy,
            filename: fileData.originalName,
            size: String(fileData.size),
            timestamp: new Date().toISOString()
          });
        } catch (kafkaError) {
          console.warn('⚠️ Erreur Kafka upload:', kafkaError.message);
        }
      }

      return {
        id: savedFile.id,
        originalName: savedFile.originalName,
        filename: savedFile.filename,
        size: savedFile.size,
        mimetype: savedFile.mimetype,
        uploadedAt: savedFile.uploadedAt,
        url: `/uploads/${savedFile.filename}`
      };

    } catch (error) {
      console.error('❌ Erreur UploadFile use case:', error);
      throw error;
    }
  }
}

module.exports = UploadFile;
