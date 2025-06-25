class AuthenticateAgentUseCase {
  constructor(agentRepository) {
    this.agentRepository = agentRepository;
  }

  async execute(matricule) {
    const agent = await this.agentRepository.findByMatricule(matricule);
    if (!agent) {
      throw new Error('Agent not found');
    }
    return agent;
  }
}

module.exports = AuthenticateAgentUseCase;