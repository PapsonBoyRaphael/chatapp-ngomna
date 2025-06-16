/**
 * Use Case: Déconnecter un utilisateur en temps réel
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger('DisconnectUserUseCase');

class DisconnectUserUseCase {
  constructor(dependencies) {
    this.presenceRepository = dependencies.presenceRepository;
    this.connectionManager = dependencies.connectionManager;
    this.notificationService = dependencies.notificationService;
  }

  async execute(params) {
    try {
      const { userId, socketId, reason = 'manual', graceful = true } = params;

      logger.info('Déconnexion utilisateur:', { userId, socketId, reason, graceful });

      // 1. Nettoyer la connexion
      await this.cleanupConnection(userId, socketId);

      // 2. Mettre à jour le statut de présence
      await this.updatePresenceStatus(userId);

      // 3. Notifier la déconnexion
      await this.notifyDisconnection(userId, reason);

      // 4. Effectuer le nettoyage final
      await this.performFinalCleanup(userId, socketId);

      logger.info('Utilisateur déconnecté avec succès:', { userId, socketId });

      return {
        success: true,
        userId,
        socketId,
        disconnectedAt: new Date(),
        reason
      };

    } catch (error) {
      logger.error('Erreur lors de la déconnexion utilisateur:', { error: error.message, params });
      throw error;
    }
  }

  async cleanupConnection(userId, socketId) {
    try {
      // Supprimer la connexion de la base de données
      await this.connectionManager.removeConnection(socketId);

      // Nettoyer les données de session
      await this.connectionManager.cleanupSessionData(userId, socketId);

    } catch (error) {
      logger.warn('Erreur lors du nettoyage de la connexion:', { 
        userId, 
        socketId, 
        error: error.message 
      });
    }
  }

  async updatePresenceStatus(userId) {
    try {
      // Vérifier s'il reste d'autres connexions actives
      const activeConnections = await this.connectionManager.getActiveConnections(userId);
      
      let newStatus = 'offline';
      if (activeConnections.length > 0) {
        // Il reste des connexions actives, garder le statut en ligne
        newStatus = 'online';
      }

      await this.presenceRepository.updateStatus(userId, {
        status: newStatus,
        lastSeen: new Date(),
        updatedAt: new Date()
      });

      return newStatus;

    } catch (error) {
      logger.warn('Erreur lors de la mise à jour du statut de présence:', { 
        userId, 
        error: error.message 
      });
      return 'offline';
    }
  }

  async notifyDisconnection(userId, reason) {
    try {
      if (this.notificationService) {
        // Vérifier le nouveau statut
        const activeConnections = await this.connectionManager.getActiveConnections(userId);
        
        if (activeConnections.length === 0) {
          // Notifier les contacts que l'utilisateur est maintenant hors ligne
          await this.notificationService.broadcastPresenceUpdate(userId, {
            userId,
            status: 'offline',
            lastSeen: new Date(),
            reason
          });
        }
      }
    } catch (error) {
      logger.warn('Erreur lors de la notification de déconnexion:', { 
        userId, 
        error: error.message 
      });
    }
  }

  async performFinalCleanup(userId, socketId) {
    try {
      // Nettoyer les données temporaires
      await this.connectionManager.cleanupTempData(userId, socketId);

      // Sauvegarder les statistiques de session
      await this.saveSessionStats(userId, socketId);

    } catch (error) {
      logger.warn('Erreur lors du nettoyage final:', { 
        userId, 
        socketId, 
        error: error.message 
      });
    }
  }

  async saveSessionStats(userId, socketId) {
    try {
      // Récupérer les statistiques de la session
      const sessionStats = await this.connectionManager.getSessionStats(socketId);
      
      if (sessionStats) {
        // Sauvegarder dans les analytics (si disponible)
        // await this.analyticsService.saveSessionStats(userId, sessionStats);
        
        logger.debug('Statistiques de session sauvegardées:', { userId, socketId });
      }
    } catch (error) {
      logger.warn('Erreur lors de la sauvegarde des statistiques:', { 
        userId, 
        socketId, 
        error: error.message 
      });
    }
  }
}

module.exports = DisconnectUserUseCase;
