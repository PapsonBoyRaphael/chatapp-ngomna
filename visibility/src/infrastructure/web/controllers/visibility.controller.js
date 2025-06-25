const SearchUnitsUseCase = require('../../../application/use-cases/search-units.use-case');
const CreateAgentUnitRelationshipUseCase = require('../../../application/use-cases/create-agent-unit-relationship.use-case');
const ListCollaboratorsUseCase = require('../../../application/use-cases/list-collaborators.use-case');
const SearchAgentsUseCase = require('../../../application/use-cases/search-agents.use-case');
const { ROLE_HIERARCHY } = require('../../../domain/constants/role-hierarchy');

class VisibilityController {
  constructor(visibilityRepository) {
    this.searchUnitsUseCase = new SearchUnitsUseCase(visibilityRepository);
    this.createAgentUnitRelationshipUseCase = new CreateAgentUnitRelationshipUseCase(visibilityRepository);
    this.listCollaboratorsUseCase = new ListCollaboratorsUseCase(visibilityRepository);
    this.searchAgentsUseCase = new SearchAgentsUseCase(visibilityRepository);
  }

  async renderUnitSelection(req, res) {
    if (!req.session.agent) {
      return res.redirect(process.env.AUTH_SERVICE_URL);
    }
    try {
      const units = await this.searchUnitsUseCase.execute(req.session.agent.ministere);
      if (units.length === 0) {
        return res.render('error', { message: 'No units found for your ministere' });
      }
      res.render('unit-selection', { units, agent: req.session.agent });
    } catch (error) {
      res.render('error', { message: error.message });
    }
  }

  async validateUnit(req, res) {
    if (!req.session.agent) {
      return res.redirect(process.env.AUTH_SERVICE_URL);
    }
    try {
      const { unitId } = req.body;
      await this.createAgentUnitRelationshipUseCase.execute(
        req.session.agent.matricule,
        unitId,
        req.session.agent.rang
      );
      res.redirect('/collaborators');
    } catch (error) {
      res.render('error', { message: error.message });
    }
  }

  async renderCollaborators(req, res) {
    if (!req.session.agent) {
      return res.redirect(process.env.AUTH_SERVICE_URL);
    }
    try {
      const unitResult = await this.listCollaboratorsUseCase.execute(
        req.session.agent.matricule,
        req.body.unitId || (await this.getAgentUnit(req.session.agent.matricule)),
        req.session.agent.rang
      );
      res.render('collaborators', { collaborators: unitResult, agent: req.session.agent });
    } catch (error) {
      res.render('error', { message: error.message });
    }
  }

  async searchAgents(req, res) {
    if (!req.session.agent) {
      return res.redirect(process.env.AUTH_SERVICE_URL);
    }
    try {
      const { query } = req.body;
      const minRank = ROLE_HIERARCHY[req.session.agent.rang] || 1;
      const agents = await this.searchAgentsUseCase.execute(query, minRank);
      res.render('collaborators', { collaborators: agents, agent: req.session.agent, searchQuery: query });
    } catch (error) {
      res.render('error', { message: error.message });
    }
  }

  async getAgentUnit(matricule) {
    const session = this.searchUnitsUseCase.visibilityRepository.driver.session();
    try {
      const result = await session.run(
        `
        MATCH (a:Agent {matricule: $matricule})-[:*]->(u:Unit)
        RETURN u.id
        LIMIT 1
        `,
        { matricule }
      );
      return result.records.length > 0 ? result.records[0].get('u.id') : null;
    } finally {
      await session.close();
    }
  }
}

module.exports = VisibilityController;