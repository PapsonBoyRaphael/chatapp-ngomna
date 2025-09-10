require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const routes = require('./interfaces/http/routes');
const errorHandler = require('./middleware/errorHandler');
const requestLogger = require('./middleware/requestLogger');
const dbConfig = require('./config/database');
const logger = require('./utils/logger');
require('dotenv').config();

class VisibilityApp {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3002;
    this.setupMiddleware();
    this.setupViews();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  async initializeDatabase() {
    const isConnected = await dbConfig.testConnection();
    if (!isConnected) {
      logger.error('Failed to connect to Neo4j. Exiting...');
      process.exit(1);
    }
  }

  setupMiddleware() {
    this.app.use(helmet({
      contentSecurityPolicy: false
    }));
    this.app.use(cors({
      origin: ['http://localhost:3001', 'http://localhost:3002'],
      credentials: true
    }));
    this.app.use(rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      message: {
        success: false,
        message: 'Too many requests from this IP',
        code: 'RATE_LIMIT_EXCEEDED'
      }
    }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(requestLogger);
  }

  setupViews() {
    this.app.set('view engine', 'ejs');
    this.app.set('views', path.join(__dirname, 'templates'));
    this.app.use(expressLayouts);
    this.app.set('layout', 'layout');
    this.app.set('layout extractScripts', true);
    this.app.set('layout extractStyles', true);
  }

  setupRoutes() {
    this.app.use('/', routes);
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found',
        code: 'ROUTE_NOT_FOUND'
      });
    });
  }

  setupErrorHandling() {
    this.app.use(errorHandler);
  }

  async start() {
    try {
      await this.initializeDatabase();
      this.app.listen(this.port, () => {
        logger.info('🚀 Visibility Service started successfully!');
        logger.info(`📍 Port: ${this.port}`);
        logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
        logger.info(`🗄️  Neo4j: ${process.env.NEO4J_URI}`);
        logger.info(`🔗 API: http://localhost:${this.port}/api`);
        logger.info(`🌐 Web Interface: http://localhost:${this.port}`);
        logger.info('='.repeat(60));
      });
    } catch (error) {
      logger.error('Failed to start visibility service:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    logger.info('Shutting down visibility service...');
    await dbConfig.close();
    process.exit(0);
  }
}

const startApplication = async () => {
  try {
    global.visibilityApp = new VisibilityApp();
    await global.visibilityApp.start();
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startApplication();
}

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received');
  if (global.visibilityApp) {
    await global.visibilityApp.shutdown();
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received');
  if (global.visibilityApp) {
    await global.visibilityApp.shutdown();
  }
});

module.exports = VisibilityApp;