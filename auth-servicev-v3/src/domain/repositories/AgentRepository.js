/**
 * Agent Repository Interface
 * 
 * Why use repository pattern?
 * - Abstracts data access logic
 * - Makes testing easier (can mock the repository)
 * - Allows switching between different storage mechanisms
 * - Provides a clear contract for data operations
 */
class AgentRepository {
  async findByMatricule(matricule) {
    throw new Error('Method not implemented');
  }

  async exists(matricule) {
    throw new Error('Method not implemented');
  }

  async findByMinistere(ministere) {
    throw new Error('Method not implemented');
  }

  async findAll() {
    throw new Error('Method not implemented');
  }
}

module.exports = AgentRepository;