const AgentUnit = require('../../domain/entities/AgentUnit');

/**
 * Attach Agent to Unit Use Case
 * 
 * Purpose: Create or update the relationship between an agent and a unit
 */
class AttachAgentToUnitUseCase {
  constructor(agentUnitRepository, unitRepository) {
    this.agentUnitRepository = agentUnitRepository;
    this.unitRepository = unitRepository;
  }

  async execute(agentData) {
    try {
      const { matricule, unitId, rank } = agentData;

      // Validate inputs
      if (!matricule || !unitId || !rank) {
        return {
          success: false,
          message: 'Matricule, unit ID, and rank are required',
          code: 'MISSING_REQUIRED_FIELDS'
        };
      }

      // Verify unit exists
      const unit = await this.unitRepository.findById(unitId);
      if (!unit) {
        return {
          success: false,
          message: 'Unit not found',
          code: 'UNIT_NOT_FOUND'
        };
      }

      // Create agent-unit relationship
      const agentUnit = new AgentUnit({
        matricule,
        unitId,
        rank
      });

      // Attach to unit (this will detach from previous unit if exists)
      const result = await this.agentUnitRepository.attachAgentToUnit(agentUnit);

      return {
        success: true,
        message: 'Agent successfully attached to unit',
        agentUnit: result.toJSON(),
        unit: unit.toJSON()
      };
    } catch (error) {
      console.error('Error in AttachAgentToUnitUseCase:', error);
      
      if (error.message.includes('Invalid matricule format')) {
        return {
          success: false,
          message: error.message,
          code: 'INVALID_MATRICULE'
        };
      }

      return {
        success: false,
        message: 'Failed to attach agent to unit',
        code: 'ATTACHMENT_ERROR'
      };
    }
  }
}

module.exports = AttachAgentToUnitUseCase;