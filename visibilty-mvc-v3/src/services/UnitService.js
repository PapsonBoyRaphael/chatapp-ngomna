const neo4j = require('neo4j-driver');
const dbConfig = require('../config/database');
const logger = require('../utils/logger');
const { ROLE_HIERARCHY } = require('../utils/constants');
const AgentService = require('./AgentService');

class UnitService {
  async searchUnits(query, limit = 10) {
    const session = dbConfig.getDriver().session();
    try {
      const result = await session.run(
        `MATCH (u:Unit)
         WHERE toLower(u.name) CONTAINS toLower($query)
         RETURN u.id, u.name, u.acronyme
         ORDER BY u.name
         LIMIT $limit`,
        { query, limit: neo4j.int(limit) }
      );
      return result.records.map(record => ({
        id: record.get('u.id'),
        name: record.get('u.name'),
        acronyme: record.get('u.acronyme')
      }));
    } catch (error) {
      logger.error('Error searching units:', error);
      throw new Error('Failed to search units');
    } finally {
      await session.close();
    }
  }

  async linkAgentToUnit(matricule, unitId) {
    const session = dbConfig.getDriver().session();
    try {
      // Fetch agent info to get sanitized rang
      const agentInfo = await AgentService.getAgentInfo(matricule);
      if (!agentInfo.success) {
        throw new Error('Agent not found');
      }
      const sanitizedRang = agentInfo.agent.sanitizedRang;

      // Remove existing unit relationships
      await session.run(
        `MATCH (a:Agent {matricule: $matricule})-[r:BELONGS_TO]->(:Unit)
         DELETE r`,
        { matricule }
      );

      // Ensure agent node exists
      await session.run(
        `MERGE (a:Agent {matricule: $matricule})`,
        { matricule }
      );

      // Create new relationship with rang property
      const result = await session.run(
        `MATCH (a:Agent {matricule: $matricule}), (u:Unit {id: $unitId})
         MERGE (a)-[r:BELONGS_TO {rang: $rang}]->(u)
         RETURN u.id, u.name`,
        { matricule, unitId, rang: sanitizedRang }
      );

      if (result.records.length === 0) {
        throw new Error('Unit not found or link creation failed');
      }

      return {
        unitId: result.records[0].get('u.id'),
        unitName: result.records[0].get('u.name')
      };
    } catch (error) {
      logger.error('Error linking agent to unit:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  async getAgentUnit(matricule) {
    const session = dbConfig.getDriver().session();
    try {
      const result = await session.run(
        `MATCH (a:Agent {matricule: $matricule})-[r:BELONGS_TO]->(u:Unit)
         RETURN u.id, u.name, u.acronyme, r.rang`,
        { matricule }
      );

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      return {
        id: record.get('u.id'),
        name: record.get('u.name'),
        acronyme: record.get('u.acronyme'),
        rang: record.get('r.rang')
      };
    } catch (error) {
      logger.error('Error getting agent unit:', error);
      throw new Error('Failed to get agent unit');
    } finally {
      await session.close();
    }
  }

  async getCollaborators(matricule) {
    const session = dbConfig.getDriver().session();
    try {
      const result = await session.run(
        `MATCH (a:Agent {matricule: $matricule})-[r1:BELONGS_TO]->(u:Unit)
         MATCH (other:Agent)-[r2:BELONGS_TO]->(u)
         WHERE other.matricule <> $matricule
         RETURN other.matricule, r2.rang, u.name`,
        { matricule }
      );

      return result.records.map(record => ({
        matricule: record.get('other.matricule'),
        rang: record.get('r2.rang'),
        unitName: record.get('u.name')
      }));
    } catch (error) {
      logger.error('Error getting collaborators:', error);
      throw new Error('Failed to get collaborators');
    } finally {
      await session.close();
    }
  }

  async getOverseenUnits(matricule) {
    const session = dbConfig.getDriver().session();
    try {
      const result = await session.run(
        `MATCH (a:Agent {matricule: $matricule})-[r1:BELONGS_TO]->(u:Unit)
         MATCH (u)-[:OVERSEES*1..]->(subUnit:Unit)
         MATCH (subAgent:Agent)-[r2:BELONGS_TO]->(subUnit)
         RETURN subAgent.matricule, r2.rang, subUnit.name
         ORDER BY subUnit.name, r2.rang DESC`,
        { matricule }
      );

      return result.records.map(record => ({
        matricule: record.get('subAgent.matricule'),
        rang: record.get('r2.rang'),
        unitName: record.get('subUnit.name')
      }));
    } catch (error) {
      logger.error('Error getting overseen units:', error);
      throw new Error('Failed to get overseen units');
    } finally {
      await session.close();
    }
  }

  async getSupervisingUnitBoss(matricule) {
    const session = dbConfig.getDriver().session();
    try {
      const result = await session.run(
        `MATCH (a:Agent {matricule: $matricule})-[r1:BELONGS_TO]->(u:Unit)
         MATCH (u)-[:REPORTS_TO]->(parent:Unit)
         MATCH (boss:Agent)-[r2:BELONGS_TO]->(parent)
         RETURN boss.matricule, r2.rang, parent.name
         ORDER BY $hierarchy[r2.rang] DESC
         LIMIT 1`,
        { matricule, hierarchy: ROLE_HIERARCHY }
      );

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      return {
        matricule: record.get('boss.matricule'),
        rang: record.get('r2.rang'),
        unitName: record.get('parent.name')
      };
    } catch (error) {
      logger.error('Error getting supervising unit boss:', error);
      throw new Error('Failed to get supervising unit boss');
    } finally {
      await session.close();
    }
  }

  async getUnitBoss(unitId) {
    const session = dbConfig.getDriver().session();
    try {
      const result = await session.run(
        `MATCH (a:Agent)-[r:BELONGS_TO]->(u:Unit {id: $unitId})
         RETURN a.matricule, r.rang
         ORDER BY $hierarchy[r.rang] DESC
         LIMIT 1`,
        { unitId, hierarchy: ROLE_HIERARCHY }
      );

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      return {
        matricule: record.get('a.matricule'),
        rang: record.get('r.rang')
      };
    } catch (error) {
      logger.error('Error getting unit boss:', error);
      throw new Error('Failed to get unit boss');
    } finally {
      await session.close();
    }
  }
}

module.exports = new UnitService();