/**
 * Gestionnaire Pub/Sub Redis
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('PubSubManager');

class PubSubManager {
  constructor(redisClient) {
    this.redisClient = redisClient;
    this.publisher = null;
    this.subscriber = null;
    this.subscribers = new Map(); // channel -> Set of callbacks
    this.isConnected = false;
    this.channelPrefix = 'chat-files:';
  }

  async initialize() {
    try {
      // Créer des clients séparés pour publisher et subscriber
      this.publisher = this.redisClient.duplicate();
      this.subscriber = this.redisClient.duplicate();

      await this.publisher.connect();
      await this.subscriber.connect();

      // Gérer les événements du subscriber
      this.subscriber.on('message', (channel, message) => {
        this.handleMessage(channel, message);
      });

      this.subscriber.on('pmessage', (pattern, channel, message) => {
        this.handlePatternMessage(pattern, channel, message);
      });

      this.isConnected = true;
      logger.info('PubSub Manager initialisé');

    } catch (error) {
      logger.error('Erreur initialisation PubSub:', { error: error.message });
      throw error;
    }
  }

  async disconnect() {
    try {
      if (this.publisher) {
        await this.publisher.quit();
      }
      if (this.subscriber) {
        await this.subscriber.quit();
      }
      
      this.subscribers.clear();
      this.isConnected = false;
      logger.info('PubSub Manager déconnecté');

    } catch (error) {
      logger.error('Erreur déconnexion PubSub:', { error: error.message });
    }
  }

  // Publication de messages

  async publish(channel, data) {
    try {
      if (!this.isConnected) {
        throw new Error('PubSub Manager non connecté');
      }

      const fullChannel = this.buildChannel(channel);
      const message = JSON.stringify({
        data,
        timestamp: new Date().toISOString(),
        source: 'chat-files-service'
      });

      const result = await this.publisher.publish(fullChannel, message);
      
      logger.debug('Message publié:', { channel, subscribers: result });
      return result;

    } catch (error) {
      logger.error('Erreur publication message:', { error: error.message, channel });
      throw error;
    }
  }

  // Souscription aux messages

  async subscribe(channel, callback) {
    try {
      if (!this.isConnected) {
        throw new Error('PubSub Manager non connecté');
      }

      const fullChannel = this.buildChannel(channel);
      
      // Ajouter le callback à la liste des subscribers
      if (!this.subscribers.has(fullChannel)) {
        this.subscribers.set(fullChannel, new Set());
        await this.subscriber.subscribe(fullChannel);
      }
      
      this.subscribers.get(fullChannel).add(callback);
      
      logger.debug('Souscription ajoutée:', { channel });

    } catch (error) {
      logger.error('Erreur souscription:', { error: error.message, channel });
      throw error;
    }
  }

  async unsubscribe(channel, callback = null) {
    try {
      const fullChannel = this.buildChannel(channel);
      
      if (!this.subscribers.has(fullChannel)) {
        return;
      }

      const channelSubscribers = this.subscribers.get(fullChannel);
      
      if (callback) {
        channelSubscribers.delete(callback);
      } else {
        channelSubscribers.clear();
      }

      // Si plus de callbacks, se désabonner du channel
      if (channelSubscribers.size === 0) {
        this.subscribers.delete(fullChannel);
        await this.subscriber.unsubscribe(fullChannel);
      }

      logger.debug('Désouscription:', { channel });

    } catch (error) {
      logger.error('Erreur désouscription:', { error: error.message, channel });
    }
  }

  async psubscribe(pattern, callback) {
    try {
      if (!this.isConnected) {
        throw new Error('PubSub Manager non connecté');
      }

      const fullPattern = this.buildChannel(pattern);
      
      if (!this.subscribers.has(fullPattern)) {
        this.subscribers.set(fullPattern, new Set());
        await this.subscriber.psubscribe(fullPattern);
      }
      
      this.subscribers.get(fullPattern).add(callback);
      
      logger.debug('Souscription pattern ajoutée:', { pattern });

    } catch (error) {
      logger.error('Erreur souscription pattern:', { error: error.message, pattern });
      throw error;
    }
  }

  // Événements spécifiques aux fichiers

  async publishFileUploaded(fileData) {
    return await this.publish('file.uploaded', {
      type: 'FILE_UPLOADED',
      fileId: fileData.id,
      fileName: fileData.originalName,
      uploadedBy: fileData.uploadedBy,
      conversationId: fileData.conversationId,
      messageId: fileData.messageId,
      size: fileData.size,
      mimeType: fileData.mimeType
    });
  }

  async publishFileProcessed(fileId, processingData) {
    return await this.publish('file.processed', {
      type: 'FILE_PROCESSED',
      fileId,
      status: processingData.status,
      versions: processingData.versions,
      metadata: processingData.metadata
    });
  }

  async publishFileDeleted(fileId, deletedBy) {
    return await this.publish('file.deleted', {
      type: 'FILE_DELETED',
      fileId,
      deletedBy,
      deletedAt: new Date().toISOString()
    });
  }

  async publishFileShared(fileId, sharedWith, sharedBy, permission) {
    return await this.publish('file.shared', {
      type: 'FILE_SHARED',
      fileId,
      sharedWith,
      sharedBy,
      permission,
      sharedAt: new Date().toISOString()
    });
  }

  async publishFileScanResult(fileId, scanResult) {
    return await this.publish('file.scan.result', {
      type: 'FILE_SCAN_RESULT',
      fileId,
      isSafe: scanResult.isSafe,
      threats: scanResult.threats,
      scanProvider: scanResult.scanProvider
    });
  }

  // Événements de conversation

  async publishConversationFileAdded(conversationId, fileId, addedBy) {
    return await this.publish(`conversation.${conversationId}.file.added`, {
      type: 'CONVERSATION_FILE_ADDED',
      conversationId,
      fileId,
      addedBy,
      addedAt: new Date().toISOString()
    });
  }

  // Événements de message

  async publishMessageFileAttached(messageId, fileId, senderId) {
    return await this.publish('message.file.attached', {
      type: 'MESSAGE_FILE_ATTACHED',
      messageId,
      fileId,
      senderId,
      attachedAt: new Date().toISOString()
    });
  }

  // Événements système

  async publishStorageQuotaExceeded(userId, usage, limit) {
    return await this.publish('system.quota.exceeded', {
      type: 'STORAGE_QUOTA_EXCEEDED',
      userId,
      currentUsage: usage,
      quotaLimit: limit,
      timestamp: new Date().toISOString()
    });
  }

  async publishSystemMaintenance(maintenanceData) {
    return await this.publish('system.maintenance', {
      type: 'SYSTEM_MAINTENANCE',
      action: maintenanceData.action,
      details: maintenanceData.details,
      scheduledAt: maintenanceData.scheduledAt
    });
  }

  // Souscriptions utilitaires

  subscribeToFileEvents(callbacks) {
    const events = {
      'file.uploaded': callbacks.onFileUploaded,
      'file.processed': callbacks.onFileProcessed,
      'file.deleted': callbacks.onFileDeleted,
      'file.shared': callbacks.onFileShared,
      'file.scan.result': callbacks.onFileScanResult
    };

    for (const [event, callback] of Object.entries(events)) {
      if (callback) {
        this.subscribe(event, callback);
      }
    }
  }

  subscribeToConversationFiles(conversationId, callback) {
    const pattern = `conversation.${conversationId}.file.*`;
    this.psubscribe(pattern, callback);
  }

  subscribeToUserFiles(userId, callback) {
    const pattern = `user.${userId}.file.*`;
    this.psubscribe(pattern, callback);
  }

  // Gestion des messages reçus

  handleMessage(channel, message) {
    try {
      const parsedMessage = JSON.parse(message);
      const subscribers = this.subscribers.get(channel);
      
      if (subscribers) {
        subscribers.forEach(callback => {
          try {
            callback(parsedMessage.data, channel, parsedMessage);
          } catch (error) {
            logger.error('Erreur callback subscriber:', { 
              error: error.message, 
              channel 
            });
          }
        });
      }

    } catch (error) {
      logger.error('Erreur traitement message:', { 
        error: error.message, 
        channel, 
        message 
      });
    }
  }

  handlePatternMessage(pattern, channel, message) {
    try {
      const parsedMessage = JSON.parse(message);
      const subscribers = this.subscribers.get(pattern);
      
      if (subscribers) {
        subscribers.forEach(callback => {
          try {
            callback(parsedMessage.data, channel, parsedMessage, pattern);
          } catch (error) {
            logger.error('Erreur callback pattern subscriber:', { 
              error: error.message, 
              pattern, 
              channel 
            });
          }
        });
      }

    } catch (error) {
      logger.error('Erreur traitement message pattern:', { 
        error: error.message, 
        pattern, 
        channel, 
        message 
      });
    }
  }

  // Statistiques

  async getChannelStats() {
    try {
      const stats = {
        totalChannels: this.subscribers.size,
        channels: {}
      };

      for (const [channel, callbacks] of this.subscribers) {
        stats.channels[channel] = {
          subscribers: callbacks.size,
          isPattern: channel.includes('*')
        };
      }

      return stats;

    } catch (error) {
      logger.error('Erreur statistiques channels:', { error: error.message });
      return { totalChannels: 0, channels: {} };
    }
  }

  // Utilitaires

  buildChannel(channel) {
    return `${this.channelPrefix}${channel}`;
  }

  removeChannelPrefix(channel) {
    if (channel.startsWith(this.channelPrefix)) {
      return channel.substring(this.channelPrefix.length);
    }
    return channel;
  }
}

module.exports = PubSubManager;
