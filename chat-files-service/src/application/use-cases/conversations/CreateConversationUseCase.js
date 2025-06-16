/**
 * Use Case: Créer une conversation
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const { AuthorizationException } = require('../../../shared/exceptions/AuthorizationException');
const ConversationResponse = require('../../dto/responses/ConversationResponse');

const logger = createLogger('CreateConversationUseCase');

class CreateConversationUseCase {
  constructor(dependencies) {
    this.conversationRepository = dependencies.conversationRepository;
    this.userRepository = dependencies.userRepository;
    this.notificationService = dependencies.notificationService;
    this.validationService = dependencies.validationService;
  }

  async execute(params) {
    try {
      const { 
        createdBy, 
        participants, 
        name, 
        type = 'private', 
        description, 
        settings = {} 
      } = params;

      logger.info('Création d\'une conversation:', { 
        createdBy, 
        type, 
        participantCount: participants.length 
      });

      // 1. Valider les données d'entrée
      await this.validateInput(params);

      // 2. Vérifier les permissions du créateur
      await this.checkCreatorPermissions(createdBy, type);

      // 3. Valider et vérifier l'existence des participants
      const validatedParticipants = await this.validateParticipants(participants, createdBy);

      // 4. Vérifier les conversations existantes (éviter doublons pour privé)
      if (type === 'private') {
        const existingConversation = await this.checkExistingPrivateConversation(validatedParticipants);
        if (existingConversation) {
          logger.info('Conversation privée existante trouvée:', { 
            conversationId: existingConversation.id 
          });
          return new ConversationResponse(existingConversation);
        }
      }

      // 5. Créer la conversation
      const conversationData = this.buildConversationData({
        name: name?.trim(),
        type,
        description: description?.trim(),
        participants: validatedParticipants,
        createdBy,
        settings
      });

      const conversation = await this.conversationRepository.create(conversationData);

      // 6. Envoyer les notifications aux participants
      await this.sendNotifications(conversation);

      // 7. Enregistrer l'activité
      await this.logActivity(conversation);

      logger.info('Conversation créée avec succès:', { 
        conversationId: conversation.id, 
        type: conversation.type 
      });

      return new ConversationResponse(conversation);

    } catch (error) {
      logger.error('Erreur lors de la création de la conversation:', { 
        error: error.message, 
        stack: error.stack,
        params 
      });
      throw error;
    }
  }

  async validateInput(params) {
    const { createdBy, participants, name, type, description } = params;

    // Validation des champs obligatoires
    if (!createdBy) {
      throw new ValidationException('ID du créateur requis');
    }

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      throw new ValidationException('Au moins un participant requis');
    }

    // Validation des limites
    if (participants.length > 100) {
      throw new ValidationException('Maximum 100 participants autorisés');
    }

    // Validation selon le type
    const validTypes = ['private', 'group', 'channel'];
    if (!validTypes.includes(type)) {
      throw new ValidationException(`Type de conversation invalide. Types autorisés: ${validTypes.join(', ')}`);
    }

    if (type === 'private' && participants.length > 2) {
      throw new ValidationException('Une conversation privée ne peut avoir que 2 participants maximum');
    }

    if (type === 'group' && (!name || name.trim().length === 0)) {
      throw new ValidationException('Nom requis pour les conversations de groupe');
    }

    // Validation des longueurs
    if (name && name.length > 100) {
      throw new ValidationException('Le nom ne peut pas dépasser 100 caractères');
    }

    if (description && description.length > 500) {
      throw new ValidationException('La description ne peut pas dépasser 500 caractères');
    }
  }

  async checkCreatorPermissions(userId, type) {
    try {
      // Vérifier les limites de création de conversations par utilisateur
      const userConversationCount = await this.conversationRepository.countByCreator(userId);
      
      const maxConversations = this.getMaxConversationsForUser(type);
      if (userConversationCount >= maxConversations) {
        throw new AuthorizationException(
          `Limite de conversations créées atteinte (${maxConversations})`
        );
      }

      // Vérifications spécifiques par type
      if (type === 'channel') {
        // Les channels nécessitent des permissions spéciales
        const canCreateChannels = await this.checkChannelCreationPermission(userId);
        if (!canCreateChannels) {
          throw new AuthorizationException('Permission insuffisante pour créer des channels');
        }
      }

      return true;

    } catch (error) {
      if (error instanceof AuthorizationException) {
        throw error;
      }
      logger.warn('Erreur lors de la vérification des permissions:', { 
        userId, 
        type, 
        error: error.message 
      });
      throw new AuthorizationException('Impossible de vérifier les permissions');
    }
  }

  async validateParticipants(participants, createdBy) {
    try {
      // S'assurer que le créateur est dans la liste des participants
      const uniqueParticipants = [...new Set([...participants, createdBy])];

      // Valider que tous les participants existent et sont actifs
      const validUsers = await this.userRepository.findByIds(uniqueParticipants);
      const validUserIds = validUsers.map(user => user.id);

      // Identifier les participants invalides
      const invalidParticipants = uniqueParticipants.filter(id => !validUserIds.includes(id));
      if (invalidParticipants.length > 0) {
        throw new ValidationException(
          `Participants invalides ou inexistants: ${invalidParticipants.join(', ')}`
        );
      }

      // Vérifier que les utilisateurs ne sont pas bloqués
      const blockedUsers = validUsers.filter(user => user.status === 'blocked');
      if (blockedUsers.length > 0) {
        const blockedIds = blockedUsers.map(user => user.id);
        throw new ValidationException(
          `Impossible d'ajouter des utilisateurs bloqués: ${blockedIds.join(', ')}`
        );
      }

      return uniqueParticipants;

    } catch (error) {
      if (error instanceof ValidationException) {
        throw error;
      }
      logger.error('Erreur lors de la validation des participants:', { 
        participants, 
        error: error.message 
      });
      throw new ValidationException('Erreur lors de la validation des participants');
    }
  }

  async checkExistingPrivateConversation(participants) {
    try {
      if (participants.length !== 2) {
        return null;
      }

      // Chercher une conversation privée existante entre ces 2 participants
      const existingConversation = await this.conversationRepository.findPrivateConversation(
        participants[0], 
        participants[1]
      );

      return existingConversation;

    } catch (error) {
      logger.warn('Erreur lors de la vérification des conversations existantes:', { 
        participants, 
        error: error.message 
      });
      return null;
    }
  }

  buildConversationData({ name, type, description, participants, createdBy, settings }) {
    const now = new Date();
    
    return {
      name,
      type,
      description,
      participants,
      createdBy,
      settings: {
        isPublic: settings.isPublic || false,
        allowInvites: settings.allowInvites !== false, // true par défaut
        muteNotifications: settings.muteNotifications || false,
        readReceipts: settings.readReceipts !== false, // true par défaut
        messageRetention: settings.messageRetention || 'forever',
        ...settings
      },
      status: 'active',
      metadata: {
        participantCount: participants.length,
        creationSource: 'manual',
        version: '1.0'
      },
      createdAt: now,
      updatedAt: now,
      lastActivity: now
    };
  }

  async sendNotifications(conversation) {
    try {
      if (!this.notificationService) {
        logger.warn('Service de notification non disponible');
        return;
      }

      // Préparer les données de notification
      const notificationData = {
        type: 'conversation_created',
        data: new ConversationResponse(conversation),
        priority: 'normal'
      };

      // Notifier tous les participants sauf le créateur
      const participantsToNotify = conversation.participants.filter(
        participantId => participantId !== conversation.createdBy
      );

      for (const participantId of participantsToNotify) {
        try {
          await this.notificationService.sendToUser(participantId, notificationData);
        } catch (error) {
          logger.warn('Erreur lors de l\'envoi de notification à un participant:', { 
            participantId, 
            conversationId: conversation.id,
            error: error.message 
          });
        }
      }

      // Notification temps réel pour tous les participants
      await this.notificationService.broadcastToUsers(conversation.participants, {
        type: 'conversation_created',
        data: new ConversationResponse(conversation)
      });

      logger.debug('Notifications envoyées avec succès:', { 
        conversationId: conversation.id,
        notifiedCount: participantsToNotify.length 
      });

    } catch (error) {
      logger.error('Erreur lors de l\'envoi des notifications:', { 
        conversationId: conversation.id, 
        error: error.message 
      });
      // Ne pas faire échouer la création pour un problème de notification
    }
  }

  async logActivity(conversation) {
    try {
      // Enregistrer l'activité de création (pour audit/analytics)
      const activityData = {
        type: 'conversation_created',
        userId: conversation.createdBy,
        conversationId: conversation.id,
        metadata: {
          conversationType: conversation.type,
          participantCount: conversation.participants.length,
          hasName: !!conversation.name,
          hasDescription: !!conversation.description
        },
        timestamp: new Date()
      };

      // Ici on pourrait envoyer vers un service d'audit/analytics
      logger.info('Activité enregistrée:', activityData);

    } catch (error) {
      logger.warn('Erreur lors de l\'enregistrement de l\'activité:', { 
        conversationId: conversation.id, 
        error: error.message 
      });
    }
  }

  getMaxConversationsForUser(type) {
    const limits = {
      'private': 100,
      'group': 50,
      'channel': 10
    };
    return limits[type] || 50;
  }

  async checkChannelCreationPermission(userId) {
    try {
      // Vérifier si l'utilisateur a la permission de créer des channels
      // Cette logique dépendra du système de permissions de votre application
      
      // Pour l'instant, retourner false (channels désactivés)
      return false;

    } catch (error) {
      logger.error('Erreur lors de la vérification des permissions channel:', { 
        userId, 
        error: error.message 
      });
      return false;
    }
  }
}

module.exports = CreateConversationUseCase;
