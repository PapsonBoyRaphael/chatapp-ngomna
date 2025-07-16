const neo4j = require('neo4j-driver');
const Agent = require('../../../domain/entities/agent.entity');
const Unit = require('../../../domain/entities/unit.entity');
const VisibilityRepository = require('../../../domain/repositories/visibility.repository');
const config = require('../../../../config/env');
const { ROLE_HIERARCHY } = require('../../../domain/constants/role-hierarchy');

class VisibilityNeo4jRepository extends VisibilityRepository {
  constructor() {
    super();
    this.driver = neo4j.driver(config.neo4j.uri, neo4j.auth.basic(config.neo4j.user, config.neo4j.password));
  }

  normalizeRang(rang) {
    return rang
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['\s]/g, '_')
      .toUpperCase();
  }

  async searchUnitsByMinistere(ministere) {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (u:Unit)
        WHERE u.name = $ministere OR (u)-[:REPORTS_TO*]->(:Unit {name: $ministere})
        RETURN u.id, u.name, u.acronyme
        `,
        { ministere }
      );
      return result.records.map(record => new Unit({
        id: record.get('u.id'),
        name: record.get('u.name'),
        acronyme: record.get('u.acronyme'),
      }));
    } finally {
      await session.close();
    }
  }

  async createAgentUnitRelationship(agentMatricule, unitId, rang) {
    const session = this.driver.session();
    try {
      const normalizedRang = this.normalizeRang(rang);
      await session.run(
        `
        MATCH (a:Agent {matricule: $agentMatricule})
        OPTIONAL MATCH (a)-[r]->(:Unit)
        DELETE r
        WITH a
        MATCH (u:Unit {id: $unitId})
        MERGE (a)-[:${normalizedRang}]->(u)
        `,
        { agentMatricule, unitId }
      );
    } finally {
      await session.close();
    }
  }

  async listCollaborators(agentMatricule, unitId, rang) {
    const session = this.driver.session();
    try {
      const agentRank = ROLE_HIERARCHY[rang] || 1;
      const collaborators = [];

      // Get agents in the same unit
      let result = await session.run(
        `
        MATCH (u:Unit {id: $unitId})<-[:*]-(a:Agent)
        WHERE a.matricule <> $agentMatricule
        RETURN a.matricule, a.nom, a.prenom, labels(a)[1] AS rang, u.name
        `,
        { unitId, agentMatricule }
      );
      collaborators.push(...result.records.map(record => ({
        agent: new Agent({
          matricule: record.get('a.matricule'),
          nom: record.get('a.nom') || '',
          prenom: record.get('a.prenom') || '',
          rang: record.get('rang'),
        }),
        unitName: record.get('u.name'),
        rankValue: ROLE_HIERARCHY[record.get('rang')] || 1,
      })));

      // Check if the agent is the highest-ranking in the unit
      const maxRank = Math.max(...collaborators.map(c => c.rankValue), agentRank);
      const isHighestRank = agentRank >= maxRank;

      if (isHighestRank) {
        // Get agents in overseen units
        result = await session.run(
          `
          MATCH (u:Unit {id: $unitId})-[:OVERSEES*]->(sub:Unit)<-[:*]-(a:Agent)
          RETURN a.matricule, a.nom, a.prenom, labels(a)[1] AS rang, sub.name
          `,
          { unitId }
        );
        collaborators.push(...result.records.map(record => ({
          agent: new Agent({
            matricule: record.get('a.matricule'),
            nom: record.get('a.nom') || '',
            prenom: record.get('a.prenom') || '',
            rang: record.get('rang'),
          }),
          unitName: record.get('sub.name'),
          rankValue: ROLE_HIERARCHY[record.get('rang')] || 1,
        })));

        // Get highest-ranking agent in the overseer unit
        result = await session.run(
          `
          MATCH (u:Unit {id: $unitId})-[:REPORTS_TO]->(parent:Unit)<-[:*]-(a:Agent)
          RETURN a.matricule, a.nom, a.prenom, labels(a)[1] AS rang, parent.name
          ORDER BY $roleHierarchy[labels(a)[1]] DESC
          LIMIT 1
          `,
          { unitId, roleHierarchy: ROLE_HIERARCHY }
        );
        if (result.records.length > 0) {
          const record = result.records[0];
          collaborators.push({
            agent: new Agent({
              matricule: record.get('a.matricule'),
              nom: record.get('a.nom') || '',
              prenom: record.get('a.prenom') || '',
              rang: record.get('rang'),
            }),
            unitName: record.get('parent.name'),
            rankValue: ROLE_HIERARCHY[record.get('rang')] || 1,
          });
        }
      }

      return collaborators;
    } finally {
      await session.close();
    }
  }

  async searchAgents(query, minRank) {
    const session = this.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (a:Agent)
        WHERE (toLower(a.nom) CONTAINS toLower($query) OR toLower(a.prenom) CONTAINS toLower($query))
        AND $roleHierarchy[labels(a)[1]] >= $minRank
        MATCH (u:Unit)<-[:*]-(a)
        RETURN a.matricule, a.nom, a.prenom, labels(a)[1] AS rang, u.name
        `,
        { query, minRank, roleHierarchy: ROLE_HIERARCHY }
      );
      return result.records.map(record => ({
        agent: new Agent({
          matricule: record.get('a.matricule'),
          nom: record.get('a.nom') || '',
          prenom: record.get('a.prenom') || '',
          rang: record.get('rang'),
        }),
        unitName: record.get('u.name'),
      }));
    } finally {
      await session.close();
    }
  }

  async close() {
    await this.driver.close();
  }
}

module.exports = VisibilityNeo4jRepository;