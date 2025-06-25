const express = require('express');
const VisibilityController = require('../controllers/visibility.controller');
const VisibilityNeo4jRepository = require('../../database/neo4j/visibility-neo4j.repository');

const router = express.Router();
const visibilityController = new VisibilityController(new VisibilityNeo4jRepository());

router.get('/visibility', visibilityController.renderUnitSelection.bind(visibilityController));
router.post('/validate-unit', visibilityController.validateUnit.bind(visibilityController));
router.get('/collaborators', visibilityController.renderCollaborators.bind(visibilityController));
router.post('/search-agents', visibilityController.searchAgents.bind(visibilityController));

module.exports = router;