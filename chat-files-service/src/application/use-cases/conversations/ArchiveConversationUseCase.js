/**
 * Use Case: Archiver une conversation
 * CENADI Chat-Files-Service
 */

const { createLogger } = require("../../../shared/utils/logger");
const {
  ValidationException,
} = require("../../../shared/exceptions/ValidationException");
/**
 * Use Case: Créer une conversation
 * CENADI Chat-Files-Service
 */

const { createLogger } = require("../../../shared/utils/logger");
const {
  ValidationException,
} = require("../../../shared/exceptions/ValidationException");
const {
  AuthorizationException,
} = require("../../../shared/exceptions/AuthorizationException");
const ConversationResponse = require("../../dto/responses/ConversationResponse");

const logger = createLogger("CreateConversationUseCase");

class CreateConversationUseCase {
  constructor(dependencies) {
    this.conversationRepository = dependencies.conversationRepository;
    this.userRepository = dependencies.userRepository;
    this.notificationService = dependencies.notificationService;
    this.authenticationService = dependencies.authenticationService;
  }

  async execute(params) {
    try {
      const {
        creatorId,
        participants = [],
        name,
        type = "private",
        description,
        settings = {},
      } = params;

      logger.info("Création d'une conversation:", {
        creatorId,
        type,
        participantCount: participants.length,
      });

      // 1. Valider les paramètres
      await this.validateInput(params);

      // 2. Vérifier les permissions du créateur
      await this.checkCreatorPermissions(creatorId, type);

      // 3. Valider les participants
      const validatedParticipants = await this.validateParticipants(
        participants,
        creatorId
      );

      // 4. Vérifier si une conversation similaire existe (pour les conversations privées)
      if (type === "private") {
        const existingConversation =
          await this.checkExistingPrivateConversation(validatedParticipants);
        if (existingConversation) {
          logger.info("Conversation privée existante trouvée:", {
            conversationId: existingConversation.id,
          });
          return new ConversationResponse(existingConversation);
        }
      }

      // 5. Créer la conversation
      const conversationData = {
        name: this.generateConversationName(name, type, validatedParticipants),
        type,
        description,
        participants: validatedParticipants,
        createdBy: creatorId,
        settings: {
          isPublic: false,
          allowInvites: true,
          muteNotifications: false,
          ...settings,
        },
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const conversation = await this.conversationRepository.create(
        conversationData
      );

      // 6. Envoyer les notifications aux participants
      await this.sendNotifications(conversation, creatorId);

      logger.info("Conversation créée avec succès:", {
        conversationId: conversation.id,
        creatorId,
        type,
      });

      return new ConversationResponse(conversation);
    } catch (error) {
      logger.error("Erreur lors de la création de la conversation:", {
        error: error.message,
        params,
      });
      throw error;
    }
  }

  async validateInput(params) {
    const { creatorId, participants, name, type } = params;

    if (!creatorId) {
      throw new ValidationException("ID du créateur requis");
    }

    if (!Array.isArray(participants)) {
      throw new ValidationException("Liste des participants invalide");
    }

    if (type === "group" && (!name || name.trim().length === 0)) {
      throw new ValidationException(
        "Nom requis pour les conversations de groupe"
      );
    }

    if (name && name.length > 100) {
      throw new ValidationException(
        "Le nom ne peut pas dépasser 100 caractères"
      );
    }

    if (!["private", "group", "channel"].includes(type)) {
      throw new ValidationException("Type de conversation invalide");
    }

    if (type === "private" && participants.length > 1) {
      throw new ValidationException(
        "Une conversation privée ne peut avoir qu'un seul autre participant"
      );
    }

    if (type === "group" && participants.length < 1) {
      throw new ValidationException(
        "Une conversation de groupe doit avoir au moins un participant"
      );
    }
  }

  async checkCreatorPermissions(creatorId, type) {
    // Vérifier que l'utilisateur existe et peut créer des conversations
    const creator = await this.userRepository?.findById(creatorId);
    if (!creator) {
      throw new ValidationException("Créateur non trouvé");
    }

    // Vérifications spécifiques selon le type
    if (type === "channel") {
      if (this.authenticationService) {
        const hasPermission = await this.authenticationService.hasPermission(
          creator,
          "conversations.create_channel"
        );
        if (!hasPermission) {
          throw new AuthorizationException(
            "Permission insuffisante pour créer un canal"
          );
        }
      }
    }
  }

  async validateParticipants(participants, creatorId) {
    const validatedParticipants = [creatorId]; // Le créateur est toujours participant

    // Ajouter les autres participants s'ils sont valides
    for (const participantId of participants) {
      if (participantId === creatorId) {
        continue; // Éviter les doublons
      }

      // Vérifier que le participant existe
      if (this.userRepository) {
        const participant = await this.userRepository.findById(participantId);
        if (!participant) {
          throw new ValidationException(
            `Participant ${participantId} non trouvé`
          );
        }
      }

      validatedParticipants.push(participantId);
    }

    // Vérifier les limites
    if (validatedParticipants.length > 100) {
      throw new ValidationException("Maximum 100 participants autorisés");
    }

    return validatedParticipants;
  }

  async checkExistingPrivateConversation(participants) {
    if (participants.length !== 2) {
      return null;
    }

    try {
      return await this.conversationRepository.findPrivateConversation(
        participants[0],
        participants[1]
      );
    } catch (error) {
      logger.warn("Erreur lors de la vérification de conversation existante:", {
        error: error.message,
      });
      return null;
    }
  }

  generateConversationName(providedName, type, participants) {
    if (providedName && providedName.trim().length > 0) {
      return providedName.trim();
    }

    // Générer un nom automatique pour les conversations privées
    if (type === "private" && participants.length === 2) {
      return null; // Pas de nom pour les conversations privées
    }

    // Nom par défaut pour les groupes sans nom
    if (type === "group") {
      return `Groupe ${new Date().toLocaleDateString()}`;
    }

    if (type === "channel") {
      return `Canal ${new Date().toLocaleDateString()}`;
    }

    return null;
  }

  async sendNotifications(conversation, creatorId) {
    try {
      if (this.notificationService) {
        // Notifier tous les participants sauf le créateur
        const participantsToNotify = conversation.participants.filter(
          (p) => p !== creatorId
        );

        for (const participantId of participantsToNotify) {
          await this.notificationService.sendUserNotification(participantId, {
            type: "conversation_created",
            data: {
              conversationId: conversation.id,
              conversationName: conversation.name,
              conversationType: conversation.type,
              createdBy: creatorId,
              participantCount: conversation.participants.length,
            },
          });
        }

        // Notification temps réel
        await this.notificationService.broadcastToUsers(participantsToNotify, {
          type: "new_conversation",
          data: new ConversationResponse(conversation),
        });
      }
    } catch (error) {
      logger.warn("Erreur lors de l'envoi des notifications de création:", {
        conversationId: conversation.id,
        error: error.message,
      });
    }
  }
}

module.exports = CreateConversationUseCase;
