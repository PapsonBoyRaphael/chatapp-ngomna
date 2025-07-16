const pool = require('../database/postgresDriver');

class PostgresRepository {
  async getAgentByMatricule(matricule) {
    const query = 'SELECT * FROM personnel WHERE matricule = $1';
    const result = await pool.query(query, [matricule]);
    if (result.rows.length === 0) {
      throw new Error('Agent not found');
    }
    return result.rows[0];
  }
}

module.exports = new PostgresRepository();