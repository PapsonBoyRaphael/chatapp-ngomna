const express = require('express');
const { validateSearchUnits, validateAttachAgent, validateSearchAgents } = require('../middleware/validation');

/**
 * Visibility Routes
 */
const createVisibilityRoutes = (visibilityController, webController) => {
  const router = express.Router();

  // API Routes
  router.get('/units/search', validateSearchUnits, visibilityController.searchUnits.bind(visibilityController));
  router.get('/units/suggestions', visibilityController.getUnitSuggestions.bind(visibilityController));
  router.post('/agents/attach', validateAttachAgent, visibilityController.attachAgentToUnit.bind(visibilityController));
  router.get('/agents/collaborators', visibilityController.getCollaborators.bind(visibilityController));
  router.get('/agents/search', validateSearchAgents, visibilityController.searchAgents.bind(visibilityController));
  router.get('/health', visibilityController.healthCheck.bind(visibilityController));

  // Web Routes for testing
  router.get('/', webController.showSearchPage.bind(webController));
  router.post('/verify', webController.processAgentVerification.bind(webController));
  router.post('/attach', webController.processUnitAttachment.bind(webController));
  router.get('/collaborators', webController.showCollaborators.bind(webController));

  return router;
};

module.exports = createVisibilityRoutes;