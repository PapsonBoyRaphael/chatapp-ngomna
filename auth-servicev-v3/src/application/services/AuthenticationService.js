/**
 * Authentication Service
 * 
 * Purpose: Orchestrates authentication-related operations
 */
class AuthenticationService {
  constructor(verifyMatriculeUseCase, getAgentInfoUseCase) {
    this.verifyMatriculeUseCase = verifyMatriculeUseCase;
    this.getAgentInfoUseCase = getAgentInfoUseCase;
  }

  async authenticateAgent(matricule) {
    const verificationResult = await this.verifyMatriculeUseCase.execute(matricule);
    
    if (!verificationResult.success) {
      return verificationResult;
    }

    // Add authentication timestamp
    return {
      ...verificationResult,
      authenticatedAt: new Date().toISOString()
    };
  }

  async getAgentDetails(matricule) {
    return await this.getAgentInfoUseCase.execute(matricule);
  }
}

module.exports = AuthenticationService;