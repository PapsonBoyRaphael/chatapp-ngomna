/**
 * Web Controller
 * 
 * Purpose: Handles web page requests for testing the authentication service
 */
class WebController {
  constructor(authenticationService) {
    this.authenticationService = authenticationService;
  }

  async showVerifyPage(req, res) {
    res.render('verify', { 
      title: 'Verify Matricule',
      error: null,
      success: null 
    });
  }

  async processVerification(req, res) {
    try {
      const { matricule } = req.body;
      
      if (!matricule || !matricule.trim()) {
        return res.render('verify', {
          title: 'Verify Matricule',
          error: 'Please enter a matricule',
          success: null
        });
      }

      const result = await this.authenticationService.authenticateAgent(matricule.trim());
      
      if (result.success) {
        res.render('success', {
          title: 'Verification Success',
          agent: result.agent,
          authenticatedAt: result.authenticatedAt
        });
      } else {
        res.render('verify', {
          title: 'Verify Matricule',
          error: result.message,
          success: null
        });
      }
    } catch (error) {
      console.error('Error in processVerification:', error);
      res.render('verify', {
        title: 'Verify Matricule',
        error: 'An unexpected error occurred. Please try again.',
        success: null
      });
    }
  }
}

module.exports = WebController;