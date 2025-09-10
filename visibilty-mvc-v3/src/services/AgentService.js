const axios = require('axios');
const logger = require('../utils/logger');
const { ROLE_HIERARCHY, ROLE_EQUIVALENCIES } = require('../utils/constants');

class AgentService {
  async getAgentInfo(matricule) {
    try {
      const response = await axios.get(
        `${process.env.AUTH_SERVICE_URL}/api/auth/info/${matricule}`,
        { timeout: 5000 }
      );
      return response.data;
    } catch (error) {
      logger.error('Error fetching agent info from auth service:', error);
      throw new Error('Failed to fetch agent info');
    }
  }

  async searchAgents(query, currentAgentRang, currentAgentMatricule) {
    const session = dbConfig.getDriver().session();
    try {
      const currentRankValue = ROLE_HIERARCHY[currentAgentRang] || 1;
      
      const result = await session.run(
        `MATCH (a:Agent)
         WHERE toLower(a.matricule) CONTAINS toLower($query)
         OR toLower(a.rang) CONTAINS toLower($query)
         RETURN a.matricule, a.rang
         ORDER BY a.rang DESC`,
        { query }
      );

      const agents = result.records.map(record => ({
        matricule: record.get('a.matricule'),
        rang: record.get('a.rang')
      }));

      // Filter based on role hierarchy
      return agents.filter(agent => {
        const agentRankValue = ROLE_HIERARCHY[agent.rang] || 1;
        return agentRankValue <= currentRankValue && agent.matricule !== currentAgentMatricule;
      });
    } catch (error) {
      logger.error('Error searching agents:', error);
      throw new Error('Failed to search agents');
    } finally {
      await session.close();
    }
  }
}

module.exports = new AgentService();