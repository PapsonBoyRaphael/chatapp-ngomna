/**
 * Get Agent Info Use Case
 * 
 * Purpose: Retrieve detailed agent information by matricule
 */
class GetAgentInfoUseCase {
  constructor(agentRepository) {
    this.agentRepository = agentRepository;
  }

  async execute(matriculeString) {
    try {
      const matricule = new (require('../../domain/value-objects/Matricule'))(matriculeString);
      const agent = await this.agentRepository.findByMatricule(matricule);
      
      if (!agent) {
        return {
          success: false,
          message: 'Agent not found',
          code: 'AGENT_NOT_FOUND'
        };
      }

      return {
        success: true,
        agent: agent.toJSON(),
        metadata: {
          fullName: agent.getFullName(),
          age: agent.getAge()
        }
      };
    } catch (error) {
      if (error.message.includes('Matricule must be')) {
        return {
          success: false,
          message: error.message,
          code: 'INVALID_MATRICULE_FORMAT'
        };
      }

      console.error('Error in GetAgentInfoUseCase:', error);
      return {
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      };
    }
  }
}

module.exports = GetAgentInfoUseCase;