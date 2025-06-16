/**
 * Use Case: Mettre à jour une conversation
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const { AuthorizationException } = require('../../../shared/exceptions/AuthorizationException');
const ConversationResponse = require('../../dto/responses/ConversationResponse');

const logger = createLogger('UpdateConversationUseCase');

class UpdateConversationUseCase {
  constructor(dependencies) {
    this.conversationRepository = dependencies.conversationRepository;
    this.messageRepository = dependencies.messageRepository;
    this.notificationService = dependencies.notificationService;
    this.validationService = dependencies.validationService;
  }

  async execute(params) {
    try {
      const { conversationId, userId, updates } = params;

      logger.info('Mise à jour de la conversation:', { conversationId, userId, updates });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Récupérer et vérifier la conversation
      const conversation = await this.getAndVerifyConversation(conversationId);

      // 3. Vérifier les permissions
      await this.checkPermissions(userId, conversation, updates);

      // 4. Valider les données à mettre à jour
      const validatedUpdates = await this.validateUpdates(updates, conversation);

      // 5. Appliquer les mises à jour
      const updatedConversation = await this.applyUpdates(
        conversation, 
        validatedUpdates, 
        userId
      );

      // 6. Créer un message système si nécessaire
      await this.createSystemMessage(updatedConversation, validatedUpdates, userId);

      // 7. Envoyer les notifications
      await this.sendNotifications(updatedConversation, validatedUpdates, userId);

      logger.info('Conversation mise à jour avec succès:', { conversationId });

      return new ConversationResponse(updatedConversation);

    } catch (error) {
      logger.error('Erreur lors de la mise à jour de la conversation:', { 
        error: error.message, 
        params 
      });
      throw error;
    }
  }

  async validateInput(params) {
    const { conversationId, userId, updates } = params;

    if (!conversationId) {
      throw new ValidationException('ID de conversation requis');
    }

    if (!userId) {
      throw new ValidationException('ID utilisateur requis');
    }

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      throw new ValidationException('Données de mise à jour requises');
    }
  }

  async getAndVerifyConversation(conversationId) {
    const conversation = await this.conversationRepository.findById(conversationId);

    if (!conversation) {
      throw new ValidationException('Conversation non trouvée');
    }

    if (conversation.status === 'deleted') {
      throw new ValidationException('Impossible de modifier une conversation supprimée');
    }

    return conversation;
  }

  async checkPermissions(userId, conversation, updates) {
    // Vérifier que l'utilisateur est participant
    if (!conversation.participants.includes(userId)) {
      throw new AuthorizationException('Vous devez être participant pour modifier cette conversation');
    }

    // Vérifier les permissions selon les champs à modifier
    const adminOnlyFields = ['settings', 'status', 'type'];
    const hasAdminOnlyUpdates = adminOnlyFields.some(field => updates.hasOwnProperty(field));

    if (hasAdminOnlyUpdates) {
      const isAdmin = this.isUserAdmin(conversation, userId);
      if (!isAdmin) {
        throw new AuthorizationException('Seuls les administrateurs peuvent modifier ces paramètres');
      }
    }

    // Pour les conversations privées, seul le nom et la description peuvent être modifiés
    if (conversation.type === 'private') {
      const allowedFields = ['name', 'description'];
      const hasInvalidFields = Object.keys(updates).some(field => !allowedFields.includes(field));
      
      if (hasInvalidFields) {
        throw new AuthorizationException('Modifications limitées pour les conversations privées');
      }
    }
  }

  async validateUpdates(updates, conversation) {
    const validatedUpdates = {};

    // Valider le nom
    if (updates.hasOwnProperty('name')) {
      if (updates.name !== null && updates.name !== undefined) {
        const trimmedName = String(updates.name).trim();
        
        if (conversation.type === 'group' && trimmedName.length === 0) {
          throw new ValidationException('Le nom est requis pour les conversations de groupe');
        }
        
        if (trimmedName.length > 100) {
          throw new ValidationException('Le nom ne peut pas dépasser 100 caractères');
        }
        
        validatedUpdates.name = trimmedName || null;
      } else {
        if (conversation.type === 'group') {
          throw new ValidationException('Le nom ne peut pas être vide pour un groupe');
        }
        validatedUpdates.name = null;
      }
    }

    // Valider la description
    if (updates.hasOwnProperty('description')) {
      if (updates.description !== null && updates.description !== undefined) {
        const trimmedDescription = String(updates.description).trim();
        
        if (trimmedDescription.length > 500) {
          throw new ValidationException('La description ne peut pas dépasser 500 caractères');
        }
        
        validatedUpdates.description = trimmedDescription || null;
      } else {
        validatedUpdates.description = null;
      }
    }

    // Valider les paramètres
    if (updates.hasOwnProperty('settings')) {
      validatedUpdates.settings = await this.validateSettings(updates.settings, conversation);
    }

    // Valider le statut
    if (updates.hasOwnProperty('status')) {
      const validStatuses = ['active', 'archived', 'inactive'];
      if (!validStatuses.includes(updates.status)) {
        throw new ValidationException(`Statut invalide. Statuts valides: ${validStatuses.join(', ')}`);
      }
      validatedUpdates.status = updates.status;
    }

    return validatedUpdates;
  }

  async validateSettings(newSettings, conversation) {
    const currentSettings = conversation.settings || {};
    const mergedSettings = { ...currentSettings, ...newSettings };

    // Valider les paramètres booléens
    const booleanSettings = ['isPublic', 'allowInvites', 'muteNotifications', 'readReceipts'];
    for (const setting of booleanSettings) {
      if (newSettings.hasOwnProperty(setting)) {
        if (typeof newSettings[setting] !== 'boolean') {
          throw new ValidationException(`${setting} doit être un booléen`);
        }
      }
    }

    // Valider la rétention des messages
    if (newSettings.hasOwnProperty('messageRetention')) {
      const validRetentions = ['forever', '1year', '6months', '3months', '1month'];
      if (!validRetentions.includes(newSettings.messageRetention)) {
        throw new ValidationException(`Rétention invalide. Options: ${validRetentions.join(', ')}`);
      }
    }

    return mergedSettings;
  }

  async applyUpdates(conversation, validatedUpdates, userId) {
    const updateData = {
      ...validatedUpdates,
      updatedAt: new Date(),
      lastActivity: new Date(),
      metadata: {
        ...conversation.metadata,
        lastUpdate: {
          updatedBy: userId,
          updatedAt: new Date(),
          fields: Object.keys(validatedUpdates)
        },
        updateHistory: [
          ...(conversation.metadata?.updateHistory || []),
          {
            updatedBy: userId,
            updatedAt: new Date(),
            changes: validatedUpdates
          }
        ].slice(-10) // Garder les 10 dernières modifications
      }
    };

    return await this.conversationRepository.update(conversation.id, updateData);
  }

  async createSystemMessage(conversation, updates, userId) {
    try {
      const updatedFields = Object.keys(updates);
      if (updatedFields.length === 0) return;

      // Ne créer un message système que pour certains changements
      const significantChanges = ['name', 'status'];
      const hasSignificantChanges = significantChanges.some(field => updates.hasOwnProperty(field));

      if (!hasSignificantChanges) return;

      const user = await this.userRepository?.findById(userId);
      const userName = user?.name || 'Utilisateur inconnu';

      let content = `${userName} a modifié la conversation`;
      
      if (updates.name) {
        content += ` (nouveau nom: "${updates.name}")`;
      }
      
      if (updates.status) {
        content += ` (statut: ${updates.status})`;
      }

      const systemMessage = {
        conversationId: conversation.id,
        type: 'system',
        content,
        senderId: null,
        metadata: {
          systemAction: 'conversation_updated',
          updatedBy: userId,
          changes: updates,
          updatedAt: new Date()
        },
        createdAt: new Date()
      };

      await this.messageRepository.create(systemMessage);

    } catch (error) {
      logger.warn('Impossible de créer le message système:', { 
        conversationId: conversation.id, 
        error: error.message 
      });
    }
  }

  async sendNotifications(conversation, updates, userId) {
    try {
      if (!this.notificationService) return;

      // Notifier tous les participants sauf celui qui a fait la modification
      const participantsToNotify = conversation.participants.filter(id => id !== userId);

      for (const participantId of participantsToNotify) {
        await this.notificationService.sendToUser(participantId, {
          type: 'conversation_updated',
          data: {
            conversation: new ConversationResponse(conversation),
            updates,
            updatedBy: userId
          }
        });
      }

      // Notification temps réel
      await this.notificationService.broadcastToConversation(conversation.id, {
        type: 'conversation_updated',
        data: {
          conversationId: conversation.id,
          updates,
          updatedBy: userId,
          updatedAt: new Date()
        }
      });

    } catch (error) {
      logger.warn('Erreur lors de l\'envoi des notifications:', { 
        conversationId: conversation.id, 
        error: error.message 
      });
    }
  }

  isUserAdmin(conversation, userId) {
    return conversation.createdBy === userId || 
           (conversation.metadata?.admins && conversation.metadata.admins.includes(userId));
  }
}

module.exports = UpdateConversationUseCase;
