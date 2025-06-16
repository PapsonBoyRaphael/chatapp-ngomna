/**
 * Contrôleur pour la gestion des messages de chat
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../shared/utils/logger');
const MessageResponse = require('../dto/responses/MessageResponse');
const PaginatedResponse = require('../dto/responses/PaginatedResponse');

const logger = createLogger('ChatController');

class ChatController {
  constructor(dependencies) {
    this.sendMessageUseCase = dependencies.sendMessageUseCase;
    this.getMessagesUseCase = dependencies.getMessagesUseCase;
    this.deleteMessageUseCase = dependencies.deleteMessageUseCase;
    this.editMessageUseCase = dependencies.editMessageUseCase;
    this.forwardMessageUseCase = dependencies.forwardMessageUseCase;
    this.searchMessagesUseCase = dependencies.searchMessagesUseCase;
  }

  /**
   * Envoyer un nouveau message
   */
  async sendMessage(request, reply) {
    try {
      const { conversationId, content, type = 'text', fileId } = request.body;
      const userId = request.user.id;

      logger.info('Envoi d\'un message:', { userId, conversationId, type });

      const message = await this.sendMessageUseCase.execute({
        senderId: userId,
        conversationId,
        content,
        type,
        fileId
      });

      const response = new MessageResponse(message);
      
      reply.status(201).send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de l\'envoi du message:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Récupérer les messages d'une conversation
   */
  async getMessages(request, reply) {
    try {
      const { conversationId } = request.params;
      const { page = 1, limit = 50, before, after } = request.query;
      const userId = request.user.id;

      logger.info('Récupération des messages:', { userId, conversationId, page, limit });

      const result = await this.getMessagesUseCase.execute({
        conversationId,
        userId,
        pagination: { page: parseInt(page), limit: parseInt(limit) },
        filters: { before, after }
      });

      const messages = result.messages.map(message => new MessageResponse(message));
      const response = new PaginatedResponse(messages, result.pagination);

      reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la récupération des messages:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Modifier un message
   */
  async editMessage(request, reply) {
    try {
      const { messageId } = request.params;
      const { content } = request.body;
      const userId = request.user.id;

      logger.info('Modification d\'un message:', { userId, messageId });

      const message = await this.editMessageUseCase.execute({
        messageId,
        userId,
        newContent: content
      });

      const response = new MessageResponse(message);

      reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la modification du message:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Supprimer un message
   */
  async deleteMessage(request, reply) {
    try {
      const { messageId } = request.params;
      const userId = request.user.id;

      logger.info('Suppression d\'un message:', { userId, messageId });

      await this.deleteMessageUseCase.execute({
        messageId,
        userId
      });

      reply.status(204).send();

    } catch (error) {
      logger.error('Erreur lors de la suppression du message:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Transférer un message
   */
  async forwardMessage(request, reply) {
    try {
      const { messageId } = request.params;
      const { conversationIds } = request.body;
      const userId = request.user.id;

      logger.info('Transfert d\'un message:', { userId, messageId, conversationIds });

      const results = await this.forwardMessageUseCase.execute({
        messageId,
        userId,
        targetConversationIds: conversationIds
      });

      reply.send({
        success: true,
        data: { forwardedTo: results },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors du transfert du message:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Rechercher des messages
   */
  async searchMessages(request, reply) {
    try {
      const { query, conversationId, type, dateFrom, dateTo, page = 1, limit = 20 } = request.query;
      const userId = request.user.id;

      logger.info('Recherche de messages:', { userId, query, conversationId });

      const result = await this.searchMessagesUseCase.execute({
        userId,
        searchQuery: query,
        filters: {
          conversationId,
          type,
          dateFrom: dateFrom ? new Date(dateFrom) : undefined,
          dateTo: dateTo ? new Date(dateTo) : undefined
        },
        pagination: { page: parseInt(page), limit: parseInt(limit) }
      });

      const messages = result.messages.map(message => new MessageResponse(message));
      const response = new PaginatedResponse(messages, result.pagination);

      reply.send({
        success: true,
        data: response,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la recherche de messages:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = ChatController;
