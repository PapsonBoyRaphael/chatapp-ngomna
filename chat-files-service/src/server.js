/**
 * Serveur HTTP avec support WebSocket
 * CENADI Chat-Files-Service
 */

const { Server } = require('socket.io');
const createApp = require('./app');
const config = require('./shared/config');
const { createLogger } = require('./shared/utils/logger');

// Initialisation des connexions
const { connectMongoDB } = require('./infrastructure/database/mongodb/connection');
const { connectRedis } = require('./infrastructure/database/redis/connection');

// WebSocket handlers
const SocketHandlers = require('./interfaces/websocket/SocketHandlers');

const logger = createLogger('server');

/**
 * Créer et configurer le serveur
 */
const createServer = async () => {
  try {
    // Créer l'application Fastify
    const app = await createApp();
    
    // Vérifier les connexions aux bases de données
    const connections = await checkDatabaseConnections();
    
    // Configurer WebSocket si activé
    let io = null;
    if (config.websocket.enabled) {
      io = await setupWebSocket(app.server);
    }
    
    // Ajouter les informations de connexion à l'application
    app.decorate('connections', connections);
    app.decorate('socketIO', io);
    
    logger.info('✅ Serveur créé et configuré avec succès');
    return app;

  } catch (error) {
    logger.error('❌ Erreur lors de la création du serveur:', error);
    throw error;
  }
};

/**
 * Vérifier les connexions aux bases de données
 */
const checkDatabaseConnections = async () => {
  const connections = {
    mongodb: false,
    redis: false
  };

  try {
    // Connexion MongoDB
    await connectMongoDB();
    connections.mongodb = true;
    logger.info('✅ MongoDB connecté');
  } catch (error) {
    logger.warn('⚠️  MongoDB non disponible:', error.message);
  }

  try {
    // Connexion Redis
    await connectRedis();
    connections.redis = true;
    logger.info('✅ Redis connecté');
  } catch (error) {
    logger.warn('⚠️  Redis non disponible:', error.message);
  }

  return connections;
};

/**
 * Configurer WebSocket avec Socket.IO
 */
const setupWebSocket = async (httpServer) => {
  try {
    const io = new Server(httpServer, config.websocket.options);
    
    // Initialiser les gestionnaires WebSocket
    const socketHandlers = new SocketHandlers();
    await socketHandlers.initialize(io);
    
    logger.info('✅ WebSocket configuré avec Socket.IO');
    return io;

  } catch (error) {
    logger.error('❌ Erreur lors de la configuration WebSocket:', error);
    throw error;
  }
};

/**
 * Démarrer le serveur
 */
const startServer = async () => {
  try {
    const server = await createServer();
    
    // Ajouter des informations de diagnostic
    server.ready(() => {
      logger.info('🎯 Serveur prêt à recevoir des connexions');
      
      // Afficher les informations de configuration
      logServerInfo(server);
    });

    return server;

  } catch (error) {
    logger.error('❌ Erreur lors du démarrage du serveur:', error);
    throw error;
  }
};

/**
 * Afficher les informations du serveur
 */
const logServerInfo = (server) => {
  const connections = server.connections;
  
  logger.info('📊 État des connexions:', {
    mongodb: connections.mongodb ? '✅ Connecté' : '❌ Déconnecté',
    redis: connections.redis ? '✅ Connecté' : '❌ Déconnecté',
    websocket: config.websocket.enabled ? '✅ Activé' : '❌ Désactivé'
  });
  
  logger.info('🔧 Configuration active:', {
    environment: config.app.environment,
    logLevel: config.app.logLevel,
    maxFileSize: config.files.maxFileSize,
    storageType: config.storage.type
  });
};

module.exports = startServer();
