const UnitService = require('../../services/UnitService');
const AgentService = require('../../services/AgentService');

class UnitWebController {
  async showSearchUnitPage(req, res) {
    res.render('search-unit', {
      title: 'Search Unit',
      error: null,
      matricule: req.query.matricule
    });
  }

  async showConfirmUnitPage(req, res) {
    const { matricule, unitId } = req.query;
    const session = dbConfig.getDriver().session();
    try {
      const result = await session.run(
        `MATCH (u:Unit {id: $unitId})
         RETURN u.id, u.name, u.acronyme`,
        { unitId }
      );
      if (result.records.length === 0) {
        throw new Error('Unit not found');
      }
      const unit = {
        id: result.records[0].get('u.id'),
        name: result.records[0].get('u.name'),
        acronyme: result.records[0].get('u.acronyme')
      };
      res.render('confirm-unit', {
        title: 'Confirm Unit',
        matricule,
        unit,
        error: null
      });
    } catch (error) {
      res.render('search-unit', {
        title: 'Search Unit',
        error: error.message,
        matricule
      });
    } finally {
      await session.close();
    }
  }

  async processUnitLink(req, res) {
    try {
      const { matricule, unitId } = req.body;
      await UnitService.linkAgentToUnit(matricule, unitId);
      res.redirect(`/collaborators?matricule=${matricule}`);
    } catch (error) {
      res.render('search-unit', {
        title: 'Search Unit',
        error: error.message,
        matricule: req.body.matricule
      });
    }
  }

  async showCollaboratorsPage(req, res) {
    try {
      const { matricule } = req.query;
      const agentInfo = await AgentService.getAgentInfo(matricule);
      if (!agentInfo.success) {
        throw new Error('Failed to fetch agent info');
      }
      const unit = await UnitService.getAgentUnit(matricule);
      const collaborators = await UnitService.getCollaborators(matricule);
      const overseen = await UnitService.getOverseenUnits(matricule);
      const boss = unit ? await UnitService.getUnitBoss(unit.id) : null;
      const supervisingBoss = await UnitService.getSupervisingUnitBoss(matricule);

      res.render('collaborators', {
        title: 'Collaborators',
        matricule,
        agent: agentInfo.agent,
        unit,
        collaborators,
        overseen,
        boss,
        supervisingBoss
      });
    } catch (error) {
      res.render('search-unit', {
        title: 'Search Unit',
        error: error.message,
        matricule: req.query.matricule
      });
    }
  }
}

module.exports = new UnitWebController();