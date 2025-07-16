const axios = require('axios');

/**
 * Web Controller for Visibility Service
 * 
 * Purpose: Handles web page requests for testing the visibility service
 */
class WebController {
  constructor(visibilityService) {
    this.visibilityService = visibilityService;
    this.authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
  }

  async showSearchPage(req, res) {
    res.render('search', { 
      title: 'Search Units',
      error: null,
      success: null,
      agent: null
    });
  }

  async processAgentVerification(req, res) {
    try {
      const { matricule } = req.body;
      
      if (!matricule || !matricule.trim()) {
        return res.render('search', {
          title: 'Search Units',
          error: 'Please enter a matricule',
          success: null,
          agent: null
        });
      }

      // Verify agent with auth service
      const authResponse = await axios.post(`${this.authServiceUrl}/api/auth/verify`, {
        matricule: matricule.trim()
      });

      if (!authResponse.data.success) {
        return res.render('search', {
          title: 'Search Units',
          error: authResponse.data.message,
          success: null,
          agent: null
        });
      }

      const agent = authResponse.data.agent;
      
      res.render('search', {
        title: 'Search Units',
        error: null,
        success: 'Agent verified successfully! Now search for your unit.',
        agent: agent
      });
    } catch (error) {
      console.error('Error verifying agent:', error);
      res.render('search', {
        title: 'Search Units',
        error: 'Failed to verify agent. Please try again.',
        success: null,
        agent: null
      });
    }
  }

  async processUnitAttachment(req, res) {
    try {
      const { matricule, unitId, rank } = req.body;
      
      const result = await this.visibilityService.attachAgentToUnit({
        matricule,
        unitId,
        rank
      });

      if (result.success) {
        res.render('attach', {
          title: 'Unit Attachment Successful',
          agent: { matricule, rank },
          unit: result.unit,
          attachmentResult: result
        });
      } else {
        res.render('search', {
          title: 'Search Units',
          error: result.message,
          success: null,
          agent: { matricule, rank }
        });
      }
    } catch (error) {
      console.error('Error attaching agent to unit:', error);
      res.render('search', {
        title: 'Search Units',
        error: 'Failed to attach agent to unit. Please try again.',
        success: null,
        agent: null
      });
    }
  }

  async showCollaborators(req, res) {
    try {
      const { matricule, rank } = req.query;
      
      if (!matricule || !rank) {
        return res.redirect('/');
      }

      const result = await this.visibilityService.getCollaborators(matricule, rank);
      
      res.render('collaborators', {
        title: 'Your Collaborators',
        agent: { matricule, rank },
        collaborators: result.success ? result.collaborators : [],
        agentUnit: result.agentUnit || null,
        error: result.success ? null : result.message
      });
    } catch (error) {
      console.error('Error getting collaborators:', error);
      res.render('collaborators', {
        title: 'Your Collaborators',
        agent: null,
        collaborators: [],
        agentUnit: null,
        error: 'Failed to load collaborators'
      });
    }
  }
}

module.exports = WebController;