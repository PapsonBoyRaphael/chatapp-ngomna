class ListCollaboratorsUseCase {
  constructor(visibilityRepository) {
    this.visibilityRepository = visibilityRepository;
  }

  async execute(agentMatricule, unitId, rang) {
    return await this.visibilityRepository.listCollaborators(agentMatricule, unitId, rang);
  }
}

module.exports = ListCollaboratorsUseCase;