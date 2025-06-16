/**
 * Use Case: Ajouter un participant à une conversation
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const { AuthorizationException } = require('../../../shared/exceptions/AuthorizationException');
const ConversationResponse = require('../../dto/responses/ConversationResponse');

const logger = createLogger('AddParticipantUseCase');

class AddParticipantUseCase {
  constructor(dependencies) {
    this.conversationRepository = dependencies.conversationRepository;
    this.userRepository = dependencies.userRepository;
    this.notificationService = dependencies.notificationService;
    this.authenticationService = dependencies.authenticationService;
  }

  async execute(params) {
    try {
      const { conversationId, participantId, invitedBy } = params;

      logger.info('Ajout d\'un participant:', { conversationId, participantId, invitedBy });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Récupérer et vérifier la conversation
      const conversation = await this.getAndVerifyConversation(conversationId);

      // 3. Vérifier les permissions de l'inviteur
      await this.checkInvitePermissions(invitedBy, conversation);

      // 4. Valider le nouveau participant
      await this.validateNewParticipant(participantId, conversation);

      // 5. Ajouter le participant
      const updatedConversation = await this.addParticipant(conversation, participantId, invitedBy);

      // 6. Envoyer les notifications
      await this.sendNotifications(updatedConversation, participantId, invitedBy);

      logger.info('Participant ajouté avec succès:', { conversationId, participantId, invitedBy });

      return new ConversationResponse(updatedConversation);

    } catch (error) {
      logger.error('Erreur lors de l\'ajout du participant:', { error: error.message, params });
      throw error;
    }
  }

  async validateInput(params) {
    const { conversationId, participantId, invitedBy } = params;

    if (!conversationId) {
      throw new ValidationException('ID de conversation requis');
    }

    if (!participantId) {
      throw new ValidationException('ID du participant requis');
    }

    if (!invitedBy) {
      throw new ValidationException('ID de l\'inviteur requis');
    }

    if (participantId === invitedBy) {
      throw new ValidationException('Impossible de s\'inviter soi-même');
    }
  }

  async getAndVerifyConversation(conversationId) {
    const conversation = await this.conversationRepository.findById(conversationId);
    
    if (!conversation) {
      throw new ValidationException('Conversation non trouvée');
    }

    if (conversation.status === 'deleted') {
      throw new ValidationException('Impossible d\'ajouter un participant à une conversation supprimée');
    }

    if (conversation.type === 'private') {
      throw new ValidationException('Impossible d\'ajouter un participant à une conversation privée');
    }

    return conversation;
  }

  async checkInvitePermissions(invitedBy, conversation) {
    // Vérifier que l'inviteur est participant
    if (!conversation.participants.includes(invitedBy)) {
      throw new AuthorizationException('Vous devez être participant pour inviter quelqu\'un');
    }

    // Vérifier si les invitations sont autorisées
    if (!conversation.settings?.allowInvites) {
      // Seuls les admins peuvent inviter si les invitations sont désactivées
      const isAdmin = conversation.admins?.includes(invitedBy);
      const isCreator = conversation.createdBy === invitedBy;

      if (!isAdmin && !isCreator) {
        throw new AuthorizationException('Les invitations ne sont pas autorisées pour cette conversation');
      }
    }
  }

  async validateNewParticipant(participantId, conversation) {
    // Vérifier que l'utilisateur existe
    if (this.userRepository) {
      const participant = await this.userRepository.findById(participantId);
      if (!participant) {
        throw new ValidationException('Participant non trouvé');
      }
    }

    // Vérifier que l'utilisateur n'est pas déjà participant
    if (conversation.participants.includes(participantId)) {
      throw new ValidationException('Cet utilisateur est déjà participant');
    }

    // Vérifier la limite de participants
    const maxParticipants = conversation.type === 'group' ? 100 : 1000;
    if (conversation.participants.length >= maxParticipants) {
      throw new ValidationException(`Limite maximale de participants atteinte (${maxParticipants})`);
    }
  }

  async addParticipant(conversation, participantId, invitedBy) {
    const updateData = {
      participants: [...conversation.participants, participantId],
      lastActivity: new Date(),
      updatedAt: new Date(),
      // Enregistrer qui a invité qui
      invitations: [
        ...(conversation.invitations || []),
        {
          participantId,
          invitedBy,
          invitedAt: new Date()
        }
      ]
    };

    return await this.conversationRepository.update(conversation.id, updateData);
  }

  async sendNotifications(conversation, newParticipantId, invitedBy) {
    try {
      if (this.notificationService) {
        // Notifier le nouveau participant
        await this.notificationService.sendUserNotification(newParticipantId, {
          type: 'conversation_invitation',
          data: {
            conversationId: conversation.id,
            conversationName: conversation.name,
            conversationType: conversation.type,
            invitedBy,
            participantCount: conversation.participants.length
          }
        });

        // Notifier les autres participants
        const existingParticipants = conversation.participants.filter(
          p => p !== newParticipantId && p !== invitedBy
        );

        await this.notificationService.broadcastToUsers(existingParticipants, {
          type: 'participant_added',
          data: {
            conversationId: conversation.id,
            newParticipantId,
            addedBy: invitedBy,
            participantCount: conversation.participants.length
          }
        });

        // Mise à jour temps réel
        await this.notificationService.broadcastToConversation(conversation.id, {
          type: 'conversation_updated',
          data: new ConversationResponse(conversation)
        });
      }
    } catch (error) {
      logger.warn('Erreur lors de l\'envoi des notifications d\'ajout:', { 
        conversationId: conversation.id, 
        newParticipantId, 
        error: error.message 
      });
    }
  }
}

module.exports = AddParticipantUseCase;
