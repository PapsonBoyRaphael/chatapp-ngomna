/**
 * Use Case: Quitter une conversation
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const { AuthorizationException } = require('../../../shared/exceptions/AuthorizationException');

const logger = createLogger('LeaveConversationUseCase');

class LeaveConversationUseCase {
  constructor(dependencies) {
    this.conversationRepository = dependencies.conversationRepository;
    this.messageRepository = dependencies.messageRepository;
    this.notificationService = dependencies.notificationService;
  }

  async execute(params) {
    try {
      const { conversationId, userId } = params;

      logger.info('Tentative de quitter une conversation:', { conversationId, userId });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Récupérer et vérifier la conversation
      const conversation = await this.getAndVerifyConversation(conversationId);

      // 3. Vérifier si l'utilisateur est participant
      await this.checkParticipation(userId, conversation);

      // 4. Vérifier les conditions spéciales de départ
      await this.checkLeaveConditions(userId, conversation);

      // 5. Retirer l'utilisateur de la conversation
      const updatedConversation = await this.removeParticipant(conversation, userId);

      // 6. Gérer les cas spéciaux (dernière personne, créateur, etc.)
      await this.handleSpecialCases(updatedConversation, userId);

      // 7. Envoyer les notifications
      await this.sendNotifications(updatedConversation, userId);

      logger.info('Utilisateur a quitté la conversation avec succès:', { conversationId, userId });

      return { success: true, conversationId, leftAt: new Date() };

    } catch (error) {
      logger.error('Erreur lors de la tentative de quitter la conversation:', { error: error.message, params });
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

  async checkParticipation(userId, conversation) {
    if (!conversation.participants.includes(userId)) {
      throw new ValidationException('Vous n\'êtes pas participant à cette conversation');
    }
  }

  async checkLeaveConditions(userId, conversation) {
    // Les conversations privées ne peuvent pas être quittées (seulement archivées)
    if (conversation.type === 'private') {
      throw new ValidationException('Impossible de quitter une conversation privée. Vous pouvez l\'archiver.');
    }

    // Si l'utilisateur est le créateur et le seul admin, il ne peut pas partir
    const isCreator = conversation.createdBy === userId;
    const isOnlyAdmin = conversation.admins?.length === 1 && conversation.admins[0] === userId;
    const hasOtherParticipants = conversation.participants.length > 1;

    if (isCreator && isOnlyAdmin && hasOtherParticipants) {
      throw new ValidationException('Vous devez nommer un autre administrateur avant de quitter');
    }
  }

  async removeParticipant(conversation, userId) {
    // Retirer l'utilisateur des participants
    const updatedParticipants = conversation.participants.filter(p => p !== userId);
    
    // Retirer l'utilisateur des admins s'il en est un
    const updatedAdmins = conversation.admins?.filter(a => a !== userId) || [];

    const updateData = {
      participants: updatedParticipants,
      admins: updatedAdmins,
      lastActivity: new Date(),
      updatedAt: new Date()
    };

    return await this.conversationRepository.update(conversation.id, updateData);
  }

  async handleSpecialCases(conversation, leftUserId) {
    // Si la conversation est maintenant vide, la supprimer
    if (conversation.participants.length === 0) {
      logger.info('Conversation vide après départ, suppression:', { conversationId: conversation.id });
      
      await this.conversationRepository.update(conversation.id, {
        status: 'deleted',
        deletedAt: new Date(),
        deletedReason: 'empty_after_leave'
      });
      
      return;
    }

    // Si le créateur est parti, transférer la création au plus ancien participant
    if (conversation.createdBy === leftUserId && conversation.participants.length > 0) {
      const newCreator = conversation.participants[0];
      
      await this.conversationRepository.update(conversation.id, {
        createdBy: newCreator,
        transferredAt: new Date(),
        transferredFrom: leftUserId
      });

      // S'assurer que le nouveau créateur est admin
      if (!conversation.admins?.includes(newCreator)) {
        await this.conversationRepository.update(conversation.id, {
          admins: [...(conversation.admins || []), newCreator]
        });
      }

      logger.info('Propriété de conversation transférée:', { 
        conversationId: conversation.id,
        from: leftUserId,
        to: newCreator
      });
    }
  }

  async sendNotifications(conversation, leftUserId) {
    try {
      if (this.notificationService) {
        // Ne pas envoyer de notifications si la conversation a été supprimée
        if (conversation.status === 'deleted') {
          return;
        }

        // Notifier les participants restants
        await this.notificationService.broadcastToUsers(conversation.participants, {
          type: 'participant_left',
          data: {
            conversationId: conversation.id,
            conversationName: conversation.name,
            leftParticipantId: leftUserId,
            participantCount: conversation.participants.length,
            leftAt: new Date()
          }
        });

        // Notifier l'utilisateur qui est parti
        await this.notificationService.sendUserNotification(leftUserId, {
          type: 'conversation_left',
          data: {
            conversationId: conversation.id,
            conversationName: conversation.name,
            leftAt: new Date()
          }
        });

        // Mise à jour temps réel si la conversation existe encore
        if (conversation.participants.length > 0) {
          await this.notificationService.broadcastToConversation(conversation.id, {
            type: 'conversation_updated',
            data: {
              id: conversation.id,
              participants: conversation.participants,
              participantCount: conversation.participants.length
            }
          });
        }
      }
    } catch (error) {
      logger.warn('Erreur lors de l\'envoi des notifications de départ:', { 
        conversationId: conversation.id, 
        leftUserId, 
        error: error.message 
      });
    }
  }
}

module.exports = LeaveConversationUseCase;
