/**
 * Unit Repository Interface
 */
class UnitRepository {
  async findByMinistry(ministryName) {
    throw new Error('Method not implemented');
  }

  async findById(unitId) {
    throw new Error('Method not implemented');
  }

  async findByNamePattern(pattern) {
    throw new Error('Method not implemented');
  }

  async getSubordinateUnits(unitId) {
    throw new Error('Method not implemented');
  }

  async getParentUnit(unitId) {
    throw new Error('Method not implemented');
  }

  async getAllUnits() {
    throw new Error('Method not implemented');
  }
}

module.exports = UnitRepository;