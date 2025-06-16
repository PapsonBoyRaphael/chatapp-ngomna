/**
 * Use Case: Transférer un message
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const { AuthorizationException } = require('../../../shared/exceptions/AuthorizationException');
const MessageResponse = require('../../dto/responses/MessageResponse');

const logger = createLogger('ForwardMessageUseCase');

class ForwardMessageUseCase {
  constructor(dependencies) {
    this.messageRepository = dependencies.messageRepository;
    this.conversationRepository = dependencies.conversationRepository;
    this.notificationService = dependencies.notificationService;
    this.authenticationService = dependencies.authenticationService;
  }

  async execute(params) {
    try {
      const { messageId, userId, targetConversationIds, comment } = params;

      logger.info('Transfert d\'un message:', { messageId, userId, targetCount: targetConversationIds.length });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Récupérer le message source
      const sourceMessage = await this.getAndVerifyMessage(messageId);

      // 3. Vérifier les permissions sur le message source
      await this.checkSourcePermissions(userId, sourceMessage);

      // 4. Vérifier les permissions sur les conversations cibles
      await this.checkTargetPermissions(userId, targetConversationIds);

      // 5. Transférer le message vers chaque conversation
      const forwardedMessages = await this.forwardToConversations(
        sourceMessage, 
        userId, 
        targetConversationIds, 
        comment
      );

      // 6. Envoyer les notifications
      await this.sendNotifications(forwardedMessages);

      logger.info('Message transféré avec succès:', { 
        messageId, 
        userId, 
        forwardedCount: forwardedMessages.length 
      });

      return forwardedMessages.map(msg => new MessageResponse(msg));

    } catch (error) {
      logger.error('Erreur lors du transfert du message:', { error: error.message, params });
      throw error;
    }
  }

  async validateInput(params) {
    const { messageId, userId, targetConversationIds } = params;

    if (!messageId) {
      throw new ValidationException('ID du message requis');
    }

    if (!userId) {
      throw new ValidationException('ID utilisateur requis');
    }

    if (!targetConversationIds || !Array.isArray(targetConversationIds) || targetConversationIds.length === 0) {
      throw new ValidationException('Au moins une conversation cible requise');
    }

    if (targetConversationIds.length > 10) {
      throw new ValidationException('Maximum 10 conversations cibles autorisées');
    }
  }

  async getAndVerifyMessage(messageId) {
    const message = await this.messageRepository.findById(messageId);
    
    if (!message) {
      throw new ValidationException('Message non trouvé');
    }

    if (message.deletedAt) {
      throw new ValidationException('Impossible de transférer un message supprimé');
    }

    return message;
  }

  async checkSourcePermissions(userId, message) {
    // Vérifier que l'utilisateur peut lire le message source
    const canRead = await this.conversationRepository.isParticipant(message.conversationId, userId);
    
    if (!canRead) {
      throw new AuthorizationException('Vous n\'êtes pas autorisé à lire ce message');
    }
  }

  async checkTargetPermissions(userId, targetConversationIds) {
    for (const conversationId of targetConversationIds) {
      const canWrite = await this.conversationRepository.isParticipant(conversationId, userId);
      
      if (!canWrite) {
        throw new AuthorizationException(`Vous n'êtes pas autorisé à écrire dans la conversation ${conversationId}`);
      }

      // Vérifier que la conversation n'est pas archivée
      const conversation = await this.conversationRepository.findById(conversationId);
      if (conversation?.status === 'archived') {
        throw new ValidationException(`La conversation ${conversationId} est archivée`);
      }
    }
  }

  async forwardToConversations(sourceMessage, userId, targetConversationIds, comment) {
    const forwardedMessages = [];

    for (const targetConversationId of targetConversationIds) {
      try {
        const forwardedMessage = await this.createForwardedMessage(
          sourceMessage, 
          userId, 
          targetConversationId, 
          comment
        );

        forwardedMessages.push(forwardedMessage);

        // Mettre à jour l'activité de la conversation cible
        await this.updateConversationLastActivity(targetConversationId, forwardedMessage);

      } catch (error) {
        logger.warn('Échec du transfert vers une conversation:', { 
          targetConversationId, 
          error: error.message 
        });
        // Continuer avec les autres conversations
      }
    }

    return forwardedMessages;
  }

  async createForwardedMessage(sourceMessage, userId, targetConversationId, comment) {
    const forwardedMessageData = {
      senderId: userId,
      conversationId: targetConversationId,
      content: comment || sourceMessage.content,
      type: sourceMessage.type,
      fileId: sourceMessage.fileId,
      metadata: {
        isForwarded: true,
        originalMessage: {
          id: sourceMessage.id,
          senderId: sourceMessage.senderId,
          conversationId: sourceMessage.conversationId,
          content: sourceMessage.content,
          createdAt: sourceMessage.createdAt
        },
        forwardedBy: userId,
        forwardedAt: new Date(),
        comment: comment || null
      },
      status: 'sent',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    return await this.messageRepository.create(forwardedMessageData);
  }

  async updateConversationLastActivity(conversationId, message) {
    try {
      await this.conversationRepository.updateLastActivity(conversationId, {
        lastMessageId: message.id,
        lastActivity: message.createdAt
      });
    } catch (error) {
      logger.warn('Impossible de mettre à jour l\'activité de la conversation:', { 
        conversationId, 
        error: error.message 
      });
    }
  }

  async sendNotifications(forwardedMessages) {
    try {
      if (this.notificationService) {
        for (const message of forwardedMessages) {
          await this.notificationService.broadcastToConversation(message.conversationId, {
            type: 'new_message',
            data: new MessageResponse(message)
          });
        }
      }
    } catch (error) {
      logger.warn('Erreur lors de l\'envoi des notifications de transfert:', { 
        error: error.message 
      });
    }
  }
}

module.exports = ForwardMessageUseCase;
