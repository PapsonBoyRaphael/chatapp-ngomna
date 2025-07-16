const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import our clean architecture components
const InMemoryServiceRegistry = require('./infrastructure/repositories/InMemoryServiceRegistry');
const ProxyService = require('./application/services/ProxyService');
const RouteRequestUseCase = require('./application/use-cases/RouteRequestUseCase');
const GatewayController = require('./interfaces/http/GatewayController');
const createGatewayRoutes = require('./infrastructure/express/routes/gatewayRoutes');
const errorHandler = require('./infrastructure/express/middleware/errorHandler');
const requestLogger = require('./infrastructure/express/middleware/requestLogger');
const { createServiceRoutes } = require('./infrastructure/config/services');

/**
 * Application Setup
 * 
 * Why this structure?
 * - Dependency injection makes testing easier
 * - Clear separation of concerns
 * - Easy to modify without breaking other parts
 */
class Application {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.setupDependencies();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupDependencies() {
    // Repository layer
    this.serviceRegistry = new InMemoryServiceRegistry();
    
    // Service layer
    this.proxyService = new ProxyService();
    
    // Use case layer
    this.routeRequestUseCase = new RouteRequestUseCase(
      this.serviceRegistry,
      this.proxyService
    );
    
    // Controller layer
    this.gatewayController = new GatewayController(this.routeRequestUseCase);
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    
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
      message: 'Too many requests from this IP'
    });
    this.app.use(limiter);
    
    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use(requestLogger);
  }

  setupRoutes() {
    // Register service routes
    const routes = createServiceRoutes();
    routes.forEach(route => this.serviceRegistry.registerRoute(route));
    
    // Setup gateway routes
    const gatewayRoutes = createGatewayRoutes(this.gatewayController);
    this.app.use('/api/gateway', gatewayRoutes);
    
    // All other routes go through the proxy
    this.app.use('/', gatewayRoutes);
  }

  setupErrorHandling() {
    this.app.use(errorHandler);
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`🚀 API Gateway running on port ${this.port}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 Auth Service: ${process.env.AUTH_SERVICE_URL}`);
      console.log(`🔗 Visibility Service: ${process.env.VISIBILITY_SERVICE_URL}`);
    });
  }
}

// Start the application
const app = new Application();
app.start();

module.exports = Application;