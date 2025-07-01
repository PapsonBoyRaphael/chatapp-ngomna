class SearchUnitsUseCase {
  constructor(visibilityRepository) {
    this.visibilityRepository = visibilityRepository;
  }

  async execute(ministere) {
    return await this.visibilityRepository.searchUnitsByMinistere(ministere);
  }
}

module.exports = SearchUnitsUseCase;
// This use case is responsible for searching units by ministere.
// It interacts with the visibility repository to fetch the units.