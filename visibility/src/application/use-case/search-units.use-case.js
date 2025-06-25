class SearchUnitsUseCase {
  constructor(visibilityRepository) {
    this.visibilityRepository = visibilityRepository;
  }

  async execute(ministere) {
    return await this.visibilityRepository.searchUnitsByMinistere(ministere);
  }
}

module.exports = SearchUnitsUseCase;
