const { StatusCodes } = require('http-status-codes');
const UnitService = require('../services/UnitService');

class UnitController {
  async searchUnits(req, res) {
    const { query } = req.query;
    const units = await UnitService.searchUnits(query || '');
    res.status(StatusCodes.OK).json({ success: true, units });
  }

  async linkAgentToUnit(req, res) {
    const { matricule, unitId } = req.body;
    const result = await UnitService.linkAgentToUnit(matricule, unitId);
    res.status(StatusCodes.OK).json({ success: true, result });
  }

  async getAgentUnit(req, res) {
    const { matricule } = req.params;
    const unit = await UnitService.getAgentUnit(matricule);
    if (!unit) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'Agent not linked to any unit'
      });
    }
    res.status(StatusCodes.OK).json({ success: true, unit });
  }

  async getCollaborators(req, res) {
    const { matricule } = req.query;
    const collaborators = await UnitService.getCollaborators(matricule);
    res.status(StatusCodes.OK).json({ success: true, collaborators });
  }

  async getOverseenUnits(req, res) {
    const { matricule } = req.query;
    const overseen = await UnitService.getOverseenUnits(matricule);
    res.status(StatusCodes.OK).json({ success: true, overseen });
  }

  async getSupervisingUnitBoss(req, res) {
    const { matricule } = req.query;
    const boss = await UnitService.getSupervisingUnitBoss(matricule);
    if (!boss) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'No supervising unit or boss found'
      });
    }
    res.status(StatusCodes.OK).json({ success: true, boss });
  }

  async getUnitBoss(req, res) {
    const { unitId } = req.params;
    const boss = await UnitService.getUnitBoss(unitId);
    if (!boss) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: 'No boss found for this unit'
      });
    }
    res.status(StatusCodes.OK).json({ success: true, boss });
  }
}

module.exports = new UnitController();