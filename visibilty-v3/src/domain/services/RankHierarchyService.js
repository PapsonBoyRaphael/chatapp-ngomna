const Rank = require('../value-objects/Rank');

/**
 * Rank Hierarchy Service
 * 
 * Purpose: Handles complex hierarchy logic and visibility rules
 *
 */
class RankHierarchyService {
  static canViewAgent(viewerRank, targetRank) {
    const viewer = new Rank(viewerRank);
    const target = new Rank(targetRank);
    
    // Can view agents with equal or lower rank
    return viewer.isHigherOrEqualTo(target);
  }

  static isHighestRankInUnit(agentRank, unitAgentRanks) {
    const agent = new Rank(agentRank);
    
    for (const otherRank of unitAgentRanks) {
      const other = new Rank(otherRank);
      if (other.isHigherThan(agent)) {
        return false;
      }
    }
    
    return true;
  }

  static getVisibilityScope(agentRank) {
    const rank = new Rank(agentRank);
    
    return {
      canViewSameUnit: true,
      canViewSubordinateUnits: rank.hierarchy >= 3, // Chef de service and above
      canViewParentUnitBoss: true, // If highest in current unit
      searchableRankThreshold: rank.hierarchy
    };
  }

  static sortAgentsByRank(agents) {
    return agents.sort((a, b) => {
      const rankA = new Rank(a.rank || a.rang);
      const rankB = new Rank(b.rank || b.rang);
      return rankB.hierarchy - rankA.hierarchy; // Highest rank first
    });
  }
}

module.exports = RankHierarchyService;