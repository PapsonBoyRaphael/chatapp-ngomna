const { Kafka } = require('kafkajs');
const logger = require('../../../shared/utils/logger');

class KafkaService {
  constructor() {
    this.kafka = null;
    this.producer = null;
    this.consumer = null;
    this.isEnabled = process.env.ENABLE_KAFKA === 'true';
    this.connected = false;
  }

  async initialize() {
    if (!this.isEnabled) {
      logger.info('📡 Kafka disabled in configuration');
      return false;
    }

    try {
      this.kafka = new Kafka({
        clientId: process.env.KAFKA_CLIENT_ID || 'chat-files-service',
        brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
        connectionTimeout: 3000,
        retry: {
          initialRetryTime: 100,
          retries: 8
        }
      });

      // Initialiser producteur
      this.producer = this.kafka.producer({
        idempotent: true,
        transactionTimeout: 30000
      });

      // Initialiser consommateur
      this.consumer = this.kafka.consumer({
        groupId: `chat-files-group-${process.env.NODE_ENV || 'development'}`,
        sessionTimeout: 6000,
        heartbeatInterval: 3000
      });

      await this.producer.connect();
      await this.consumer.connect();

      await this.createTopics();
      await this.startConsuming();

      this.connected = true;
      logger.info('✅ Kafka connected and ready');
      return true;

    } catch (error) {
      logger.warn('⚠️ Kafka connection failed:', error.message);
      this.connected = false;
      return false;
    }
  }

  async createTopics() {
    const admin = this.kafka.admin();
    await admin.connect();

    const topics = [
      {
        topic: 'chat.messages',
        numPartitions: 3,
        replicationFactor: 1,
        configEntries: [
          { name: 'cleanup.policy', value: 'compact' },
          { name: 'retention.ms', value: '604800000' }
        ]
      },
      {
        topic: 'chat.files',
        numPartitions: 2,
        replicationFactor: 1
      },
      {
        topic: 'user.activity',
        numPartitions: 3,
        replicationFactor: 1
      },
      {
        topic: 'notifications',
        numPartitions: 2,
        replicationFactor: 1
      }
    ];

    try {
      await admin.createTopics({ topics });
      logger.info('✅ Kafka topics created');
    } catch (error) {
      if (!error.message.includes('already exists')) {
        logger.warn('⚠️ Error creating topics:', error.message);
      }
    }

    await admin.disconnect();
  }

  // Publier un message de chat
  async publishMessage(messageData) {
    if (!this.connected) return;

    try {
      await this.producer.send({
        topic: 'chat.messages',
        messages: [{
          key: messageData.conversationId,
          value: JSON.stringify({
            id: messageData.id,
            conversationId: messageData.conversationId,
            senderId: messageData.senderId,
            senderName: messageData.senderName,
            content: messageData.content,
            type: messageData.type,
            timestamp: messageData.timestamp,
            metadata: {
              service: 'chat-files-service',
              version: '1.0.0'
            }
          }),
          headers: {
            'event-type': Buffer.from('message-sent'),
            'conversation-id': Buffer.from(messageData.conversationId)
          }
        }]
      });

      logger.debug('📤 Message published to Kafka:', messageData.id);
    } catch (error) {
      logger.error('❌ Error publishing message:', error);
    }
  }

  // Publier un upload de fichier
  async publishFileUpload(fileData) {
    if (!this.connected) return;

    try {
      await this.producer.send({
        topic: 'chat.files',
        messages: [{
          key: fileData.conversationId,
          value: JSON.stringify({
            id: fileData.id,
            conversationId: fileData.conversationId,
            uploadedBy: fileData.uploadedBy,
            fileName: fileData.fileName,
            fileSize: fileData.fileSize,
            fileType: fileData.fileType,
            url: fileData.url,
            timestamp: fileData.timestamp
          }),
          headers: {
            'event-type': Buffer.from('file-uploaded'),
            'file-type': Buffer.from(fileData.fileType)
          }
        }]
      });

      logger.debug('📤 File upload published to Kafka:', fileData.id);
    } catch (error) {
      logger.error('❌ Error publishing file upload:', error);
    }
  }

  // Publier activité utilisateur
  async publishUserActivity(activityData) {
    if (!this.connected) return;

    try {
      await this.producer.send({
        topic: 'user.activity',
        messages: [{
          key: activityData.userId,
          value: JSON.stringify({
            userId: activityData.userId,
            action: activityData.action,
            conversationId: activityData.conversationId,
            timestamp: new Date().toISOString(),
            metadata: activityData.metadata || {}
          }),
          headers: {
            'event-type': Buffer.from('user-activity'),
            'action': Buffer.from(activityData.action)
          }
        }]
      });
    } catch (error) {
      logger.error('❌ Error publishing user activity:', error);
    }
  }

  // Publier notification
  async publishNotification(notificationData) {
    if (!this.connected) return;

    try {
      await this.producer.send({
        topic: 'notifications',
        messages: [{
          key: notificationData.userId,
          value: JSON.stringify({
            userId: notificationData.userId,
            type: notificationData.type,
            title: notificationData.title,
            message: notificationData.message,
            conversationId: notificationData.conversationId,
            timestamp: new Date().toISOString(),
            data: notificationData.data || {}
          }),
          headers: {
            'event-type': Buffer.from('notification'),
            'notification-type': Buffer.from(notificationData.type)
          }
        }]
      });
    } catch (error) {
      logger.error('❌ Error publishing notification:', error);
    }
  }

  // Consommer les messages
  async startConsuming() {
    if (!this.connected) return;

    await this.consumer.subscribe({
      topics: ['chat.messages', 'chat.files', 'user.activity', 'notifications'],
      fromBeginning: false
    });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const messageValue = JSON.parse(message.value.toString());
          logger.debug(`📨 Kafka message received on ${topic}:`, messageValue);

          switch (topic) {
            case 'chat.messages':
              await this.handleChatMessage(messageValue);
              break;
            case 'chat.files':
              await this.handleFileMessage(messageValue);
              break;
            case 'user.activity':
              await this.handleUserActivity(messageValue);
              break;
            case 'notifications':
              await this.handleNotification(messageValue);
              break;
          }
        } catch (error) {
          logger.error(`❌ Error processing Kafka message on ${topic}:`, error);
        }
      }
    });
  }

  async handleChatMessage(messageData) {
    // Diffuser via Socket.IO si disponible
    try {
      const SocketIOServer = require('../../../interfaces/websocket/SocketIOServer');
      if (SocketIOServer && SocketIOServer.instance) {
        SocketIOServer.instance.emitToConversation(
          messageData.conversationId, 
          'kafka_message', 
          messageData
        );
      }
    } catch (error) {
      logger.debug('Socket.IO not available for message broadcast');
    }

    await this.updateMessageStats(messageData);
  }

  async handleFileMessage(fileData) {
    logger.info('📁 File message received via Kafka:', fileData.fileName);
    
    await this.publishNotification({
      userId: fileData.uploadedBy,
      type: 'file_share',
      title: 'Fichier partagé',
      message: `${fileData.fileName} a été partagé`,
      conversationId: fileData.conversationId,
      data: { fileUrl: fileData.url, fileType: fileData.fileType }
    });
  }

  async handleUserActivity(activityData) {
    logger.debug(`👤 User activity: ${activityData.action}`, activityData);
    
    try {
      const SocketIOServer = require('../../../interfaces/websocket/SocketIOServer');
      if (SocketIOServer && SocketIOServer.instance) {
        SocketIOServer.instance.emitToConversation(
          activityData.conversationId,
          'user_activity',
          activityData
        );
      }
    } catch (error) {
      logger.debug('Socket.IO not available for activity broadcast');
    }
  }

  async handleNotification(notificationData) {
    logger.info(`🔔 Notification for ${notificationData.userId}:`, notificationData.title);
  }

  async updateMessageStats(messageData) {
    try {
      const redis = require('../../database/redis/connection');
      if (redis.isConnected()) {
        await redis.incr(`stats:messages:${messageData.conversationId}`);
        await redis.incr(`stats:messages:user:${messageData.senderId}`);
        await redis.incr('stats:messages:total');
      }
    } catch (error) {
      logger.error('❌ Error updating message stats:', error);
    }
  }

  async disconnect() {
    if (!this.connected) return;

    try {
      await this.producer?.disconnect();
      await this.consumer?.disconnect();
      this.connected = false;
      logger.info('✅ Kafka disconnected');
    } catch (error) {
      logger.error('❌ Error disconnecting Kafka:', error);
    }
  }
}

module.exports = new KafkaService();
