const express = require('express');
const router = express.Router();

/**
 * Gateway Routes
 * 
 * Why separate route definitions?
 * - Clear separation of concerns
 * - Easy to test routes in isolation
 * - Reusable route configurations
 */
const createGatewayRoutes = (gatewayController) => {
  // Health check
  router.get('/health', gatewayController.getHealth.bind(gatewayController));
  
  // Catch-all route for proxying
  router.all('*', gatewayController.handleRequest.bind(gatewayController));

  return router;
};

module.exports = createGatewayRoutes;