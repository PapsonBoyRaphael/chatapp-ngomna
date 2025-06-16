/**
 * Use Case: Supprimer une conversation
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const { AuthorizationException } = require('../../../shared/exceptions/AuthorizationException');

const logger = createLogger('DeleteConversationUseCase');

class DeleteConversationUseCase {
  constructor(dependencies) {
    this.conversationRepository = dependencies.conversationRepository;
    this.messageRepository = dependencies.messageRepository;
    this.notificationService = dependencies.notificationService;
    this.authenticationService = dependencies.authenticationService;
  }

  async execute(params) {
    try {
      const { conversationId, userId, deleteType = 'soft' } = params;

      logger.info('Suppression de conversation:', { conversationId, userId, deleteType });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Récupérer et vérifier la conversation
      const conversation = await this.getAndVerifyConversation(conversationId);

      // 3. Vérifier les permissions
      await this.checkDeletePermissions(userId, conversation);

      // 4. Supprimer la conversation
      let result;
      if (deleteType === 'hard') {
        result = await this.hardDeleteConversation(conversation, userId);
      } else {
        result = await this.softDeleteConversation(conversation, userId);
      }

      // 5. Envoyer les notifications
      await this.sendNotifications(conversation, deleteType, userId);

      logger.info('Conversation supprimée avec succès:', { conversationId, userId, deleteType });

      return { success: true, conversationId, deleteType };

    } catch (error) {
      logger.error('Erreur lors de la suppression de la conversation:', { error: error.message, params });
      throw error;
    }
  }

  async validateInput(params) {
    const { conversationId, userId } = params;

    if (!conversationId) {
      throw new ValidationException('ID de conversation requis');
    }

    if (!userId) {
      throw new ValidationException('ID utilisateur requis');
    }
  }

  async getAndVerifyConversation(conversationId) {
    const conversation = await this.conversationRepository.findById(conversationId);
    
    if (!conversation) {
      throw new ValidationException('Conversation non trouvée');
    }

    if (conversation.status === 'deleted') {
      throw new ValidationException('Conversation déjà supprimée');
    }

    return conversation;
  }

  async checkDeletePermissions(userId, conversation) {
    // Vérifier que l'utilisateur est participant
    if (!conversation.participants.includes(userId)) {
      throw new AuthorizationException('Vous n\'êtes pas participant à cette conversation');
    }

    // Pour la suppression complète, vérifier les permissions spéciales
    const isCreator = conversation.createdBy === userId;
    const isAdmin = conversation.admins?.includes(userId);

    if (!isCreator && !isAdmin) {
      // Vérifier les permissions système
      if (this.authenticationService) {
        const hasPermission = await this.authenticationService.hasPermission(
          { id: userId }, 
          'conversations.delete'
        );
        if (!hasPermission) {
          throw new AuthorizationException('Seuls les créateurs et admins peuvent supprimer cette conversation');
        }
      } else {
        throw new AuthorizationException('Seuls les créateurs et admins peuvent supprimer cette conversation');
      }
    }
  }

  async softDeleteConversation(conversation, userId) {
    // Marquer la conversation comme supprimée
    const updateData = {
      status: 'deleted',
      deletedAt: new Date(),
      deletedBy: userId,
      updatedAt: new Date()
    };

    await this.conversationRepository.update(conversation.id, updateData);

    // Marquer tous les messages comme supprimés (optionnel)
    try {
      await this.messageRepository.softDeleteByConversation(conversation.id, userId);
    } catch (error) {
      logger.warn('Erreur lors de la suppression des messages:', { 
        conversationId: conversation.id, 
        error: error.message 
      });
    }

    return { deleted: true, type: 'soft' };
  }

  async hardDeleteConversation(conversation, userId) {
    // Supprimer définitivement tous les messages
    try {
      await this.messageRepository.deleteByConversation(conversation.id);
    } catch (error) {
      logger.warn('Erreur lors de la suppression définitive des messages:', { 
        conversationId: conversation.id, 
        error: error.message 
      });
    }

    // Supprimer définitivement la conversation
    await this.conversationRepository.delete(conversation.id);

    return { deleted: true, type: 'hard' };
  }

  async sendNotifications(conversation, deleteType, userId) {
    try {
      if (this.notificationService) {
        // Notifier tous les participants
        const participantsToNotify = conversation.participants.filter(p => p !== userId);

        await this.notificationService.broadcastToUsers(participantsToNotify, {
          type: 'conversation_deleted',
          data: {
            conversationId: conversation.id,
            conversationName: conversation.name,
            deletedBy: userId,
            deleteType,
            deletedAt: new Date()
          }
        });

        // Notification spéciale pour la suppression définitive
        if (deleteType === 'hard') {
          await this.notificationService.broadcastToUsers(participantsToNotify, {
            type: 'conversation_permanently_deleted',
            data: {
              conversationId: conversation.id,
              message: 'Cette conversation et tous ses messages ont été définitivement supprimés'
            }
          });
        }
      }
    } catch (error) {
      logger.warn('Erreur lors de l\'envoi des notifications de suppression:', { 
        conversationId: conversation.id, 
        error: error.message 
      });
    }
  }
}

module.exports = DeleteConversationUseCase;
