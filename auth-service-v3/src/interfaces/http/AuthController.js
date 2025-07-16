/**
 * Auth Controller
 * 
 * Purpose: Handles HTTP API requests for authentication
 */
class AuthController {
  constructor(authenticationService) {
    this.authenticationService = authenticationService;
  }

  async verifyMatricule(req, res) {
    try {
      const { matricule } = req.body;
      const result = await this.authenticationService.authenticateAgent(matricule);
      
      const statusCode = result.success ? 200 : 
        (result.code === 'MATRICULE_NOT_FOUND' ? 404 : 400);
      
      res.status(statusCode).json(result);
    } catch (error) {
      console.error('Error in verifyMatricule:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  async getAgentInfo(req, res) {
    try {
      const { matricule } = req.params;
      const result = await this.authenticationService.getAgentDetails(matricule);
      
      const statusCode = result.success ? 200 : 
        (result.code === 'AGENT_NOT_FOUND' ? 404 : 400);
      
      res.status(statusCode).json(result);
    } catch (error) {
      console.error('Error in getAgentInfo:', error);
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
      service: 'auth-service'
    });
  }
}

module.exports = AuthController;