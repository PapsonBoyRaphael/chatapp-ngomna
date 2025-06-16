/**
 * Use Case: Diffuser un message en temps réel
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');

const logger = createLogger('BroadcastMessageUseCase');

class BroadcastMessageUseCase {
  constructor(dependencies) {
    this.connectionManager = dependencies.connectionManager;
    this.conversationRepository = dependencies.conversationRepository;
    this.notificationService = dependencies.notificationService;
    this.socketServer = dependencies.socketServer;
  }

  async execute(params) {
    try {
      const { 
        type, 
        data, 
        target, 
        excludeUsers = [], 
        priority = 'normal',
        persistent = false 
      } = params;

      logger.info('Diffusion de message temps réel:', { type, target, priority });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Déterminer les destinataires
      const recipients = await this.determineRecipients(target, excludeUsers);

      // 3. Préparer le message
      const message = await this.prepareMessage(type, data, priority);

      // 4. Diffuser le message
      const deliveryResults = await this.broadcastMessage(message, recipients, target);

      // 5. Gérer la persistance si nécessaire
      if (persistent) {
        await this.persistMessage(message, recipients);
      }

      // 6. Enregistrer les métriques
      await this.recordMetrics(type, recipients.length, deliveryResults);

      logger.info('Message diffusé avec succès:', { 
        type, 
        recipientCount: recipients.length, 
        delivered: deliveryResults.delivered,
        failed: deliveryResults.failed 
      });

      return {
        success: true,
        type,
        recipientCount: recipients.length,
        deliveryResults,
        broadcastedAt: new Date()
      };

    } catch (error) {
      logger.error('Erreur lors de la diffusion du message:', { error: error.message, params });
      throw error;
    }
  }

  async validateInput(params) {
    const { type, data, target } = params;

    if (!type) {
      throw new ValidationException('Type de message requis');
    }

    if (!data) {
      throw new ValidationException('Données du message requises');
    }

    if (!target) {
      throw new ValidationException('Cible de diffusion requise');
    }

    // Valider le format de la cible
    if (typeof target === 'object') {
      if (target.type && !['user', 'conversation', 'broadcast', 'role'].includes(target.type)) {
        throw new ValidationException('Type de cible invalide');
      }
    }
  }

  async determineRecipients(target, excludeUsers) {
    let recipients = [];

    if (typeof target === 'string') {
      // Cible simple (userId ou conversationId)
      if (target.startsWith('user:')) {
        recipients = [target.replace('user:', '')];
      } else if (target.startsWith('conversation:')) {
        const conversationId = target.replace('conversation:', '');
        const conversation = await this.conversationRepository.findById(conversationId);
        if (conversation) {
          recipients = conversation.participants;
        }
      }
    } else if (typeof target === 'object') {
      switch (target.type) {
        case 'user':
          recipients = Array.isArray(target.ids) ? target.ids : [target.id];
          break;

        case 'conversation':
          const conversation = await this.conversationRepository.findById(target.id);
          if (conversation) {
            recipients = conversation.participants;
          }
          break;

        case 'broadcast':
          // Diffusion globale - récupérer tous les utilisateurs connectés
          recipients = await this.connectionManager.getAllConnectedUsers();
          break;

        case 'role':
          // Diffusion par rôle (non implémenté dans cette version)
          recipients = [];
          break;

        default:
          throw new ValidationException('Type de cible non supporté');
      }
    }

    // Exclure les utilisateurs spécifiés
    return recipients.filter(userId => !excludeUsers.includes(userId));
  }

  async prepareMessage(type, data, priority) {
    return {
      id: this.generateMessageId(),
      type,
      data,
      priority,
      timestamp: new Date().toISOString(),
      serverTime: Date.now()
    };
  }

  async broadcastMessage(message, recipients, target) {
    const deliveryResults = {
      delivered: 0,
      failed: 0,
      offline: 0,
      errors: []
    };

    // Diffusion selon le type de cible
    if (typeof target === 'string' && target.startsWith('conversation:')) {
      // Diffusion dans une room de conversation
      await this.broadcastToConversation(target, message, deliveryResults);
    } else {
      // Diffusion individuelle
      await this.broadcastToUsers(recipients, message, deliveryResults);
    }

    return deliveryResults;
  }

  async broadcastToConversation(conversationTarget, message, deliveryResults) {
    try {
      const roomName = conversationTarget; // Format: "conversation:id"
      
      if (this.socketServer) {
        this.socketServer.to(roomName).emit('realtime_message', message);
        deliveryResults.delivered++;
      }

    } catch (error) {
      logger.warn('Erreur lors de la diffusion vers la conversation:', { 
        conversationTarget, 
        error: error.message 
      });
      deliveryResults.failed++;
      deliveryResults.errors.push(error.message);
    }
  }

  async broadcastToUsers(recipients, message, deliveryResults) {
    for (const userId of recipients) {
      try {
        // Récupérer les connexions actives de l'utilisateur
        const connections = await this.connectionManager.getActiveConnections(userId);

        if (connections.length === 0) {
          // Utilisateur hors ligne
          deliveryResults.offline++;
          
          // Stocker pour livraison ultérieure si nécessaire
          if (message.priority === 'high') {
            await this.storeForLaterDelivery(userId, message);
          }
        } else {
          // Envoyer à toutes les connexions actives de l'utilisateur
          for (const connection of connections) {
            if (this.socketServer) {
              this.socketServer.to(connection.socketId).emit('realtime_message', message);
            }
          }
          deliveryResults.delivered++;
        }

      } catch (error) {
        logger.warn('Erreur lors de la diffusion vers l\'utilisateur:', { 
          userId, 
          error: error.message 
        });
        deliveryResults.failed++;
        deliveryResults.errors.push(`${userId}: ${error.message}`);
      }
    }
  }

  async persistMessage(message, recipients) {
    try {
      if (this.notificationService) {
        // Persister le message pour les utilisateurs hors ligne
        for (const userId of recipients) {
          await this.notificationService.storePendingNotification(userId, {
            type: message.type,
            data: message.data,
            priority: message.priority,
            createdAt: new Date()
          });
        }
      }
    } catch (error) {
      logger.warn('Erreur lors de la persistance du message:', { error: error.message });
    }
  }

  async storeForLaterDelivery(userId, message) {
    try {
      if (this.notificationService) {
        await this.notificationService.storePendingNotification(userId, {
          type: message.type,
          data: message.data,
          priority: message.priority,
          createdAt: new Date(),
          retryCount: 0
        });
      }
    } catch (error) {
      logger.warn('Erreur lors du stockage pour livraison ultérieure:', { 
        userId, 
        error: error.message 
      });
    }
  }

  async recordMetrics(type, recipientCount, deliveryResults) {
    try {
      // Enregistrer les métriques de diffusion
      const metrics = {
        type,
        recipientCount,
        delivered: deliveryResults.delivered,
        failed: deliveryResults.failed,
        offline: deliveryResults.offline,
        successRate: (deliveryResults.delivered / recipientCount) * 100,
        timestamp: new Date()
      };

      // Ici on pourrait envoyer vers un service de métriques
      logger.debug('Métriques de diffusion:', metrics);

    } catch (error) {
      logger.warn('Erreur lors de l\'enregistrement des métriques:', { error: error.message });
    }
  }

  generateMessageId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = BroadcastMessageUseCase;
