const { Server } = require('socket.io');
const logger = require('../../shared/utils/logger');

class SocketIOServer {
  constructor(httpServer) {
    this.httpServer = httpServer;
    this.io = null;
    this.connectedUsers = new Map();
  }

  async initialize() {
    try {
      this.io = new Server(this.httpServer, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"]
        }
      });

      this.setupEventHandlers();
      logger.info('✅ SocketIO Server initialized');
    } catch (error) {
      logger.error('❌ SocketIO initialization failed:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`User connected: ${socket.id}`);

      socket.on('join_conversation', (conversationId) => {
        socket.join(conversationId);
        logger.info(`User ${socket.id} joined conversation ${conversationId}`);
      });

      socket.on('leave_conversation', (conversationId) => {
        socket.leave(conversationId);
        logger.info(`User ${socket.id} left conversation ${conversationId}`);
      });

      socket.on('disconnect', () => {
        logger.info(`User disconnected: ${socket.id}`);
      });
    });
  }

  sendMessageToConversation(conversationId, message) {
    if (this.io) {
      this.io.to(conversationId).emit('new_message', message);
    }
  }

  notifyMessageStatus(userId, messageId, status) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId && this.io) {
      this.io.to(socketId).emit('message_status', { messageId, status });
    }
  }

  notifyFileUploaded(conversationId, fileData) {
    if (this.io) {
      this.io.to(conversationId).emit('file_uploaded', fileData);
    }
  }
}

module.exports = SocketIOServer;
