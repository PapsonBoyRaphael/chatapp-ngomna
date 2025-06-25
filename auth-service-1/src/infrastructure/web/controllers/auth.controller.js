const AuthenticateAgentUseCase = require('../../../application/use-cases/authenticate-agent.use-case');

class AuthController {
  constructor(agentRepository) {
    this.authenticateAgentUseCase = new AuthenticateAgentUseCase(agentRepository);
  }

  async authenticate(req, res) {
    try {
      const { matricule } = req.body;
      const agent = await this.authenticateAgentUseCase.execute(matricule);
      req.session.agent = agent; // Store agent in session
      res.redirect(process.env.VISIBILITY_SERVICE_URL);
    } catch (error) {
      res.render('auth', { error: error.message });
    }
  }

  renderAuthPage(req, res) {
    res.render('auth', { error: null });
  }
}

module.exports = AuthController;