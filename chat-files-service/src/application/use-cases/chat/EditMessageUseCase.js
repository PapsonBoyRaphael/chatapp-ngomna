/**
 * Use Case: Modifier un message
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const { AuthorizationException } = require('../../../shared/exceptions/AuthorizationException');
const MessageResponse = require('../../dto/responses/MessageResponse');

const logger = createLogger('EditMessageUseCase');

class EditMessageUseCase {
  constructor(dependencies) {
    this.messageRepository = dependencies.messageRepository;
    this.conversationRepository = dependencies.conversationRepository;
    this.notificationService = dependencies.notificationService;
    this.authenticationService = dependencies.authenticationService;
  }

  async execute(params) {
    try {
      const { messageId, userId, newContent, metadata = {} } = params;

      logger.info('Modification d\'un message:', { messageId, userId });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Récupérer le message
      const message = await this.getAndVerifyMessage(messageId);

      // 3. Vérifier les permissions
      await this.checkPermissions(userId, message);

      // 4. Vérifier la possibilité de modification
      await this.checkEditability(message);

      // 5. Modifier le message
      const updatedMessage = await this.updateMessage(message, newContent, userId, metadata);

      // 6. Notifier les participants
      await this.sendNotifications(updatedMessage);

      logger.info('Message modifié avec succès:', { messageId, userId });

      return new MessageResponse(updatedMessage);

    } catch (error) {
      logger.error('Erreur lors de la modification du message:', { error: error.message, params });
      throw error;
    }
  }

  async validateInput(params) {
    const { messageId, userId, newContent } = params;

    if (!messageId) {
      throw new ValidationException('ID du message requis');
    }

    if (!userId) {
      throw new ValidationException('ID utilisateur requis');
    }

    if (!newContent || newContent.trim().length === 0) {
      throw new ValidationException('Nouveau contenu requis');
    }

    if (newContent.length > 5000) {
      throw new ValidationException('Le message ne peut pas dépasser 5000 caractères');
    }
  }

  async getAndVerifyMessage(messageId) {
    const message = await this.messageRepository.findById(messageId);
    
    if (!message) {
      throw new ValidationException('Message non trouvé');
    }

    if (message.deletedAt) {
      throw new ValidationException('Impossible de modifier un message supprimé');
    }

    return message;
  }

  async checkPermissions(userId, message) {
    // Seul l'expéditeur peut modifier son message
    if (message.senderId !== userId) {
      // Exception: les admins peuvent modifier les messages
      if (this.authenticationService) {
        const hasPermission = await this.authenticationService.hasPermission(
          { id: userId }, 
          'chat.edit'
        );
        if (!hasPermission) {
          throw new AuthorizationException('Vous ne pouvez modifier que vos propres messages');
        }
      } else {
        throw new AuthorizationException('Vous ne pouvez modifier que vos propres messages');
      }
    }
  }

  async checkEditability(message) {
    // Vérifier si le message peut encore être modifié
    const maxEditTime = 15 * 60 * 1000; // 15 minutes
    const timeSinceCreation = Date.now() - new Date(message.createdAt).getTime();

    if (timeSinceCreation > maxEditTime) {
      throw new ValidationException('Le délai de modification (15 minutes) est dépassé');
    }

    // Les messages de type fichier ne peuvent pas être modifiés
    if (message.type === 'file') {
      throw new ValidationException('Les messages contenant des fichiers ne peuvent pas être modifiés');
    }

    // Vérifier si le message a déjà été modifié trop de fois
    const editCount = message.metadata?.editCount || 0;
    if (editCount >= 5) {
      throw new ValidationException('Nombre maximum de modifications atteint (5)');
    }
  }

  async updateMessage(message, newContent, userId, metadata) {
    const updateData = {
      content: newContent.trim(),
      editedAt: new Date(),
      editedBy: userId,
      metadata: {
        ...message.metadata,
        ...metadata,
        editHistory: [
          ...(message.metadata?.editHistory || []),
          {
            previousContent: message.content,
            editedAt: new Date(),
            editedBy: userId
          }
        ],
        editCount: (message.metadata?.editCount || 0) + 1
      },
      updatedAt: new Date()
    };

    return await this.messageRepository.update(message.id, updateData);
  }

  async sendNotifications(message) {
    try {
      if (this.notificationService) {
        await this.notificationService.broadcastToConversation(message.conversationId, {
          type: 'message_edited',
          data: new MessageResponse(message)
        });
      }
    } catch (error) {
      logger.warn('Erreur lors de l\'envoi des notifications de modification:', { 
        messageId: message.id, 
        error: error.message 
      });
    }
  }
}

module.exports = EditMessageUseCase;
