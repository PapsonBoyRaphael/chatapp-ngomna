const config = require('../../../shared/config');
const path = require('path');
const fs = require('fs');

async function healthRoutes(fastify, options) {
  // Health check complet
  fastify.get('/', async (request, reply) => {
    const startTime = Date.now();
    
    const health = {
      status: 'healthy',
      service: 'chat-files-service',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
      },
      environment: config.server.environment,
      nodeVersion: process.version,
      dependencies: {},
      storage: {},
      performance: {}
    };

    let overallStatus = 'healthy';
    const checks = [];

    // Check MongoDB
    try {
      const mongoConnection = require('../../../infrastructure/database/mongodb/connection');
      if (mongoConnection.isConnected && mongoConnection.isConnected()) {
        health.dependencies.mongodb = { 
          status: 'connected',
          database: config.database.mongodb.dbName
        };
        checks.push({ name: 'mongodb', status: 'ok' });
      } else {
        health.dependencies.mongodb = { status: 'disconnected' };
        checks.push({ name: 'mongodb', status: 'fail' });
        overallStatus = 'degraded';
      }
    } catch (error) {
      health.dependencies.mongodb = { 
        status: 'error', 
        message: error.message 
      };
      checks.push({ name: 'mongodb', status: 'error', error: error.message });
      overallStatus = 'degraded';
    }

    // Check Redis
    try {
      const redisConnection = require('../../../infrastructure/database/redis/connection');
      if (redisConnection.isConnected && redisConnection.isConnected()) {
        health.dependencies.redis = { status: 'connected' };
        checks.push({ name: 'redis', status: 'ok' });
      } else {
        health.dependencies.redis = { status: 'disconnected' };
        checks.push({ name: 'redis', status: 'fail' });
      }
    } catch (error) {
      health.dependencies.redis = { 
        status: 'error', 
        message: error.message 
      };
      checks.push({ name: 'redis', status: 'error', error: error.message });
    }

    // Check Kafka
    if (config.kafka.enabled) {
      try {
        const kafkaProducer = require('../../../infrastructure/messaging/kafka/KafkaProducer');
        const kafkaHealth = await kafkaProducer.healthCheck();
        health.dependencies.kafka = kafkaHealth;
        checks.push({ name: 'kafka', status: kafkaHealth.status === 'healthy' ? 'ok' : 'fail' });
      } catch (error) {
        health.dependencies.kafka = { status: 'error', message: error.message };
        checks.push({ name: 'kafka', status: 'error', error: error.message });
      }
    } else {
      health.dependencies.kafka = { status: 'disabled' };
      checks.push({ name: 'kafka', status: 'disabled' });
    }

    // Check storage directories
    try {
      const uploadsPath = config.fileStorage.uploadPath;
      const thumbnailsPath = config.fileStorage.thumbnailPath;
      
      health.storage = {
        uploadsPath,
        uploadsAccessible: fs.existsSync(uploadsPath),
        thumbnailsPath,
        thumbnailsAccessible: fs.existsSync(thumbnailsPath)
      };

      if (!health.storage.uploadsAccessible) {
        // Créer le dossier s'il n'existe pas
        try {
          await fs.promises.mkdir(uploadsPath, { recursive: true });
          health.storage.uploadsAccessible = true;
          health.storage.uploadsCreated = true;
        } catch (createError) {
          overallStatus = 'degraded';
          health.storage.error = createError.message;
        }
      }

      checks.push({ 
        name: 'storage', 
        status: health.storage.uploadsAccessible ? 'ok' : 'fail' 
      });

    } catch (error) {
      health.storage = { 
        accessible: false, 
        error: error.message 
      };
      checks.push({ name: 'storage', status: 'error', error: error.message });
      overallStatus = 'degraded';
    }

    // Performance metrics
    const responseTime = Date.now() - startTime;
    health.performance = {
      responseTime: `${responseTime}ms`,
      loadAverage: process.platform !== 'win32' ? require('os').loadavg() : null,
      cpuUsage: process.cpuUsage()
    };

    // Summary
    health.status = overallStatus;
    health.checks = checks;
    health.summary = {
      total: checks.length,
      passing: checks.filter(c => c.status === 'ok').length,
      failing: checks.filter(c => c.status === 'fail').length,
      errors: checks.filter(c => c.status === 'error').length,
      disabled: checks.filter(c => c.status === 'disabled').length
    };

    // HTTP status code
    if (overallStatus === 'healthy') {
      reply.code(200);
    } else if (overallStatus === 'degraded') {
      reply.code(200); // Still operational
    } else {
      reply.code(503); // Service unavailable
    }

    return health;
  });

  // Readiness probe (simple)
  fastify.get('/ready', async (request, reply) => {
    const ready = {
      status: 'ready',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pid: process.pid
    };

    reply.code(200);
    return ready;
  });

  // Liveness probe (très simple)
  fastify.get('/live', async (request, reply) => {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pid: process.pid
    };
  });

  // Metrics endpoint
  fastify.get('/metrics', async (request, reply) => {
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      platform: {
        arch: process.arch,
        platform: process.platform,
        version: process.version
      }
    };

    if (process.platform !== 'win32') {
      metrics.loadAverage = require('os').loadavg();
    }

    return metrics;
  });
}

module.exports = healthRoutes;
