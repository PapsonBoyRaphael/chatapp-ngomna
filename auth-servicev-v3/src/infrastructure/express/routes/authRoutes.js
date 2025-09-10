const express = require('express');
const { validateMatricule, validateMatriculeParam } = require('../middleware/validation');

/**
 * Authentication Routes
 * 
 * Purpose: Define HTTP endpoints for authentication operations
 */
const createAuthRoutes = (authController, webController) => {
  const router = express.Router();

  // API Routes
  router.post('/verify', validateMatricule, authController.verifyMatricule.bind(authController));
  router.get('/info/:matricule', validateMatriculeParam, authController.getAgentInfo.bind(authController));
  router.get('/health', authController.healthCheck.bind(authController));

  // Web Routes for testing
  router.get('/', webController.showVerifyPage.bind(webController));
  router.post('/', webController.processVerification.bind(webController));

  return router;
};

module.exports = createAuthRoutes;