/**
 * Use Case: Rejoindre une conversation
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const { AuthorizationException } = require('../../../shared/exceptions/AuthorizationException');
const ConversationResponse = require('../../dto/responses/ConversationResponse');

const logger = createLogger('JoinConversationUseCase');

class JoinConversationUseCase {
  constructor(dependencies) {
    this.conversationRepository = dependencies.conversationRepository;
    this.userRepository = dependencies.userRepository;
    this.notificationService = dependencies.notificationService;
    this.authenticationService = dependencies.authenticationService;
  }

  async execute(params) {
    try {
      const { conversationId, userId, inviteCode } = params;

      logger.info('Tentative de rejoindre une conversation:', { conversationId, userId });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Récupérer et vérifier la conversation
      const conversation = await this.getAndVerifyConversation(conversationId);

      // 3. Vérifier si l'utilisateur peut rejoindre
      await this.checkJoinPermissions(userId, conversation, inviteCode);

      // 4. Vérifier si l'utilisateur n'est pas déjà participant
      if (conversation.participants.includes(userId)) {
        logger.info('Utilisateur déjà participant:', { conversationId, userId });
        return new ConversationResponse(conversation);
      }

      // 5. Ajouter l'utilisateur à la conversation
      const updatedConversation = await this.addParticipant(conversation, userId);

      // 6. Envoyer les notifications
      await this.sendNotifications(updatedConversation, userId);

      logger.info('Utilisateur a rejoint la conversation avec succès:', { conversationId, userId });

      return new ConversationResponse(updatedConversation);

    } catch (error) {
      logger.error('Erreur lors de la tentative de rejoindre la conversation:', { error: error.message, params });
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
      throw new ValidationException('Impossible de rejoindre une conversation supprimée');
    }

    if (conversation.status === 'archived') {
      throw new ValidationException('Impossible de rejoindre une conversation archivée');
    }

    return conversation;
  }

  async checkJoinPermissions(userId, conversation, inviteCode) {
    // Vérifier que l'utilisateur existe
    if (this.userRepository) {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new ValidationException('Utilisateur non trouvé');
      }
    }

    // Les conversations privées ne peuvent pas être rejointes
    if (conversation.type === 'private') {
      throw new ValidationException('Impossible de rejoindre une conversation privée');
    }

    // Vérifier selon le type et les paramètres de la conversation
    if (conversation.settings?.isPublic) {
      // Conversation publique - accès libre
      return true;
    }

    // Vérifier le code d'invitation si fourni
    if (inviteCode) {
      if (!conversation.inviteCode || conversation.inviteCode !== inviteCode) {
        throw new AuthorizationException('Code d\'invitation invalide');
      }
      
      // Vérifier la validité temporelle du code
      if (conversation.inviteCodeExpiry && new Date() > conversation.inviteCodeExpiry) {
        throw new AuthorizationException('Code d\'invitation expiré');
      }

      return true;
    }

    // Vérifier si les invitations sont autorisées
    if (!conversation.settings?.allowInvites) {
      throw new AuthorizationException('Les invitations ne sont pas autorisées pour cette conversation');
    }

    // Vérifier les permissions système
    if (this.authenticationService) {
      const hasPermission = await this.authenticationService.hasPermission(
        { id: userId }, 
        'conversations.join'
      );
      if (hasPermission) {
        return true;
      }
    }

    throw new AuthorizationException('Vous n\'êtes pas autorisé à rejoindre cette conversation');
  }

  async addParticipant(conversation, userId) {
    // Vérifier la limite de participants
    const maxParticipants = conversation.type === 'group' ? 100 : 1000;
    if (conversation.participants.length >= maxParticipants) {
      throw new ValidationException(`Limite maximale de participants atteinte (${maxParticipants})`);
    }

    // Ajouter l'utilisateur aux participants
    const updateData = {
      participants: [...conversation.participants, userId],
      lastActivity: new Date(),
      updatedAt: new Date()
    };

    return await this.conversationRepository.update(conversation.id, updateData);
  }

  async sendNotifications(conversation, newUserId) {
    try {
      if (this.notificationService) {
        // Notifier les autres participants
        const existingParticipants = conversation.participants.filter(p => p !== newUserId);

        await this.notificationService.broadcastToUsers(existingParticipants, {
          type: 'participant_joined',
          data: {
            conversationId: conversation.id,
            conversationName: conversation.name,
            newParticipantId: newUserId,
            participantCount: conversation.participants.length
          }
        });

        // Notifier le nouvel utilisateur
        await this.notificationService.sendUserNotification(newUserId, {
          type: 'conversation_joined',
          data: {
            conversationId: conversation.id,
            conversationName: conversation.name,
            participantCount: conversation.participants.length
          }
        });

        // Mise à jour temps réel de la conversation
        await this.notificationService.broadcastToConversation(conversation.id, {
          type: 'conversation_updated',
          data: new ConversationResponse(conversation)
        });
      }
    } catch (error) {
      logger.warn('Erreur lors de l\'envoi des notifications de participation:', { 
        conversationId: conversation.id, 
        newUserId, 
        error: error.message 
      });
    }
  }
}

module.exports = JoinConversationUseCase;
