const RankHierarchyService = require('../../domain/services/RankHierarchyService');

/**
 * Search Agents Use Case
 * 
 * Purpose: Search for agents with rank >= current agent's rank
 */
class SearchAgentsUseCase {
  constructor(agentUnitRepository) {
    this.agentUnitRepository = agentUnitRepository;
  }

  async execute(searchQuery, currentAgentRank) {
    try {
      if (!searchQuery || searchQuery.trim().length < 2) {
        return {
          success: false,
          message: 'Search query must be at least 2 characters',
          code: 'INVALID_SEARCH_QUERY'
        };
      }

      if (!currentAgentRank) {
        return {
          success: false,
          message: 'Current agent rank is required',
          code: 'RANK_REQUIRED'
        };
      }

      // Get visibility scope for current agent
      const visibilityScope = RankHierarchyService.getVisibilityScope(currentAgentRank);

      // Search agents
      const searchResults = await this.agentUnitRepository.searchAgents(
        searchQuery.trim(),
        visibilityScope.searchableRankThreshold
      );

      // Filter by rank visibility rules
      const visibleAgents = searchResults.filter(agent => 
        RankHierarchyService.canViewAgent(currentAgentRank, agent.rank)
      );

      // Sort by rank hierarchy
      const sortedResults = RankHierarchyService.sortAgentsByRank(visibleAgents);

      return {
        success: true,
        agents: sortedResults,
        total: sortedResults.length,
        searchQuery: searchQuery.trim(),
        visibilityScope
      };
    } catch (error) {
      console.error('Error in SearchAgentsUseCase:', error);
      return {
        success: false,
        message: 'Failed to search agents',
        code: 'SEARCH_AGENTS_ERROR'
      };
    }
  }
}

module.exports = SearchAgentsUseCase;