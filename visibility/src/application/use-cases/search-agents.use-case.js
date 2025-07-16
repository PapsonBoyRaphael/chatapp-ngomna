class SearchAgentsUseCase {
  constructor(visibilityRepository) {
    this.visibilityRepository = visibilityRepository;
  }

  async execute(query, minRank) {
    return await this.visibilityRepository.searchAgents(query, minRank);
  }
}

module.exports = SearchAgentsUseCase;