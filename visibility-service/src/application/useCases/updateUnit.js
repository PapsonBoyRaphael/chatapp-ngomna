const neo4jRepository = require('../../infrastructure/repositories/neo4jRepository');
const Role = require('../../domain/valueObjects/role');

class UpdateUnit {
  async execute(matricule, unitId, roleName) {
    const role = new Role(roleName); // Validate role
    const result = await neo4jRepository.updateAgentUnit(matricule, unitId, role.name);
    return {
      agent: result.agent,
      unit: result.unit,
      role: result.role,
    };
  }
}

module.exports = new UpdateUnit();