const AuthenticateAgentUseCase = require('../../../application/use-cases/authenticate-agent.use-case');

class AuthController {
  constructor(agentRepository) {
    this.authenticateAgentUseCase = new AuthenticateAgentUseCase(agentRepository);
  }

  async authenticate(req, res) {
    try {
      const { matricule } = req.body;
      console.log(`Authenticating matricule: ${matricule}`);
      const agent = await this.authenticateAgentUseCase.execute(matricule);
      console.log('Agent found:', agent);
      req.session.agent = agent;
      console.log('Session set:', req.session.agent);
      // Force session save before redirect
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.render('auth', { error: 'Session error' });
        }
        console.log('Redirecting to:', process.env.VISIBILITY_SERVICE_URL);
        res.redirect(process.env.VISIBILITY_SERVICE_URL);
      });
    } catch (error) {
      console.error('Authentication error:', error.message);
      res.render('auth', { error: error.message });
    }
  }

  renderAuthPage(req, res) {
    res.render('auth', { error: null });
  }
}

module.exports = AuthController;