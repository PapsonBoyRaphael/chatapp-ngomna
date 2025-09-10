const AgentService = require('../../services/AgentService');

class AgentWebController {
  async showSearchAgentPage(req, res) {
    res.render('search-agent', {
      title: 'Search Agent',
      error: null,
      matricule: req.query.matricule,
      rang: req.query.rang
    });
  }
}

module.exports = new AgentWebController();