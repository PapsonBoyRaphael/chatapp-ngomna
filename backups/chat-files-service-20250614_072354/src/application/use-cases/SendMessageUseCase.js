const kafkaService = require('../../infrastructure/messaging/kafka/KafkaService');

class SendMessageUseCase {
  constructor(messageRepository, socketIOService) {
    this.messageRepository = messageRepository;
    this.socketIOService = socketIOService;
  }

  async execute(messageData) {
    try {
      // Sauvegarder le message
      const savedMessage = await this.messageRepository.save(messageData);

      // Diffuser via Socket.IO (temps réel)
      if (this.socketIOService) {
        this.socketIOService.emitToConversation(
          messageData.conversationId,
          'message',
          savedMessage
        );
      }

      // Publier sur Kafka (événement)
      await kafkaService.publishMessage({
        id: savedMessage.id,
        conversationId: savedMessage.conversationId,
        senderId: savedMessage.senderId,
        senderName: savedMessage.senderName,
        content: savedMessage.content,
        type: savedMessage.type,
        timestamp: savedMessage.timestamp
      });

      // Publier activité utilisateur
      await kafkaService.publishUserActivity({
        userId: savedMessage.senderId,
        action: 'message_sent',
        conversationId: savedMessage.conversationId,
        metadata: {
          messageId: savedMessage.id,
          messageType: savedMessage.type
        }
      });

      return savedMessage;

    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }
}

module.exports = SendMessageUseCase;
