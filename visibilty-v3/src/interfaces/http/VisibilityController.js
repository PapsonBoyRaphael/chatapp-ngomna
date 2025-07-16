/**
 * Visibility Controller
 * 
 * Purpose: Handles HTTP API requests for visibility operations
 */
class VisibilityController {
  constructor(visibilityService) {
    this.visibilityService = visibilityService;
  }

  async searchUnits(req, res) {
    try {
      const { ministry, query } = req.query;
      const result = await this.visibilityService.searchUnits(ministry, query);
      
      const statusCode = result.success ? 200 : 
        (result.code === 'NO_UNITS_FOUND' ? 404 : 400);
      
      res.status(statusCode).json(result);
    } catch (error) {
      console.error('Error in searchUnits:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  async getUnitSuggestions(req, res) {
    try {
      const { ministry, q } = req.query;
      const result = await this.visibilityService.getUnitSuggestions(ministry, q);
      
      res.json(result);
    } catch (error) {
      console.error('Error in getUnitSuggestions:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  async attachAgentToUnit(req, res) {
    try {
      const result = await this.visibilityService.attachAgentToUnit(req.body);
      
      const statusCode = result.success ? 200 : 
        (result.code === 'UNIT_NOT_FOUND' ? 404 : 400);
      
      res.status(statusCode).json(result);
    } catch (error) {
      console.error('Error in attachAgentToUnit:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  async getCollaborators(req, res) {
    try {
      const { matricule, rank } = req.query;
      const result = await this.visibilityService.getCollaborators(matricule, rank);
      
      const statusCode = result.success ? 200 : 
        (result.code === 'AGENT_NOT_ATTACHED' ? 404 : 400);
      
      res.status(statusCode).json(result);
    } catch (error) {
      console.error('Error in getCollaborators:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  async searchAgents(req, res) {
    try {
      const { query, rank } = req.query;
      const result = await this.visibilityService.searchAgents(query, rank);
      
      res.json(result);
    } catch (error) {
      console.error('Error in searchAgents:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  async healthCheck(req, res) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'visibility-service'
    });
  }
}

module.exports = VisibilityController;