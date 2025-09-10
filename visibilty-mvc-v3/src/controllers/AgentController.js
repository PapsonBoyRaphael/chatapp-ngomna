const { StatusCodes } = require('http-status-codes');
const AgentService = require('../services/AgentService');

class AgentController {
  async searchAgents(req, res) {
    const { query, currentAgentRang, currentAgentMatricule } = req.query;
    const agents = await AgentService.searchAgents(query || '', currentAgentRang, currentAgentMatricule);
    res.status(StatusCodes.OK).json({ success: true, agents });
  }
}

module.exports = new AgentController();