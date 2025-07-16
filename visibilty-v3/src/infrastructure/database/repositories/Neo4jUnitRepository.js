const UnitRepository = require('../../../domain/repositories/UnitRepository');
const Unit = require('../../../domain/entities/Unit');
const CypherSanitizer = require('../../../domain/services/CypherSanitizer');

/**
 * Neo4j Unit Repository Implementation
 */
class Neo4jUnitRepository extends UnitRepository {
  constructor(neo4jConfig) {
    super();
    this.neo4j = neo4jConfig;
  }

  async findByMinistry(ministryName) {
    const sanitizedName = CypherSanitizer.sanitizeUnitName(ministryName);
    
    const query = `
      MATCH (ministry:Unit:Ministere {name: $ministryName})
      MATCH (ministry)-[:OVERSEES*0..]->(unit:Unit)
      WHERE unit.name IS NOT NULL
      RETURN DISTINCT unit
      ORDER BY unit.name
    `;

    try {
      const records = await this.neo4j.executeQuery(query, { ministryName: sanitizedName });
      
      return records.map(record => {
        const unitNode = record.get('unit');
        return new Unit({
          id: unitNode.properties.id,
          name: unitNode.properties.name,
          acronyme: unitNode.properties.acronyme || '',
          type: unitNode.labels.find(label => label !== 'Unit')
        });
      });
    } catch (error) {
      console.error('Error finding units by ministry:', error);
      throw new Error('Failed to find units by ministry');
    }
  }

  async findById(unitId) {
    const query = `
      MATCH (unit:Unit {id: $unitId})
      RETURN unit
    `;

    try {
      const records = await this.neo4j.executeQuery(query, { unitId });
      
      if (records.length === 0) {
        return null;
      }

      const unitNode = records[0].get('unit');
      return new Unit({
        id: unitNode.properties.id,
        name: unitNode.properties.name,
        acronyme: unitNode.properties.acronyme || '',
        type: unitNode.labels.find(label => label !== 'Unit')
      });
    } catch (error) {
      console.error('Error finding unit by ID:', error);
      throw new Error('Failed to find unit by ID');
    }
  }

  async findByNamePattern(pattern) {
    const query = `
      MATCH (unit:Unit)
      WHERE unit.name CONTAINS $pattern OR unit.acronyme CONTAINS $pattern
      RETURN unit
      ORDER BY unit.name
      LIMIT 20
    `;

    try {
      const records = await this.neo4j.executeQuery(query, { pattern });
      
      return records.map(record => {
        const unitNode = record.get('unit');
        return new Unit({
          id: unitNode.properties.id,
          name: unitNode.properties.name,
          acronyme: unitNode.properties.acronyme || '',
          type: unitNode.labels.find(label => label !== 'Unit')
        });
      });
    } catch (error) {
      console.error('Error searching units by pattern:', error);
      throw new Error('Failed to search units');
    }
  }

  async getSubordinateUnits(unitId) {
    const query = `
      MATCH (parent:Unit {id: $unitId})-[:OVERSEES*1..]->(subordinate:Unit)
      RETURN DISTINCT subordinate
      ORDER BY subordinate.name
    `;

    try {
      const records = await this.neo4j.executeQuery(query, { unitId });
      
      return records.map(record => {
        const unitNode = record.get('subordinate');
        return new Unit({
          id: unitNode.properties.id,
          name: unitNode.properties.name,
          acronyme: unitNode.properties.acronyme || '',
          type: unitNode.labels.find(label => label !== 'Unit')
        });
      });
    } catch (error) {
      console.error('Error finding subordinate units:', error);
      throw new Error('Failed to find subordinate units');
    }
  }

  async getParentUnit(unitId) {
    const query = `
      MATCH (parent:Unit)-[:OVERSEES]->(unit:Unit {id: $unitId})
      RETURN parent
    `;

    try {
      const records = await this.neo4j.executeQuery(query, { unitId });
      
      if (records.length === 0) {
        return null;
      }

      const unitNode = records[0].get('parent');
      return new Unit({
        id: unitNode.properties.id,
        name: unitNode.properties.name,
        acronyme: unitNode.properties.acronyme || '',
        type: unitNode.labels.find(label => label !== 'Unit')
      });
    } catch (error) {
      console.error('Error finding parent unit:', error);
      throw new Error('Failed to find parent unit');
    }
  }

  async getAllUnits() {
    const query = `
      MATCH (unit:Unit)
      RETURN unit
      ORDER BY unit.name
    `;

    try {
      const records = await this.neo4j.executeQuery(query);
      
      return records.map(record => {
        const unitNode = record.get('unit');
        return new Unit({
          id: unitNode.properties.id,
          name: unitNode.properties.name,
          acronyme: unitNode.properties.acronyme || '',
          type: unitNode.labels.find(label => label !== 'Unit')
        });
      });
    } catch (error) {
      console.error('Error finding all units:', error);
      throw new Error('Failed to find all units');
    }
  }
}

module.exports = Neo4jUnitRepository;