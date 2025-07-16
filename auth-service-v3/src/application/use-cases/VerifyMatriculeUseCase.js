/**
 * Verify Matricule Use Case
 * 
 * Why use cases?
 * - Encapsulates application-specific business logic
 * - Orchestrates between domain and infrastructure
 * - Makes the application behavior explicit
 * - Easy to test and modify
 */
class VerifyMatriculeUseCase {
  constructor(agentRepository) {
    this.agentRepository = agentRepository;
  }

  async execute(matriculeString) {
    try {
      // Validate matricule format (domain logic)
      const matricule = new (require('../../domain/value-objects/Matricule'))(matriculeString);
      
      // Check if agent exists
      const agent = await this.agentRepository.findByMatricule(matricule);
      
      if (!agent) {
        return {
          success: false,
          message: 'Matricule not found',
          code: 'MATRICULE_NOT_FOUND'
        };
      }

      return {
        success: true,
        message: 'Matricule verified successfully',
        agent: agent.toJSON()
      };
    } catch (error) {
      if (error.message.includes('Matricule must be')) {
        return {
          success: false,
          message: error.message,
          code: 'INVALID_MATRICULE_FORMAT'
        };
      }

      console.error('Error in VerifyMatriculeUseCase:', error);
      return {
        success: false,
        message: 'Internal server error during verification',
        code: 'INTERNAL_ERROR'
      };
    }
  }
}

module.exports = VerifyMatriculeUseCase;