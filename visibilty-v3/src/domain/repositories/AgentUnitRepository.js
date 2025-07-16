/**
 * Agent Unit Repository Interface
 */
class AgentUnitRepository {
  async attachAgentToUnit(agentUnit) {
    throw new Error('Method not implemented');
  }

  async detachAgentFromUnit(matricule) {
    throw new Error('Method not implemented');
  }

  async findAgentUnit(matricule) {
    throw new Error('Method not implemented');
  }

  async findAgentsInUnit(unitId) {
    throw new Error('Method not implemented');
  }

  async findAgentsInSubordinateUnits(unitId) {
    throw new Error('Method not implemented');
  }

  async findHighestRankingAgentInUnit(unitId) {
    throw new Error('Method not implemented');
  }

  async searchAgents(query, minRankHierarchy) {
    throw new Error('Method not implemented');
  }
}

module.exports = AgentUnitRepository;