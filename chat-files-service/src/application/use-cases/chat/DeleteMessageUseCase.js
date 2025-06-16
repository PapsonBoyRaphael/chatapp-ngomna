/**
 * Use Case: Supprimer un message
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const { AuthorizationException } = require('../../../shared/exceptions/AuthorizationException');

const logger = createLogger('DeleteMessageUseCase');

class DeleteMessageUseCase {
  constructor(dependencies) {
    this.messageRepository = dependencies.messageRepository;
    this.conversationRepository = dependencies.conversationRepository;
    this.notificationService = dependencies.notificationService;
    this.authenticationService = dependencies.authenticationService;
  }

  async execute(params) {
    try {
      const { messageId, userId, deleteType = 'soft' } = params;

      logger.info('Suppression d\'un message:', { messageId, userId, deleteType });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Récupérer le message
      const message = await this.getAndVerifyMessage(messageId);

      // 3. Vérifier les permissions
      await this.checkPermissions(userId, message);

      // 4. Supprimer le message
      let deletedMessage;
      if (deleteType === 'hard') {
        deletedMessage = await this.hardDeleteMessage(message);
      } else {
        deletedMessage = await this.softDeleteMessage(message, userId);
      }

      // 5. Notifier les participants
      await this.sendNotifications(deletedMessage, deleteType);

      logger.info('Message supprimé avec succès:', { messageId, userId, deleteType });

      return { success: true, messageId, deleteType };

    } catch (error) {
      logger.error('Erreur lors de la suppression du message:', { error: error.message, params });
      throw error;
    }
  }

  async validateInput(params) {
    const { messageId, userId } = params;

    if (!messageId) {
      throw new ValidationException('ID du message requis');
    }

    if (!userId) {
      throw new ValidationException('ID utilisateur requis');
    }
  }

  async getAndVerifyMessage(messageId) {
    const message = await this.messageRepository.findById(messageId);
    
    if (!message) {
      throw new ValidationException('Message non trouvé');
    }

    if (message.deletedAt) {
      throw new ValidationException('Message déjà supprimé');
    }

    return message;
  }

  async checkPermissions(userId, message) {
    // L'utilisateur peut supprimer ses propres messages
    if (message.senderId === userId) {
      return true;
    }

    // Vérifier si l'utilisateur est admin de la conversation
    const isAdmin = await this.conversationRepository.isAdmin(message.conversationId, userId);
    if (isAdmin) {
      return true;
    }

    // Vérifier les permissions système
    if (this.authenticationService) {
      const hasPermission = await this.authenticationService.hasPermission(
        { id: userId }, 
        'chat.delete'
      );
      if (hasPermission) {
        return true;
      }
    }

    throw new AuthorizationException('Vous n\'êtes pas autorisé à supprimer ce message');
  }

  async softDeleteMessage(message, userId) {
    const updateData = {
      deletedAt: new Date(),
      deletedBy: userId,
      content: '[Message supprimé]',
      metadata: {
        ...message.metadata,
        originalContent: message.content,
        deletionReason: 'user_request'
      }
    };

    return await this.messageRepository.update(message.id, updateData);
  }

  async hardDeleteMessage(message) {
    // Supprimer définitivement le message
    await this.messageRepository.delete(message.id);
    
    return {
      ...message,
      deletedAt: new Date(),
      hardDeleted: true
    };
  }

  async sendNotifications(message, deleteType) {
    try {
      if (this.notificationService) {
        await this.notificationService.broadcastToConversation(message.conversationId, {
          type: 'message_deleted',
          data: {
            messageId: message.id,
            conversationId: message.conversationId,
            deleteType,
            deletedAt: message.deletedAt
          }
        });
      }
    } catch (error) {
      logger.warn('Erreur lors de l\'envoi des notifications de suppression:', { 
        messageId: message.id, 
        error: error.message 
      });
    }
  }
}

module.exports = DeleteMessageUseCase;
