/**
 * Interface de base pour tous les repositories
 * CENADI Chat-Files-Service
 */

class BaseRepository {
  // Méthodes CRUD de base

  async create(data) {
    throw new Error('Method create() must be implemented');
  }

  async findById(id) {
    throw new Error('Method findById() must be implemented');
  }

  async findByIds(ids) {
    throw new Error('Method findByIds() must be implemented');
  }

  async update(id, data) {
    throw new Error('Method update() must be implemented');
  }

  async delete(id) {
    throw new Error('Method delete() must be implemented');
  }

  async exists(id) {
    throw new Error('Method exists() must be implemented');
  }

  // Méthodes de requête

  async findAll(options = {}) {
    throw new Error('Method findAll() must be implemented');
  }

  async findPaginated(filters = {}, pagination = {}, sort = {}) {
    throw new Error('Method findPaginated() must be implemented');
  }

  async count(filters = {}) {
    throw new Error('Method count() must be implemented');
  }

  // Méthodes de transaction

  async beginTransaction() {
    throw new Error('Method beginTransaction() must be implemented');
  }

  async commitTransaction(transaction) {
    throw new Error('Method commitTransaction() must be implemented');
  }

  async rollbackTransaction(transaction) {
    throw new Error('Method rollbackTransaction() must be implemented');
  }

  async executeInTransaction(callback) {
    throw new Error('Method executeInTransaction() must be implemented');
  }
}

module.exports = BaseRepository;
