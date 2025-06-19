const driver = require('../database/neo4jDriver');

class Neo4jRepository {
  async getSession() {
    return driver.session();
  }

  async searchUnits(query, topUnitId = 'minesup') {
    const session = await this.getSession();
    try {
      const result = await session.run(
        `MATCH (top:Unit {id: $topUnitId})<-[:OVERSEES*0..]-(unit:Unit)
         WHERE toLower(unit.name) CONTAINS toLower($query)
         RETURN unit.id, unit.name, unit.acronyme
         ORDER BY unit.name
         LIMIT 10`,
        { query, topUnitId }
      );
      return result.records.map(record => ({
        id: record.get('unit.id'),
        name: record.get('unit.name'),
        acronyme: record.get('unit.acronyme'),
      }));
    } finally {
      await session.close();
    }
  }

  async updateAgentUnit(matricule, unitId, role) {
    const session = await this.getSession();
    try {
      // Delete existing relationship
      await session.run(
        `MATCH (agent:Agent {matricule: $matricule})-[rel]->(:Unit)
         DELETE rel`,
        { matricule }
      );
      // Create new relationship
      const result = await session.run(
        `MATCH (agent:Agent {matricule: $matricule}), (unit:Unit {id: $unitId})
         MERGE (agent)-[rel:${role}]->(unit)
         RETURN agent, unit, type(rel) AS role`,
        { matricule, unitId, role }
      );
      if (result.records.length === 0) {
        throw new Error('Agent or unit not found');
      }
      return {
        agent: result.records[0].get('agent').properties,
        unit: result.records[0].get('unit').properties,
        role: result.records[0].get('role'),
      };
    } finally {
      await session.close();
    }
  }
}

module.exports = new Neo4jRepository();