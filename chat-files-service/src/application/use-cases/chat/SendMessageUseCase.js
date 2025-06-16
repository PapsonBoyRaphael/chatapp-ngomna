/**
 * Use Case: Envoyer un message
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const { AuthorizationException } = require('../../../shared/exceptions/AuthorizationException');
const MessageResponse = require('../../dto/responses/MessageResponse');

const logger = createLogger('SendMessageUseCase');

class SendMessageUseCase {
  constructor(dependencies) {
    this.messageRepository = dependencies.messageRepository;
    this.conversationRepository = dependencies.conversationRepository;
    this.fileRepository = dependencies.fileRepository;
    this.notificationService = dependencies.notificationService;
    this.validationService = dependencies.validationService;
    this.authenticationService = dependencies.authenticationService;
  }

  async execute(params) {
    try {
      const { senderId, conversationId, content, type = 'text', fileId, replyTo, metadata = {} } = params;

      logger.info('Envoi d\'un message:', { senderId, conversationId, type });

      // 1. Valider les données
      await this.validateInput(params);

      // 2. Vérifier les permissions
      await this.checkPermissions(senderId, conversationId);

      // 3. Vérifier la conversation
      const conversation = await this.verifyConversation(conversationId);

      // 4. Traiter le fichier si nécessaire
      let fileInfo = null;
      if (fileId) {
        fileInfo = await this.verifyFile(fileId, senderId);
      }

      // 5. Vérifier le message de réponse si nécessaire
      if (replyTo) {
        await this.verifyReplyMessage(replyTo, conversationId);
      }

      // 6. Créer le message
      const messageData = {
        senderId,
        conversationId,
        content: content?.trim(),
        type,
        fileId,
        replyTo,
        metadata: {
          ...metadata,
          userAgent: metadata.userAgent,
          ip: metadata.ip,
          fileInfo
        },
        status: 'sent',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const message = await this.messageRepository.create(messageData);

      // 7. Mettre à jour la conversation
      await this.updateConversationLastActivity(conversationId, message);

      // 8. Envoyer les notifications temps réel
      await this.sendNotifications(message, conversation);

      logger.info('Message envoyé avec succès:', { messageId: message.id, senderId, conversationId });

      return new MessageResponse(message);

    } catch (error) {
      logger.error('Erreur lors de l\'envoi du message:', { error: error.message, params });
      throw error;
    }
  }

  async validateInput(params) {
    const { senderId, conversationId, content, type, fileId } = params;

    if (!senderId) {
      throw new ValidationException('ID de l\'expéditeur requis');
    }

    if (!conversationId) {
      throw new ValidationException('ID de conversation requis');
    }

    if (type === 'text' && (!content || content.trim().length === 0)) {
      throw new ValidationException('Contenu du message requis pour les messages texte');
    }

    if (type === 'file' && !fileId) {
      throw new ValidationException('ID de fichier requis pour les messages de type fichier');
    }

    if (content && content.length > 5000) {
      throw new ValidationException('Le message ne peut pas dépasser 5000 caractères');
    }
  }

  async checkPermissions(senderId, conversationId) {
    // Vérifier que l'utilisateur peut envoyer des messages dans cette conversation
    const hasPermission = await this.conversationRepository.isParticipant(conversationId, senderId);
    
    if (!hasPermission) {
      throw new AuthorizationException('Vous n\'êtes pas autorisé à envoyer des messages dans cette conversation');
    }
  }

  async verifyConversation(conversationId) {
    const conversation = await this.conversationRepository.findById(conversationId);
    
    if (!conversation) {
      throw new ValidationException('Conversation non trouvée');
    }

    if (conversation.status === 'archived') {
      throw new ValidationException('Impossible d\'envoyer un message dans une conversation archivée');
    }

    return conversation;
  }

  async verifyFile(fileId, senderId) {
    const file = await this.fileRepository.findById(fileId);
    
    if (!file) {
      throw new ValidationException('Fichier non trouvé');
    }

    if (file.uploadedBy !== senderId && !file.isPublic) {
      throw new AuthorizationException('Vous n\'êtes pas autorisé à utiliser ce fichier');
    }

    return {
      id: file.id,
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size
    };
  }

  async verifyReplyMessage(replyToId, conversationId) {
    const replyMessage = await this.messageRepository.findById(replyToId);
    
    if (!replyMessage) {
      throw new ValidationException('Message de réponse non trouvé');
    }

    if (replyMessage.conversationId !== conversationId) {
      throw new ValidationException('Le message de réponse n\'appartient pas à cette conversation');
    }

    if (replyMessage.deletedAt) {
      throw new ValidationException('Impossible de répondre à un message supprimé');
    }
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

  async sendNotifications(message, conversation) {
    try {
      if (this.notificationService) {
        // Notification temps réel via WebSocket
        await this.notificationService.broadcastToConversation(conversation.id, {
          type: 'new_message',
          data: new MessageResponse(message)
        });

        // Notifications push pour les participants hors ligne
        await this.notificationService.sendMessageNotifications(message, conversation);
      }
    } catch (error) {
      logger.warn('Erreur lors de l\'envoi des notifications:', { 
        messageId: message.id, 
        error: error.message 
      });
    }
  }
}

module.exports = SendMessageUseCase;
