const Agent = require('../../domain/entities/agent');
const postgresRepository = require('../../infrastructure/repositories/postgresRepository');

class VerifyAgent {
  async execute(matricule) {
    const agentData = await postgresRepository.getAgentByMatricule(matricule);
    return new Agent(agentData);
  }
}

module.exports = new VerifyAgent();