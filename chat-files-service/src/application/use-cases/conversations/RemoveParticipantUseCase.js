/**
 * Use Case: Retirer un participant d'une conversation
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const { AuthorizationException } = require('../../../shared/exceptions/AuthorizationException');

const logger = createLogger('RemoveParticipantUseCase');

class RemoveParticipantUseCase {
  constructor(dependencies) {
    this.conversationRepository = dependencies.conversationRepository;
    this.notificationService = dependencies.notificationService;
    this.authenticationService = dependencies.authenticationService;
  }

  async execute(params) {
    try {
      const { conversationId, participantId, removedBy, reason } = params;

      logger.info('Retrait d\'un participant:', { conversationId, participantId, removedBy });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Récupérer et vérifier la conversation
      const conversation = await this.getAndVerifyConversation(conversationId);

      // 3. Vérifier les permissions
      await this.checkRemovePermissions(removedBy, participantId, conversation);

      // 4. Retirer le participant
      const updatedConversation = await this.removeParticipant(conversation, participantId, removedBy, reason);

      // 5. Envoyer les notifications
      await this.sendNotifications(updatedConversation, participantId, removedBy, reason);

      logger.info('Participant retiré avec succès:', { conversationId, participantId, removedBy });

      return { success: true, conversationId, removedParticipantId: participantId };

    } catch (error) {
      logger.error('Erreur lors du retrait du participant:', { error: error.message, params });
      throw error;
    }
  }

  async validateInput(params) {
    const { conversationId, participantId, removedBy } = params;

    if (!conversationId) {
      throw new ValidationException('ID de conversation requis');
    }

    if (!participantId) {
      throw new ValidationException('ID du participant requis');
    }

    if (!removedBy) {
      throw new ValidationException('ID de la personne qui retire requis');
    }
  }

  async getAndVerifyConversation(conversationId) {
    const conversation = await this.conversationRepository.findById(conversationId);
    
    if (!conversation) {
      throw new ValidationException('Conversation non trouvée');
    }

    if (conversation.status === 'deleted') {
      throw new ValidationException('Impossible de retirer un participant d\'une conversation supprimée');
    }

    if (conversation.type === 'private') {
      throw new ValidationException('Impossible de retirer un participant d\'une conversation privée');
    }

    return conversation;
  }

  async checkRemovePermissions(removedBy, participantId, conversation) {
    // Vérifier que celui qui retire est participant
    if (!conversation.participants.includes(removedBy)) {
      throw new AuthorizationException('Vous devez être participant pour retirer quelqu\'un');
    }

    // Vérifier que le participant à retirer existe dans la conversation
    if (!conversation.participants.includes(participantId)) {
      throw new ValidationException('Ce participant n\'est pas dans la conversation');
    }

    // Un utilisateur peut toujours se retirer lui-même (équivalent à quitter)
    if (removedBy === participantId) {
      return true;
    }

    // Vérifier les permissions pour retirer quelqu'un d'autre
    const isAdmin = conversation.admins?.includes(removedBy);
    const isCreator = conversation.createdBy === removedBy;
    const targetIsAdmin = conversation.admins?.includes(participantId);
    const targetIsCreator = conversation.createdBy === participantId;

    // Le créateur ne peut pas être retiré
    if (targetIsCreator) {
      throw new AuthorizationException('Le créateur de la conversation ne peut pas être retiré');
    }

    // Seuls les admins et le créateur peuvent retirer des participants
    if (!isAdmin && !isCreator) {
      throw new AuthorizationException('Seuls les administrateurs peuvent retirer des participants');
    }

    // Un admin ne peut pas retirer un autre admin (sauf le créateur)
    if (targetIsAdmin && !isCreator) {
      throw new AuthorizationException('Seul le créateur peut retirer un administrateur');
    }
  }

  async removeParticipant(conversation, participantId, removedBy, reason) {
    // Retirer le participant
    const updatedParticipants = conversation.participants.filter(p => p !== participantId);
    
    // Retirer des admins si nécessaire
    const updatedAdmins = conversation.admins?.filter(a => a !== participantId) || [];

    const updateData = {
      participants: updatedParticipants,
      admins: updatedAdmins,
      lastActivity: new Date(),
      updatedAt: new Date(),
      // Enregistrer l'historique des retraits
      removals: [
        ...(conversation.removals || []),
        {
          participantId,
          removedBy,
          removedAt: new Date(),
          reason: reason || 'no_reason_provided'
        }
      ]
    };

    return await this.conversationRepository.update(conversation.id, updateData);
  }

  async sendNotifications(conversation, removedParticipantId, removedBy, reason) {
    try {
      if (this.notificationService) {
        // Notifier le participant retiré
        await this.notificationService.sendUserNotification(removedParticipantId, {
          type: 'removed_from_conversation',
          data: {
            conversationId: conversation.id,
            conversationName: conversation.name,
            removedBy,
            reason,
            removedAt: new Date()
          }
        });

        // Notifier les participants restants
        const remainingParticipants = conversation.participants.filter(p => p !== removedBy);

        await this.notificationService.broadcastToUsers(remainingParticipants, {
          type: 'participant_removed',
          data: {
            conversationId: conversation.id,
            removedParticipantId,
            removedBy,
            reason,
            participantCount: conversation.participants.length
          }
        });

        // Mise à jour temps réel
        await this.notificationService.broadcastToConversation(conversation.id, {
          type: 'conversation_updated',
          data: {
            id: conversation.id,
            participants: conversation.participants,
            participantCount: conversation.participants.length
          }
        });
      }
    } catch (error) {
      logger.warn('Erreur lors de l\'envoi des notifications de retrait:', { 
        conversationId: conversation.id, 
        removedParticipantId, 
        error: error.message 
      });
    }
  }
}

module.exports = RemoveParticipantUseCase;
