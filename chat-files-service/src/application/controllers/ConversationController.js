/**
 * Contrôleur pour la gestion des conversations
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../shared/utils/logger');
const ConversationResponse = require('../dto/responses/ConversationResponse');
const PaginatedResponse = require('../dto/responses/PaginatedResponse');

const logger = createLogger('ConversationController');

class ConversationController {
  constructor(dependencies) {
    this.createConversationUseCase = dependencies.createConversationUseCase;
    this.getConversationsUseCase = dependencies.getConversationsUseCase;
    this.getConversationUseCase = dependencies.getConversationUseCase;
    this.updateConversationUseCase = dependencies.updateConversationUseCase;
    this.deleteConversationUseCase = dependencies.deleteConversationUseCase;
    this.addParticipantUseCase = dependencies.addParticipantUseCase;
    this.removeParticipantUseCase = dependencies.removeParticipantUseCase;
  }

  /**
   * Créer une nouvelle conversation
   */
  async createConversation(request, reply) {
    try {
      const { participants, name, type = 'private' } = request.body;
      const userId = request.user.id;

      logger.info('Création d\'une conversation:', { userId, participants, type });

      const conversation = await this.createConversationUseCase.execute({
        creatorId: userId,
        participants: [userId, ...participants],
        name,
        type
      });

      const response = new ConversationResponse(conversation);

      reply.status(201).send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la création de la conversation:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Récupérer les conversations de l'utilisateur
   */
  async getConversations(request, reply) {
    try {
      const { page = 1, limit = 20, type } = request.query;
      const userId = request.user.id;

      logger.info('Récupération des conversations:', { userId, page, limit, type });

      const result = await this.getConversationsUseCase.execute({
        userId,
        pagination: { page: parseInt(page), limit: parseInt(limit) },
        filters: { type }
      });

      const conversations = result.conversations.map(conv => new ConversationResponse(conv));
      const response = new PaginatedResponse(conversations, result.pagination);

      reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la récupération des conversations:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Récupérer une conversation spécifique
   */
  async getConversation(request, reply) {
    try {
      const { conversationId } = request.params;
      const userId = request.user.id;

      logger.info('Récupération d\'une conversation:', { userId, conversationId });

      const conversation = await this.getConversationUseCase.execute({
        conversationId,
        userId
      });

      const response = new ConversationResponse(conversation);

      reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la récupération de la conversation:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Mettre à jour une conversation
   */
  async updateConversation(request, reply) {
    try {
      const { conversationId } = request.params;
      const { name, description, settings } = request.body;
      const userId = request.user.id;

      logger.info('Mise à jour d\'une conversation:', { userId, conversationId });

      const conversation = await this.updateConversationUseCase.execute({
        conversationId,
        userId,
        updates: { name, description, settings }
      });

      const response = new ConversationResponse(conversation);

      reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la mise à jour de la conversation:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Supprimer une conversation
   */
  async deleteConversation(request, reply) {
    try {
      const { conversationId } = request.params;
      const userId = request.user.id;

      logger.info('Suppression d\'une conversation:', { userId, conversationId });

      await this.deleteConversationUseCase.execute({
        conversationId,
        userId
      });

      reply.status(204).send();

    } catch (error) {
      logger.error('Erreur lors de la suppression de la conversation:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Ajouter un participant à une conversation
   */
  async addParticipant(request, reply) {
    try {
      const { conversationId } = request.params;
      const { participantId } = request.body;
      const userId = request.user.id;

      logger.info('Ajout d\'un participant:', { userId, conversationId, participantId });

      const conversation = await this.addParticipantUseCase.execute({
        conversationId,
        userId,
        participantId
      });

      const response = new ConversationResponse(conversation);

      reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de l\'ajout du participant:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Retirer un participant d'une conversation
   */
  async removeParticipant(request, reply) {
    try {
      const { conversationId, participantId } = request.params;
      const userId = request.user.id;

      logger.info('Suppression d\'un participant:', { userId, conversationId, participantId });

      const conversation = await this.removeParticipantUseCase.execute({
        conversationId,
        userId,
        participantId
      });

      const response = new ConversationResponse(conversation);

      reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la suppression du participant:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = ConversationController;
