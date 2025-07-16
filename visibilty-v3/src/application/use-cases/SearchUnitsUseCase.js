// src/application/use-cases/SearchUnitsUseCase.js
/**
 * Search Units Use Case
 * 
 * Purpose: Search for units based on ministry and autocomplete functionality
 */
class SearchUnitsUseCase {
  constructor(unitRepository) {
    this.unitRepository = unitRepository;
  }

  async execute(ministryName, searchQuery = '') {
    try {
      if (!ministryName || typeof ministryName !== 'string') {
        return {
          success: false,
          message: 'Ministry name is required',
          code: 'MINISTRY_REQUIRED'
        };
      }

      // Get units under the specified ministry
      const units = await this.unitRepository.findByMinistry(ministryName);

      if (units.length === 0) {
        return {
          success: false,
          message: 'No units found for the specified ministry',
          code: 'NO_UNITS_FOUND'
        };
      }

      // Filter by search query if provided
      let filteredUnits = units;
      if (searchQuery && searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase().trim();
        filteredUnits = units.filter(unit => 
          unit.name.toLowerCase().includes(query) ||
          unit.acronyme.toLowerCase().includes(query)
        );
      }

      return {
        success: true,
        units: filteredUnits.map(unit => unit.toJSON()),
        total: filteredUnits.length,
        ministry: ministryName
      };
    } catch (error) {
      console.error('Error in SearchUnitsUseCase:', error);
      return {
        success: false,
        message: 'Failed to search units',
        code: 'SEARCH_ERROR'
      };
    }
  }

  async executeAutocomplete(ministryName, query) {
    try {
      const result = await this.execute(ministryName, query);
      
      if (!result.success) {
        return result;
      }

      // Limit results for autocomplete
      const suggestions = result.units.slice(0, 10).map(unit => ({
        id: unit.id,
        label: unit.displayName,
        value: unit.name
      }));

      return {
        success: true,
        suggestions,
        total: suggestions.length
      };
    } catch (error) {
      console.error('Error in autocomplete:', error);
      return {
        success: false,
        message: 'Failed to get autocomplete suggestions',
        code: 'AUTOCOMPLETE_ERROR'
      };
    }
  }
}

module.exports = SearchUnitsUseCase;