/**
 * Use Case: Connecter un utilisateur en temps réel
 * CENADI Chat-Files-Service
 */

const { createLogger } = require('../../../shared/utils/logger');
const { ValidationException } = require('../../../shared/exceptions/ValidationException');
const { AuthenticationException } = require('../../../shared/exceptions/AuthenticationException');

const logger = createLogger('ConnectUserUseCase');

class ConnectUserUseCase {
  constructor(dependencies) {
    this.presenceRepository = dependencies.presenceRepository;
    this.conversationRepository = dependencies.conversationRepository;
    this.connectionManager = dependencies.connectionManager;
    this.notificationService = dependencies.notificationService;
    this.authenticationService = dependencies.authenticationService;
  }

  async execute(params) {
    try {
      const { socket, token, userAgent, ip } = params;

      logger.info('Connexion utilisateur en temps réel:', { socketId: socket.id, ip });

      // 1. Authentifier l'utilisateur
      const user = await this.authenticateUser(token);

      // 2. Valider la connexion
      await this.validateConnection(user, socket);

      // 3. Enregistrer la connexion
      const connection = await this.registerConnection(user, socket, { userAgent, ip });

      // 4. Mettre à jour le statut de présence
      await this.updatePresenceStatus(user.id, 'online');

      // 5. Rejoindre les salles de conversation
      await this.joinConversationRooms(user.id, socket);

      // 6. Configurer les handlers d'événements
      await this.setupEventHandlers(socket, user, connection);

      // 7. Notifier la connexion
      await this.notifyConnection(user);

      // 8. Envoyer les données de synchronisation initiale
      await this.sendInitialData(socket, user);

      logger.info('Utilisateur connecté avec succès:', { userId: user.id, socketId: socket.id });

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          status: 'online'
        },
        connectionId: connection.id,
        connectedAt: connection.connectedAt
      };

    } catch (error) {
      logger.error('Erreur lors de la connexion utilisateur:', { error: error.message });
      throw error;
    }
  }

  async authenticateUser(token) {
    if (!token) {
      throw new AuthenticationException('Token d\'authentification requis');
    }

    try {
      return await this.authenticationService.validateToken(token);
    } catch (error) {
      throw new AuthenticationException(`Authentification échouée: ${error.message}`);
    }
  }

  async validateConnection(user, socket) {
    // Vérifier les limites de connexions simultanées
    const activeConnections = await this.connectionManager.getActiveConnections(user.id);
    
    if (activeConnections.length >= 5) {
      throw new ValidationException('Limite de connexions simultanées atteinte (5)');
    }

    // Vérifier si l'utilisateur n'est pas banni
    if (user.status === 'banned') {
      throw new ValidationException('Utilisateur banni');
    }
  }

  async registerConnection(user, socket, metadata) {
    const connectionData = {
      userId: user.id,
      socketId: socket.id,
      status: 'active',
      connectedAt: new Date(),
      lastSeen: new Date(),
      metadata: {
        userAgent: metadata.userAgent,
        ip: metadata.ip,
        platform: this.detectPlatform(metadata.userAgent),
        browser: this.detectBrowser(metadata.userAgent)
      }
    };

    const connection = await this.connectionManager.createConnection(connectionData);
    
    // Associer l'utilisateur au socket
    socket.userId = user.id;
    socket.connectionId = connection.id;
    
    return connection;
  }

  async updatePresenceStatus(userId, status) {
    try {
      await this.presenceRepository.updateStatus(userId, {
        status,
        lastSeen: new Date(),
        updatedAt: new Date()
      });
    } catch (error) {
      logger.warn('Impossible de mettre à jour le statut de présence:', { 
        userId, 
        error: error.message 
      });
    }
  }

  async joinConversationRooms(userId, socket) {
    try {
      // Récupérer toutes les conversations de l'utilisateur
      const conversations = await this.conversationRepository.findByParticipant(userId);
      
      // Rejoindre chaque room de conversation
      for (const conversation of conversations) {
        const roomName = `conversation:${conversation.id}`;
        socket.join(roomName);
        
        logger.debug('Utilisateur rejoint la room:', { userId, conversationId: conversation.id });
      }

      // Rejoindre la room personnelle de l'utilisateur
      socket.join(`user:${userId}`);

    } catch (error) {
      logger.warn('Erreur lors de la jointure des rooms:', { userId, error: error.message });
    }
  }

  async setupEventHandlers(socket, user, connection) {
    // Handler pour la déconnexion
    socket.on('disconnect', async (reason) => {
      await this.handleDisconnection(user.id, socket.id, reason);
    });

    // Handler pour les messages de heartbeat
    socket.on('heartbeat', async () => {
      await this.handleHeartbeat(user.id, connection.id);
    });

    // Handler pour les changements de statut
    socket.on('status_change', async (newStatus) => {
      await this.handleStatusChange(user.id, newStatus);
    });

    // Handler pour la frappe en cours
    socket.on('typing_start', async (data) => {
      await this.handleTypingStart(user.id, data.conversationId, socket);
    });

    socket.on('typing_stop', async (data) => {
      await this.handleTypingStop(user.id, data.conversationId, socket);
    });

    // Handler pour rejoindre/quitter des conversations
    socket.on('join_conversation', async (data) => {
      await this.handleJoinConversation(user.id, data.conversationId, socket);
    });

    socket.on('leave_conversation', async (data) => {
      await this.handleLeaveConversation(user.id, data.conversationId, socket);
    });
  }

  async notifyConnection(user) {
    try {
      if (this.notificationService) {
        // Notifier les contacts que l'utilisateur est en ligne
        await this.notificationService.broadcastPresenceUpdate(user.id, {
          userId: user.id,
          status: 'online',
          lastSeen: new Date()
        });
      }
    } catch (error) {
      logger.warn('Erreur lors de la notification de connexion:', { 
        userId: user.id, 
        error: error.message 
      });
    }
  }

  async sendInitialData(socket, user) {
    try {
      // Envoyer les données de synchronisation
      socket.emit('initial_data', {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          status: 'online'
        },
        timestamp: new Date().toISOString(),
        serverTime: Date.now()
      });

      // Envoyer les notifications en attente
      await this.sendPendingNotifications(socket, user.id);

    } catch (error) {
      logger.warn('Erreur lors de l\'envoi des données initiales:', { 
        userId: user.id, 
        error: error.message 
      });
    }
  }

  async sendPendingNotifications(socket, userId) {
    try {
      // Récupérer et envoyer les notifications en attente
      if (this.notificationService) {
        const pendingNotifications = await this.notificationService.getPendingNotifications(userId);
        
        if (pendingNotifications.length > 0) {
          socket.emit('pending_notifications', pendingNotifications);
          
          // Marquer les notifications comme délivrées
          await this.notificationService.markAsDelivered(
            pendingNotifications.map(n => n.id)
          );
        }
      }
    } catch (error) {
      logger.warn('Erreur lors de l\'envoi des notifications en attente:', { 
        userId, 
        error: error.message 
      });
    }
  }

  async handleDisconnection(userId, socketId, reason) {
    try {
      logger.info('Déconnexion utilisateur:', { userId, socketId, reason });

      // Supprimer la connexion
      await this.connectionManager.removeConnection(socketId);

      // Vérifier s'il reste d'autres connexions actives
      const activeConnections = await this.connectionManager.getActiveConnections(userId);
      
      if (activeConnections.length === 0) {
        // Aucune autre connexion active, marquer comme hors ligne
        await this.updatePresenceStatus(userId, 'offline');
        
        // Notifier les contacts
        if (this.notificationService) {
          await this.notificationService.broadcastPresenceUpdate(userId, {
            userId,
            status: 'offline',
            lastSeen: new Date()
          });
        }
      }

    } catch (error) {
      logger.error('Erreur lors de la gestion de la déconnexion:', { 
        userId, 
        socketId, 
        error: error.message 
      });
    }
  }

  async handleHeartbeat(userId, connectionId) {
    try {
      await this.connectionManager.updateLastSeen(connectionId, new Date());
      await this.presenceRepository.updateLastSeen(userId, new Date());
    } catch (error) {
      logger.warn('Erreur lors du heartbeat:', { userId, error: error.message });
    }
  }

  async handleStatusChange(userId, newStatus) {
    try {
      const validStatuses = ['online', 'away', 'busy', 'offline'];
      if (!validStatuses.includes(newStatus)) {
        throw new ValidationException(`Statut invalide: ${newStatus}`);
      }

      await this.updatePresenceStatus(userId, newStatus);

      // Notifier les contacts du changement de statut
      if (this.notificationService) {
        await this.notificationService.broadcastPresenceUpdate(userId, {
          userId,
          status: newStatus,
          lastSeen: new Date()
        });
      }

    } catch (error) {
      logger.warn('Erreur lors du changement de statut:', { userId, newStatus, error: error.message });
    }
  }

  async handleTypingStart(userId, conversationId, socket) {
    try {
      // Notifier les autres participants de la conversation
      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        userId,
        conversationId,
        type: 'start',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.warn('Erreur lors de la notification de frappe:', { userId, conversationId, error: error.message });
    }
  }

  async handleTypingStop(userId, conversationId, socket) {
    try {
      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        userId,
        conversationId,
        type: 'stop',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.warn('Erreur lors de l\'arrêt de notification de frappe:', { userId, conversationId, error: error.message });
    }
  }

  async handleJoinConversation(userId, conversationId, socket) {
    try {
      // Vérifier que l'utilisateur peut rejoindre cette conversation
      const canJoin = await this.conversationRepository.isParticipant(conversationId, userId);
      
      if (canJoin) {
        socket.join(`conversation:${conversationId}`);
        logger.debug('Utilisateur a rejoint la conversation:', { userId, conversationId });
      }
    } catch (error) {
      logger.warn('Erreur lors de la jointure de conversation:', { userId, conversationId, error: error.message });
    }
  }

  async handleLeaveConversation(userId, conversationId, socket) {
    try {
      socket.leave(`conversation:${conversationId}`);
      logger.debug('Utilisateur a quitté la conversation:', { userId, conversationId });
    } catch (error) {
      logger.warn('Erreur lors de la sortie de conversation:', { userId, conversationId, error: error.message });
    }
  }

  detectPlatform(userAgent) {
    if (!userAgent) return 'unknown';
    
    if (/Mobile|Android|iPhone|iPad/.test(userAgent)) return 'mobile';
    if (/Tablet/.test(userAgent)) return 'tablet';
    return 'desktop';
  }

  detectBrowser(userAgent) {
    if (!userAgent) return 'unknown';
    
    if (/Chrome/.test(userAgent)) return 'chrome';
    if (/Firefox/.test(userAgent)) return 'firefox';
    if (/Safari/.test(userAgent)) return 'safari';
    if (/Edge/.test(userAgent)) return 'edge';
    return 'other';
  }
}

module.exports = ConnectUserUseCase;
