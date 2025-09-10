const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import our clean architecture components
const DatabaseConfig = require('./infrastructure/database/config/database');
const PostgresAgentRepository = require('./infrastructure/database/repositories/PostgresAgentRepository');
const VerifyMatriculeUseCase = require('./application/use-cases/VerifyMatriculeUseCase');
const GetAgentInfoUseCase = require('./application/use-cases/GetAgentInfoUseCase');
const AuthenticationService = require('./application/services/AuthenticationService');
const AuthController = require('./interfaces/http/AuthController');
const WebController = require('./interfaces/web/WebController');
const createAuthRoutes = require('./infrastructure/express/routes/authRoutes');
const errorHandler = require('./infrastructure/express/middleware/errorHandler');
const requestLogger = require('./infrastructure/express/middleware/requestLogger');

/**
 * Authentication Service Application
 * 
 * Why this architecture?
 * - Clean separation of concerns
 * - Easy to test each layer independently
 * - Flexible and maintainable
 * - Follows SOLID principles
 */
class AuthApplication {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3001;
    this.initializeDatabase();
    this.setupDependencies();
    this.setupMiddleware();
    this.setupViews();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  async initializeDatabase() {
    this.database = new DatabaseConfig();
    
    // Test database connection
    const isConnected = await this.database.testConnection();
    if (!isConnected) {
      console.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }
  }

  setupDependencies() {
    // Repository layer (Infrastructure)
    this.agentRepository = new PostgresAgentRepository(this.database);
    
    // Use case layer (Application)
    this.verifyMatriculeUseCase = new VerifyMatriculeUseCase(this.agentRepository);
    this.getAgentInfoUseCase = new GetAgentInfoUseCase(this.agentRepository);
    
    // Service layer (Application)
    this.authenticationService = new AuthenticationService(
      this.verifyMatriculeUseCase,
      this.getAgentInfoUseCase
    );
    
    // Controller layer (Interface)
    this.authController = new AuthController(this.authenticationService);
    this.webController = new WebController(this.authenticationService);
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false // Allow inline scripts for simplicity in testing
    }));
    
    // CORS middleware
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? process.env.ALLOWED_ORIGINS?.split(',') 
        : true,
      credentials: true
    }));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      message: {
        success: false,
        message: 'Too many requests from this IP',
        code: 'RATE_LIMIT_EXCEEDED'
      }
    });
    this.app.use(limiter);
    
    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use(requestLogger);
  }

  setupViews() {
    // Set up EJS templating
    this.app.set('view engine', 'ejs');
    this.app.set('views', path.join(__dirname, 'infrastructure/express/views'));
    
    // Simple layout engine for EJS
    const expressLayouts = require('express-ejs-layouts');
    this.app.use(expressLayouts);
    this.app.set('layout', 'layout');
    this.app.set('layout extractScripts', true);
    this.app.set('layout extractStyles', true);
  }

  setupRoutes() {
    // API routes
    const authRoutes = createAuthRoutes(this.authController, this.webController);
    this.app.use('/api/auth', authRoutes);
    
    // Web routes for testing
    this.app.use('/', authRoutes);
    
    // 404 handler
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
      this.app.listen(this.port, () => {
        console.log('🚀 Authentication Service started successfully!');
        console.log(`📍 Port: ${this.port}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
        console.log(`🗄️  Database: ${process.env.POSTGRES_DB}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}`);
        console.log(`🔗 API: http://localhost:${this.port}/api/auth`);
        console.log(`🌐 Web Interface: http://localhost:${this.port}`);
        console.log('='.repeat(60));
      });
    } catch (error) {
      console.error('Failed to start authentication service:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    console.log('Shutting down authentication service...');
    if (this.database) {
      await this.database.close();
    }
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received');
  if (global.authApp) {
    await global.authApp.shutdown();
  }
});

process.on('SIGINT', async () => {
  console.log('SIGINT received');
  if (global.authApp) {
    await global.authApp.shutdown();
  }
});

// Start the application
const startApplication = async () => {
  try {
    global.authApp = new AuthApplication();
    await global.authApp.start();
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
};

// Only start if this file is run directly
if (require.main === module) {
  startApplication();
}

module.exports = AuthApplication;