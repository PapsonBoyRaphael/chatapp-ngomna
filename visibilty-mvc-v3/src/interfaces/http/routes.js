const express = require('express');
const UnitController = require('../../controllers/UnitController');
const AgentController = require('../../controllers/AgentController');
const UnitWebController = require('../web/UnitWebController');
const AgentWebController = require('../web/AgentWebController');
const { validateSearch, validateLink } = require('../../middleware/validation');
const UnitService = require('../../services/UnitService');

const router = express.Router();

// Root route to handle initial access
router.get('/', async (req, res) => {
  const { matricule } = req.query;
  if (!matricule) {
    return res.status(400).json({
      success: false,
      message: 'Matricule is required',
      code: 'MISSING_MATRICULE'
    });
  }

  try {
    const unit = await UnitService.getAgentUnit(matricule);
    if (unit) {
      res.redirect(`/collaborators?matricule=${matricule}`);
    } else {
      res.redirect(`/search-unit?matricule=${matricule}`);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check agent unit',
      code: 'INTERNAL_ERROR'
    });
  }
});

// API Routes
router.get('/api/units/search', validateSearch, UnitController.searchUnits.bind(UnitController));
router.post('/api/units/link', validateLink, UnitController.linkAgentToUnit.bind(UnitController));
router.get('/api/units/:matricule', UnitController.getAgentUnit.bind(UnitController));
router.get('/api/collaborators', UnitController.getCollaborators.bind(UnitController));
router.get('/api/overseen', UnitController.getOverseenUnits.bind(UnitController));
router.get('/api/boss', UnitController.getSupervisingUnitBoss.bind(UnitController));
router.get('/api/units/:unitId/boss', UnitController.getUnitBoss.bind(UnitController));
router.get('/api/agents/search', validateSearch, AgentController.searchAgents.bind(AgentController));

// Web Routes
router.get('/search-unit', UnitWebController.showSearchUnitPage.bind(UnitWebController));
router.get('/confirm-unit', UnitWebController.showConfirmUnitPage.bind(UnitWebController));
router.post('/link-unit', UnitWebController.processUnitLink.bind(UnitWebController));
router.get('/collaborators', UnitWebController.showCollaboratorsPage.bind(UnitWebController));
router.get('/search-agent', AgentWebController.showSearchAgentPage.bind(AgentWebController));

module.exports = router;