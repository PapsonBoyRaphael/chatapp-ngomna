// src/infrastructure/database/repositories/Neo4jAgentUnitRepository.js
const AgentUnitRepository = require('../../../domain/repositories/AgentUnitRepository');
const AgentUnit = require('../../../domain/entities/AgentUnit');
const CypherSanitizer = require('../../../domain/services/CypherSanitizer');
const RankHierarchyService = require('../../../domain/services/RankHierarchyService');

/**
 * Neo4j Agent Unit Repository Implementation
 */
class Neo4jAgentUnitRepository extends AgentUnitRepository {
  constructor(neo4jConfig) {
    super();
    this.neo4j = neo4jConfig;
  }

  async attachAgentToUnit(agentUnit) {
    const query = `
      // First, detach agent from any existing unit
      MATCH (agent:Agent {matricule: $matricule})
      OPTIONAL MATCH (agent)-[oldRel]->(oldUnit:Unit)
      DELETE oldRel
      
      // Then create new relationship
      WITH agent
      MATCH (unit:Unit {id: $unitId})
      MERGE (unit)<-[rel:${agentUnit.rank.sanitized} {
        rank: $originalRank,
        attachedAt: $attachedAt
      }]-(agent)
      
      RETURN rel, unit, agent
    `;

    try {
      const records = await this.neo4j.executeQuery(query, {
        matricule: agentUnit.matricule,
        unitId: agentUnit.unitId,
        originalRank: CypherSanitizer.sanitizeForRelationshipProperty(agentUnit.rank.name),
        attachedAt: agentUnit.attachedAt.toISOString()
      });

      if (records.length === 0) {
        throw new Error('Failed to create agent-unit relationship');
      }

      return agentUnit;
    } catch (error) {
      console.error('Error attaching agent to unit:', error);
      throw new Error('Failed to attach agent to unit');
    }
  }

  async detachAgentFromUnit(matricule) {
    const query = `
      MATCH (agent:Agent {matricule: $matricule})-[rel]->(unit:Unit)
      DELETE rel
      RETURN COUNT(rel) as deletedCount
    `;

    try {
      const records = await this.neo4j.executeQuery(query, { matricule });
      const deletedCount = records[0]?.get('deletedCount') || 0;
      return deletedCount > 0;
    } catch (error) {
      console.error('Error detaching agent from unit:', error);
      throw new Error('Failed to detach agent from unit');
    }
  }

  async findAgentUnit(matricule) {
    const query = `
      MATCH (agent:Agent {matricule: $matricule})-[rel]->(unit:Unit)
      RETURN agent, rel, unit
    `;

    try {
      const records = await this.neo4j.executeQuery(query, { matricule });
      
      if (records.length === 0) {
        return null;
      }

      const record = records[0];
      const rel = record.get('rel');
      const unit = record.get('unit');

      return new AgentUnit({
        matricule: matricule,
        unitId: unit.properties.id,
        rank: rel.properties.rank,
        attachedAt: new Date(rel.properties.attachedAt)
      });
    } catch (error) {
      console.error('Error finding agent unit:', error);
      throw new Error('Failed to find agent unit');
    }
  }

  async findAgentsInUnit(unitId) {
    const query = `
      MATCH (unit:Unit {id: $unitId})<-[rel]-(agent:Agent)
      RETURN agent, rel, unit
      ORDER BY rel.rank
    `;

    try {
      const records = await this.neo4j.executeQuery(query, { unitId });
      
      return records.map(record => {
        const agent = record.get('agent');
        const rel = record.get('rel');
        
        return {
          matricule: agent.properties.matricule,
          rank: rel.properties.rank,
          relationshipType: rel.type,
          attachedAt: rel.properties.attachedAt
        };
      });
    } catch (error) {
      console.error('Error finding agents in unit:', error);
      throw new Error('Failed to find agents in unit');
    }
  }

  async findAgentsInSubordinateUnits(unitId) {
    const query = `
      MATCH (parentUnit:Unit {id: $unitId})-[:OVERSEES*1..]->(subordinateUnit:Unit)<-[rel]-(agent:Agent)
      RETURN agent, rel, subordinateUnit
      ORDER BY subordinateUnit.name, rel.rank
    `;

    try {
      const records = await this.neo4j.executeQuery(query, { unitId });
      
      return records.map(record => {
        const agent = record.get('agent');
        const rel = record.get('rel');
        const unit = record.get('subordinateUnit');
        
        return {
          matricule: agent.properties.matricule,
          rank: rel.properties.rank,
          relationshipType: rel.type,
          unitId: unit.properties.id,
          unitName: unit.properties.name,
          attachedAt: rel.properties.attachedAt
        };
      });
    } catch (error) {
      console.error('Error finding agents in subordinate units:', error);
      throw new Error('Failed to find agents in subordinate units');
    }
  }

  async findHighestRankingAgentInUnit(unitId) {
    const query = `
      MATCH (unit:Unit {id: $unitId})<-[rel]-(agent:Agent)
      RETURN agent, rel
      ORDER BY rel.rank DESC
      LIMIT 1
    `;

    try {
      const records = await this.neo4j.executeQuery(query, { unitId });
      
      if (records.length === 0) {
        return null;
      }

      const record = records[0];
      const agent = record.get('agent');
      const rel = record.get('rel');
      
      return {
        matricule: agent.properties.matricule,
        rank: rel.properties.rank,
        relationshipType: rel.type,
        attachedAt: rel.properties.attachedAt
      };
    } catch (error) {
      console.error('Error finding highest ranking agent:', error);
      throw new Error('Failed to find highest ranking agent');
    }
  }

  async searchAgents(query, minRankHierarchy) {
    const cypherQuery = `
      MATCH (agent:Agent)-[rel]->(unit:Unit)
      WHERE agent.matricule CONTAINS $query 
         OR toLower(agent.nom) CONTAINS toLower($query)
         OR toLower(agent.prenom) CONTAINS toLower($query)
      RETURN agent, rel, unit
      ORDER BY rel.rank DESC, agent.nom, agent.prenom
      LIMIT 50
    `;

    try {
      const records = await this.neo4j.executeQuery(cypherQuery, { query });
      
      const results = records.map(record => {
        const agent = record.get('agent');
        const rel = record.get('rel');
        const unit = record.get('unit');
        
        return {
          matricule: agent.properties.matricule,
          rank: rel.properties.rank,
          relationshipType: rel.type,
          unitId: unit.properties.id,
          unitName: unit.properties.name,
          attachedAt: rel.properties.attachedAt
        };
      });

      // Filter by rank hierarchy (domain logic)
      return results.filter(agent => {
        return RankHierarchyService.canViewAgent('PRESIDENT', agent.rank); // Temp: allow all for search
      });
    } catch (error) {
      console.error('Error searching agents:', error);
      throw new Error('Failed to search agents');
    }
  }
}

module.exports = Neo4jAgentUnitRepository;