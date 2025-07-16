const RankHierarchyService = require('../../domain/services/RankHierarchyService');

/**
 * Get Collaborators Use Case
 * 
 * Purpose: Get agents that the current agent can communicate with based on hierarchy rules
 */
class GetCollaboratorsUseCase {
  constructor(agentUnitRepository, unitRepository) {
    this.agentUnitRepository = agentUnitRepository;
    this.unitRepository = unitRepository;
  }

  async execute(matricule, agentRank) {
    try {
      if (!matricule || !agentRank) {
        return {
          success: false,
          message: 'Matricule and rank are required',
          code: 'MISSING_REQUIRED_FIELDS'
        };
      }

      // Find agent's current unit
      const agentUnit = await this.agentUnitRepository.findAgentUnit(matricule);
      if (!agentUnit) {
        return {
          success: false,
          message: 'Agent not attached to any unit',
          code: 'AGENT_NOT_ATTACHED'
        };
      }

      const collaborators = [];

      // 1. Get collaborators in the same unit
      const sameUnitAgents = await this.agentUnitRepository.findAgentsInUnit(agentUnit.unitId);
      const filteredSameUnit = sameUnitAgents.filter(agent => agent.matricule !== matricule);
      
      collaborators.push(...filteredSameUnit.map(agent => ({
        ...agent,
        relationship: 'collaborator',
        unitName: 'Same Unit'
      })));

      // 2. If agent has sufficient rank, get agents in subordinate units
      const visibilityScope = RankHierarchyService.getVisibilityScope(agentRank);
      if (visibilityScope.canViewSubordinateUnits) {
        const subordinateAgents = await this.agentUnitRepository.findAgentsInSubordinateUnits(agentUnit.unitId);
        
        collaborators.push(...subordinateAgents.map(agent => ({
          ...agent,
          relationship: 'subordinate'
        })));
      }

      // 3. If agent is highest ranking in unit, get boss of parent unit
      const unitAgentRanks = sameUnitAgents.map(agent => agent.rank);
      const isHighestInUnit = RankHierarchyService.isHighestRankInUnit(agentRank, unitAgentRanks);
      
      if (isHighestInUnit) {
        const parentUnit = await this.unitRepository.getParentUnit(agentUnit.unitId);
        if (parentUnit) {
          const parentBoss = await this.agentUnitRepository.findHighestRankingAgentInUnit(parentUnit.id);
          if (parentBoss) {
            collaborators.push({
              ...parentBoss,
              relationship: 'superior',
              unitName: parentUnit.name
            });
          }
        }
      }

      // Sort collaborators by rank hierarchy
      const sortedCollaborators = RankHierarchyService.sortAgentsByRank(collaborators);

      return {
        success: true,
        collaborators: sortedCollaborators,
        total: sortedCollaborators.length,
        agentUnit: agentUnit.toJSON(),
        visibilityScope
      };
    } catch (error) {
      console.error('Error in GetCollaboratorsUseCase:', error);
      return {
        success: false,
        message: 'Failed to get collaborators',
        code: 'GET_COLLABORATORS_ERROR'
      };
    }
  }
}

module.exports = GetCollaboratorsUseCase;