const { Server } = require('socket.io');
const logger = require('../../shared/utils/logger');

class SocketIOServer {
  constructor(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });
    this.connectedUsers = new Map();
  }

  async initialize() {
    this.io.on('connection', (socket) => {
      logger.info(`🔌 New socket connection: ${socket.id}`);

      // Authentification
      socket.on('authenticate', async (data) => {
        try {
          // TODO: Valider le token via Auth-Service
          const { userId, token } = data;

          socket.userId = userId;
          this.connectedUsers.set(userId, socket.id);

          socket.emit('authenticated', { status: 'success' });
          logger.info(`✅ User ${userId} authenticated`);
        } catch (error) {
          socket.emit('auth_error', { message: 'Authentication failed' });
          logger.error('❌ Authentication failed:', error);
        }
      });

      // Rejoindre une conversation
      socket.on('join_conversation', (conversationId) => {
        socket.join(conversationId);
        logger.info(
          `👥 User ${socket.userId} joined conversation ${conversationId}`
        );
      });

      // Quitter une conversation
      socket.on('leave_conversation', (conversationId) => {
        socket.leave(conversationId);
        logger.info(
          `👋 User ${socket.userId} left conversation ${conversationId}`
        );
      });

      // Indicateur de frappe
      socket.on('typing', (data) => {
        socket.to(data.conversationId).emit('user_typing', {
          userId: socket.userId,
          conversationId: data.conversationId,
        });
      });

      socket.on('stop_typing', (data) => {
        socket.to(data.conversationId).emit('user_stop_typing', {
          userId: socket.userId,
          conversationId: data.conversationId,
        });
      });

      // Déconnexion
      socket.on('disconnect', () => {
        if (socket.userId) {
          this.connectedUsers.delete(socket.userId);
        }
        logger.info(`�� Socket disconnected: ${socket.id}`);
      });
    });

    logger.info('✅ SocketIO Server initialized');
  }

  // Envoyer un message à une conversation
  sendMessageToConversation(conversationId, message) {
    this.io.to(conversationId).emit('new_message', message);
  }

  // Notifier le statut d'un message
  notifyMessageStatus(userId, messageId, status) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit('message_status', { messageId, status });
    }
  }

  // Notifier un nouvel upload de fichier
  notifyFileUploaded(conversationId, fileData) {
    this.io.to(conversationId).emit('file_uploaded', fileData);
  }
}

module.exports = SocketIOServer;
