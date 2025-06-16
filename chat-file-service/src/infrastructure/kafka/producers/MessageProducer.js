/**
 * Message Producer - Chat File Service
 * Producer Kafka pour les messages de chat
 */

const { v4: uuidv4 } = require('uuid');

class MessageProducer {
  constructor(kafkaProducer) {
    this.producer = kafkaProducer;
    this.isDevMode = process.env.NODE_ENV === 'development';
  }

  async publishMessage(message) {
    try {
      if (!this.producer) {
        if (this.isDevMode) {
          console.log('📤 [DEV] Message publié (mode local):', {
            messageId: message._id,
            content: message.content?.substring(0, 50) + '...'
          });
          return true;
        }
        throw new Error('Producer Kafka non disponible');
      }

      const kafkaMessage = {
        topic: 'chat.messages',
        messages: [{
          key: message.conversationId,
          value: JSON.stringify({
            messageId: message._id,
            conversationId: message.conversationId,
            senderId: message.senderId,
            receiverId: message.receiverId,
            content: message.content,
            type: message.type || 'TEXT',
            status: message.status,
            timestamp: message.createdAt || new Date().toISOString(),
            metadata: message.metadata || {}
          }),
          headers: {
            'service': 'chat-file-service',
            'event-type': 'message.sent',
            'correlation-id': uuidv4()
          }
        }]
      };

      await this.producer.send(kafkaMessage);
      console.log(`📤 Message publié sur Kafka: ${message._id}`);
    } catch (error) {
      if (this.isDevMode) {
        console.warn('⚠️ Kafka indisponible, mode développement:', error.message);
      } else {
        console.error('❌ Erreur publication message Kafka:', error);
        throw error;
      }
    }
  }

  async publishMessageStatus(messageId, status, userId) {
    try {
      if (!this.producer) {
        if (this.isDevMode) {
          console.log(`📤 [DEV] Statut publié (mode local): ${messageId} -> ${status}`);
          return true;
        }
        throw new Error('Producer Kafka non disponible');
      }

      const kafkaMessage = {
        topic: 'chat.events',
        messages: [{
          key: messageId,
          value: JSON.stringify({
            messageId,
            status,
            userId,
            timestamp: new Date().toISOString()
          }),
          headers: {
            'service': 'chat-file-service',
            'event-type': 'message.status.updated',
            'correlation-id': uuidv4()
          }
        }]
      };

      await this.producer.send(kafkaMessage);
      console.log(`�� Statut message publié: ${messageId} -> ${status}`);
    } catch (error) {
      if (this.isDevMode) {
        console.warn('⚠️ Kafka indisponible, mode développement:', error.message);
      } else {
        console.error('❌ Erreur publication statut:', error);
      }
    }
  }
}

module.exports = MessageProducer;
