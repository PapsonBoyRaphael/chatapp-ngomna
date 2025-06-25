class VisibilityRepository {
  async searchUnitsByMinistere(ministere) {
    throw new Error('Method not implemented');
  }

  async createAgentUnitRelationship(agentMatricule, unitId, rang) {
    throw new Error('Method not implemented');
  }

  async listCollaborators(agentMatricule, unitId, rang) {
    throw new Error('Method not implemented');
  }

  async searchAgents(query, minRank) {
    throw new Error('Method not implemented');
  }
}

module.exports = VisibilityRepository;