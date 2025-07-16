const express = require('express');
const VisibilityController = require('../controllers/visibility.controller');
const VisibilityNeo4jRepository = require('../../database/neo4j/visibility-neo4j.repository');

const router = express.Router();
const visibilityController = new VisibilityController(new VisibilityNeo4jRepository());

router.get('/test-neo4j', async (req, res) => {
  try {
    const session = visibilityController.searchUnitsUseCase.visibilityRepository.driver.session();
    await session.run('MATCH (n) RETURN n LIMIT 1');
    await session.close();
    res.send('Neo4j connection successful');
  } catch (error) {
    console.error('Neo4j connection error:', error.message);
    res.status(500).send('Neo4j connection failed: ' + error.message);
  }
});

router.get('/visibility', visibilityController.renderUnitSelection.bind(visibilityController));
router.post('/validate-unit', visibilityController.validateUnit.bind(visibilityController));
router.get('/collaborators', visibilityController.renderCollaborators.bind(visibilityController));
router.post('/search-agents', visibilityController.searchAgents.bind(visibilityController));

module.exports = router;