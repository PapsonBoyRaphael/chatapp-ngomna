/**
 * Visibility Service
 * 
 * Purpose: Orchestrates visibility-related operations
 */
class VisibilityService {
  constructor(searchUnitsUseCase, attachAgentToUnitUseCase, getCollaboratorsUseCase, searchAgentsUseCase) {
    this.searchUnitsUseCase = searchUnitsUseCase;
    this.attachAgentToUnitUseCase = attachAgentToUnitUseCase;
    this.getCollaboratorsUseCase = getCollaboratorsUseCase;
    this.searchAgentsUseCase = searchAgentsUseCase;
  }

  async searchUnits(ministryName, searchQuery) {
    return await this.searchUnitsUseCase.execute(ministryName, searchQuery);
  }

  async getUnitSuggestions(ministryName, query) {
    return await this.searchUnitsUseCase.executeAutocomplete(ministryName, query);
  }

  async attachAgentToUnit(agentData) {
    return await this.attachAgentToUnitUseCase.execute(agentData);
  }

  async getCollaborators(matricule, agentRank) {
    return await this.getCollaboratorsUseCase.execute(matricule, agentRank);
  }

  async searchAgents(searchQuery, currentAgentRank) {
    return await this.searchAgentsUseCase.execute(searchQuery, currentAgentRank);
  }
}

module.exports = VisibilityService;