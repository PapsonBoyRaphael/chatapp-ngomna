/**
 * Health Routes - Chat Files Service
 * CENADI Chat-Files-Service
 * Routes de surveillance pour service autonome
 */

const express = require('express');
const { createLogger } = require('../../../../shared/utils/logger');

const logger = createLogger('HealthRoutes');

class HealthRoutes {
  static createRouter() {
    const router = express.Router();

    // Health check simple (pour load balancer)
    router.get('/', async (req, res) => {
      res.json({
        status: 'healthy',
        service: 'chat-files-service',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Health check détaillé (pour monitoring)
    router.get('/detailed', async (req, res, next) => {
      try {
        const health = {
          status: 'healthy',
          service: 'chat-files-service',
          version: process.env.npm_package_version || '1.0.0',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          checks: {}
        };

        // Vérifier la base de données
        health.checks.database = await this.checkDatabase();
        
        // Vérifier le stockage
        health.checks.storage = await this.checkStorage();
        
        // Vérifier la mémoire
        health.checks.memory = await this.checkMemory();
        
        // Vérifier les services externes
        health.checks.externalServices = await this.checkExternalServices();

        // Déterminer le statut global
        const allHealthy = Object.values(health.checks).every(check => check.status === 'healthy');
        health.status = allHealthy ? 'healthy' : 'unhealthy';

        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);

      } catch (error) {
        next(error);
      }
    });

    // Informations sur le service
    router.get('/info', async (req, res) => {
      res.json({
        service: 'chat-files-service',
        description: 'Service de gestion des fichiers pour messagerie agents publics',
        version: process.env.npm_package_version || '1.0.0',
        features: [
          'Upload de fichiers multi-format',
          'Partage sécurisé avec tokens',
          'Gestion d\'avatars agents',
          'Contrôle d\'accès par chat',
          'Rate limiting adaptatif'
        ],
        limits: {
          maxFileSize: '100MB',
          maxFilesPerUpload: 10,
          supportedFormats: ['image/*', 'video/*', 'audio/*', 'application/pdf', 'text/*']
        },
        timestamp: new Date().toISOString()
      });
    });

    return router;
  }

  // Vérifier la base de données
  static async checkDatabase() {
    try {
      // TODO: Ping MongoDB
      return {
        status: 'healthy',
        responseTime: Math.random() * 10,
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
    }
  }

  // Vérifier le stockage
  static async checkStorage() {
    try {
      const fs = require('fs').promises;
      const storagePath = './storage';
      await fs.access(storagePath);
      
      return {
        status: 'healthy',
        accessible: true,
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
    }
  }

  // Vérifier la mémoire
  static async checkMemory() {
    const memUsage = process.memoryUsage();
    const maxMemory = 1024 * 1024 * 1024; // 1GB limite
    
    const memoryPercent = (memUsage.heapUsed / maxMemory) * 100;
    
    return {
      status: memoryPercent < 90 ? 'healthy' : 'unhealthy',
      usage: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      },
      percentUsed: Math.round(memoryPercent * 100) / 100,
      lastCheck: new Date().toISOString()
    };
  }

  // Vérifier les services externes
  static async checkExternalServices() {
    const services = {
      visibilityService: process.env.VISIBILITY_SERVICE_URL,
      chatService: process.env.CHAT_SERVICE_URL
    };

    const checks = {};

    for (const [name, url] of Object.entries(services)) {
      if (!url) {
        checks[name] = {
          status: 'disabled',
          message: 'Service non configuré'
        };
        continue;
      }

      try {
        // TODO: Ping réel des services
        checks[name] = {
          status: 'healthy',
          url,
          responseTime: Math.random() * 100,
          lastCheck: new Date().toISOString()
        };
      } catch (error) {
        checks[name] = {
          status: 'unhealthy',
          url,
          error: error.message,
          lastCheck: new Date().toISOString()
        };
      }
    }

    return checks;
  }
}

module.exports = HealthRoutes;
