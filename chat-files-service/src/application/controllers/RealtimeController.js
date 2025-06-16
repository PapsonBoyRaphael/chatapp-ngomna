/**
 * Contrôleur pour les fonctionnalités temps réel
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('RealtimeController');

class RealtimeController {
  constructor(dependencies) {
    this.broadcastMessageUseCase = dependencies.broadcastMessageUseCase;
    this.notifyTypingUseCase = dependencies.notifyTypingUseCase;
    this.updatePresenceUseCase = dependencies.updatePresenceUseCase;
  }

  /**
   * Diffuser un message en temps réel
   */
  async broadcastMessage(request, reply) {
    try {
      const { messageId, conversationId } = request.body;
      const userId = request.user.id;

      logger.info('Diffusion d\'un message:', { userId, messageId, conversationId });

      await this.broadcastMessageUseCase.execute({
        messageId,
        conversationId,
        senderId: userId
      });

      reply.send({
        success: true,
        message: 'Message diffusé avec succès',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la diffusion du message:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Notifier que l'utilisateur est en train de taper
   */
  async notifyTyping(request, reply) {
    try {
      const { conversationId, isTyping = true } = request.body;
      const userId = request.user.id;

      logger.info('Notification de frappe:', { userId, conversationId, isTyping });

      await this.notifyTypingUseCase.execute({
        userId,
        conversationId,
        isTyping
      });

      reply.send({
        success: true,
        message: 'Notification de frappe envoyée',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la notification de frappe:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Mettre à jour le statut de présence
   */
  async updatePresence(request, reply) {
    try {
      const { status, customMessage } = request.body;
      const userId = request.user.id;

      logger.info('Mise à jour de la présence:', { userId, status });

      await this.updatePresenceUseCase.execute({
        userId,
        status,
        customMessage
      });

      reply.send({
        success: true,
        message: 'Statut de présence mis à jour',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la mise à jour de la présence:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Récupérer le statut de présence des utilisateurs
   */
  async getPresence(request, reply) {
    try {
      const { userIds } = request.query;
      const userId = request.user.id;

      logger.info('Récupération du statut de présence:', { userId, userIds });

      // Note: Cette fonctionnalité serait généralement gérée par le service de visibilité
      // Mais on peut fournir une implémentation basique
      
      reply.send({
        success: true,
        data: {
          message: 'Fonctionnalité gérée par le service de visibilité',
          userIds: userIds?.split(',') || []
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la récupération de la présence:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Obtenir les statistiques temps réel
   */
  async getRealtimeStats(request, reply) {
    try {
      const userId = request.user.id;

      logger.info('Récupération des statistiques temps réel:', { userId });

      // Retourner des statistiques basiques
      reply.send({
        success: true,
        data: {
          connectedUsers: 0, // Sera rempli par le WebSocket handler
          activeConversations: 0,
          messagesPerSecond: 0,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Erreur lors de la récupération des statistiques:', error);
      reply.status(error.statusCode || 500).send({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = RealtimeController;
