/**
 * Point d'entrée principal du Chat-Files-Service
 * CENADI - 2024
 */

require('dotenv').config();
const { createLogger } = require('./shared/utils/logger');
const server = require('./server');

// Configuration du logger principal
const logger = createLogger('main');

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  logger.error('Erreur non capturée:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promesse rejetée non gérée:', { reason, promise });
  process.exit(1);
});

// Gestion de l'arrêt gracieux
process.on('SIGTERM', () => {
  logger.info('SIGTERM reçu, arrêt du service...');
  server.close(() => {
    logger.info('Service arrêté proprement');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT reçu, arrêt du service...');
  server.close(() => {
    logger.info('Service arrêté proprement');
    process.exit(0);
  });
});

// Démarrage du serveur
const startService = async () => {
  try {
    logger.info('🚀 Démarrage du Chat-Files-Service...');
    
    const port = process.env.PORT || 8003;
    const host = process.env.HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    
    logger.info(`✅ Chat-Files-Service démarré avec succès`);
    logger.info(`🌐 Serveur accessible sur: http://${host}:${port}`);
    logger.info(`📊 Environnement: ${process.env.NODE_ENV}`);
    logger.info(`🔧 Version: ${process.env.SERVICE_VERSION || '1.0.0'}`);
    
    // Affichage des liens utiles
    console.log('\n' + '='.repeat(60));
    console.log('🎯 CENADI CHAT-FILES-SERVICE - LIENS RAPIDES');
    console.log('='.repeat(60));
    console.log(`🌐 API Principal         : http://${host}:${port}/api/v1`);
    console.log(`📊 Santé du service     : http://${host}:${port}/api/v1/health`);
    console.log(`📚 Documentation API    : http://${host}:${port}/api/v1/docs`);
    console.log(`💬 WebSocket            : ws://${host}:${port}`);
    console.log(`📁 Upload de fichiers   : http://${host}:${port}/api/v1/files`);
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    logger.error('❌ Erreur lors du démarrage du service:', error);
    process.exit(1);
  }
};

// Lancement du service
startService();
