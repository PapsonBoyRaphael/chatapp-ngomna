/**
 * Use Case: Gérer la présence des utilisateurs
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');

const logger = createLogger('ManagePresenceUseCase');

class ManagePresenceUseCase {
  constructor(dependencies) {
    this.presenceRepository = dependencies.presenceRepository;
    this.connectionManager = dependencies.connectionManager;
    this.notificationService = dependencies.notificationService;
  }

  async execute(params) {
    try {
      const { action, userId, data = {} } = params;

      logger.info('Gestion de la présence:', { action, userId });

      switch (action) {
        case 'update_status':
          return await this.updateStatus(userId, data.status, data.message);
        
        case 'get_status':
          return await this.getStatus(userId);
        
        case 'get_contacts_status':
          return await this.getContactsStatus(userId, data.contactIds);
        
        case 'set_activity':
          return await this.setActivity(userId, data.activity);
        
        case 'heartbeat':
          return await this.processHeartbeat(userId);
        
        case 'bulk_status':
          return await this.getBulkStatus(data.userIds);
        
        default:
          throw new ValidationException(`Action non supportée: ${action}`);
      }

    } catch (error) {
      logger.error('Erreur lors de la gestion de la présence:', { error: error.message, params });
      throw error;
    }
  }

  async updateStatus(userId, status, statusMessage = null) {
    try {
      // Valider le statut
      const validStatuses = ['online', 'away', 'busy', 'offline', 'invisible'];
      if (!validStatuses.includes(status)) {
        throw new ValidationException(`Statut invalide: ${status}`);
      }

      // Mettre à jour le statut
      const presenceData = {
        status,
        statusMessage: statusMessage?.trim() || null,
        lastSeen: new Date(),
        updatedAt: new Date()
      };

      await this.presenceRepository.updateStatus(userId, presenceData);

      // Notifier les contacts du changement
      await this.notifyStatusChange(userId, status, statusMessage);

      logger.info('Statut mis à jour:', { userId, status, statusMessage });

      return {
        success: true,
        userId,
        status,
        statusMessage,
        updatedAt: presenceData.updatedAt
      };

    } catch (error) {
      logger.error('Erreur lors de la mise à jour du statut:', { userId, status, error: error.message });
      throw error;
    }
  }

  async getStatus(userId) {
    try {
      const presence = await this.presenceRepository.findByUserId(userId);
      
      if (!presence) {
        return {
          userId,
          status: 'offline',
          lastSeen: null,
          isOnline: false
        };
      }

      // Déterminer si l'utilisateur est réellement en ligne
      const activeConnections = await this.connectionManager.getActiveConnections(userId);
      const isOnline = activeConnections.length > 0;

      return {
        userId,
        status: isOnline ? presence.status : 'offline',
        statusMessage: presence.statusMessage,
        lastSeen: presence.lastSeen,
        isOnline,
        connectionCount: activeConnections.length,
        updatedAt: presence.updatedAt
      };

    } catch (error) {
      logger.error('Erreur lors de la récupération du statut:', { userId, error: error.message });
      throw error;
    }
  }

  async getContactsStatus(userId, contactIds) {
    try {
      if (!Array.isArray(contactIds) || contactIds.length === 0) {
        return [];
      }

      if (contactIds.length > 100) {
        throw new ValidationException('Maximum 100 contacts autorisés par requête');
      }

      const statuses = await Promise.all(
        contactIds.map(contactId => this.getStatus(contactId))
      );

      return statuses;

    } catch (error) {
      logger.error('Erreur lors de la récupération du statut des contacts:', { 
        userId, 
        contactCount: contactIds?.length, 
        error: error.message 
      });
      throw error;
    }
  }

  async setActivity(userId, activity) {
    try {
      const validActivities = ['typing', 'recording', 'uploading', 'idle'];
      if (!validActivities.includes(activity)) {
        throw new ValidationException(`Activité invalide: ${activity}`);
      }

      // Mettre à jour l'activité
      await this.presenceRepository.updateActivity(userId, {
        currentActivity: activity,
        activityStarted: new Date(),
        updatedAt: new Date()
      });

      // Notifier l'activité si nécessaire
      if (['typing', 'recording'].includes(activity)) {
        await this.notifyActivity(userId, activity);
      }

      return {
        success: true,
        userId,
        activity,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Erreur lors de la définition de l\'activité:', { userId, activity, error: error.message });
      throw error;
    }
  }

  async processHeartbeat(userId) {
    try {
      const now = new Date();
      
      // Mettre à jour le dernière vue
      await this.presenceRepository.updateLastSeen(userId, now);
      
      // Mettre à jour les connexions
      const connections = await this.connectionManager.getActiveConnections(userId);
      for (const connection of connections) {
        await this.connectionManager.updateLastSeen(connection.id, now);
      }

      return {
        success: true,
        userId,
        lastSeen: now,
        activeConnections: connections.length
      };

    } catch (error) {
      logger.error('Erreur lors du traitement du heartbeat:', { userId, error: error.message });
      throw error;
    }
  }

  async getBulkStatus(userIds) {
    try {
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return [];
      }

      if (userIds.length > 200) {
        throw new ValidationException('Maximum 200 utilisateurs autorisés par requête');
      }

      // Récupérer les statuts en lot
      const presences = await this.presenceRepository.findByUserIds(userIds);
      const presenceMap = new Map(presences.map(p => [p.userId, p]));

      // Récupérer les connexions actives
      const connectionCounts = await this.connectionManager.getActiveConnectionCounts(userIds);

      // Construire la réponse
      const statuses = userIds.map(userId => {
        const presence = presenceMap.get(userId);
        const connectionCount = connectionCounts.get(userId) || 0;
        const isOnline = connectionCount > 0;

        return {
          userId,
          status: isOnline ? (presence?.status || 'online') : 'offline',
          statusMessage: presence?.statusMessage || null,
          lastSeen: presence?.lastSeen || null,
          isOnline,
          connectionCount
        };
      });

      return statuses;

    } catch (error) {
      logger.error('Erreur lors de la récupération en lot des statuts:', { 
        userCount: userIds?.length, 
        error: error.message 
      });
      throw error;
    }
  }

  async notifyStatusChange(userId, status, statusMessage) {
    try {
      if (this.notificationService) {
        await this.notificationService.broadcastPresenceUpdate(userId, {
          userId,
          status,
          statusMessage,
          lastSeen: new Date(),
          type: 'status_change'
        });
      }
    } catch (error) {
      logger.warn('Erreur lors de la notification du changement de statut:', { 
        userId, 
        status, 
        error: error.message 
      });
    }
  }

  async notifyActivity(userId, activity) {
    try {
      if (this.notificationService) {
        await this.notificationService.broadcastUserActivity(userId, {
          userId,
          activity,
          timestamp: new Date(),
          type: 'activity_update'
        });
      }
    } catch (error) {
      logger.warn('Erreur lors de la notification de l\'activité:', { 
        userId, 
        activity, 
        error: error.message 
      });
    }
  }
}

module.exports = ManagePresenceUseCase;
