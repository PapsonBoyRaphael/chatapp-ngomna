/**
 * File Producer - Chat File Service
 * Producer Kafka pour les fichiers
 */

const { v4: uuidv4 } = require('uuid');

class FileProducer {
  constructor(kafkaProducer) {
    this.producer = kafkaProducer;
    this.isDevMode = process.env.NODE_ENV === 'development';
  }

  async publishFileUpload(file, message) {
    try {
      if (!this.producer) {
        if (this.isDevMode) {
          console.log('📤 [DEV] Fichier publié (mode local):', {
            fileName: file.originalName,
            size: file.size
          });
          return true;
        }
        throw new Error('Producer Kafka non disponible');
      }

      const kafkaMessage = {
        topic: 'chat.files',
        messages: [{
          key: file.conversationId,
          value: JSON.stringify({
            fileId: file._id,
            messageId: message._id,
            conversationId: file.conversationId,
            uploadedBy: file.uploadedBy,
            originalName: file.originalName,
            fileName: file.fileName,
            mimeType: file.mimeType,
            size: file.size,
            url: file.url,
            metadata: file.metadata,
            timestamp: file.createdAt || new Date().toISOString()
          }),
          headers: {
            'service': 'chat-file-service',
            'event-type': 'file.uploaded',
            'correlation-id': uuidv4()
          }
        }]
      };

      await this.producer.send(kafkaMessage);
      console.log(`�� Upload fichier publié: ${file.originalName}`);
    } catch (error) {
      if (this.isDevMode) {
        console.warn('⚠️ Kafka indisponible, mode développement:', error.message);
      } else {
        console.error('❌ Erreur publication fichier:', error);
        throw error;
      }
    }
  }

  async publishFileDownload(fileId, userId) {
    try {
      if (!this.producer) {
        if (this.isDevMode) {
          console.log(`📤 [DEV] Téléchargement publié (mode local): ${fileId}`);
          return true;
        }
        throw new Error('Producer Kafka non disponible');
      }

      const kafkaMessage = {
        topic: 'chat.events',
        messages: [{
          key: fileId,
          value: JSON.stringify({
            fileId,
            userId,
            action: 'download',
            timestamp: new Date().toISOString()
          }),
          headers: {
            'service': 'chat-file-service',
            'event-type': 'file.downloaded',
            'correlation-id': uuidv4()
          }
        }]
      };

      await this.producer.send(kafkaMessage);
      console.log(`📤 Téléchargement fichier publié: ${fileId}`);
    } catch (error) {
      if (this.isDevMode) {
        console.warn('⚠️ Kafka indisponible, mode développement:', error.message);
      } else {
        console.error('❌ Erreur publication téléchargement:', error);
      }
    }
  }
}

module.exports = FileProducer;
