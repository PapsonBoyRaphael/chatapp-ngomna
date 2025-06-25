class CreateAgentUnitRelationshipUseCase {
  constructor(visibilityRepository) {
    this.visibilityRepository = visibilityRepository;
  }

  async execute(agentMatricule, unitId, rang) {
    await this.visibilityRepository.createAgentUnitRelationship(agentMatricule, unitId, rang);
  }
}

module.exports = CreateAgentUnitRelationshipUseCase;