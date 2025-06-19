const Unit = require('../../domain/entities/unit');
const neo4jRepository = require('../../infrastructure/repositories/neo4jRepository');
const redisRepository = require('../../infrastructure/repositories/redisRepository');

class SearchUnits {
  async execute(query) {
    // Check Redis cache
    const cachedUnits = await redisRepository.getCachedUnitSearch(query);
    if (cachedUnits) {
      return cachedUnits.map(unit => new Unit(unit));
    }

    // Query Neo4j
    const units = await neo4jRepository.searchUnits(query);
    if (units.length > 0) {
      // Cache results
      await redisRepository.cacheUnitSearch(query, units);
    }
    return units.map(unit => new Unit(unit));
  }
}

module.exports = new SearchUnits();