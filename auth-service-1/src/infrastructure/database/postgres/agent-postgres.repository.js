const { Pool } = require('pg');
const Agent = require('../../../domain/entities/agent.entity');
const AgentRepository = require('../../../domain/repositories/agent.repository');
const config = require('../../../../config/env');

const pool = new Pool(config.postgres);

class AgentPostgresRepository extends AgentRepository {
  async findByMatricule(matricule) {
    const query = 'SELECT matricule, nom, prenom, sexe, mmnaissance, aanaissance, lieunaissance, ministere, rang FROM personnel WHERE matricule = $1';
    // note the use of $1 because it is a parameterized query to prevent SQL injection
    const { rows } = await pool.query(query, [matricule]);
    if (rows.length === 0) return null;
    return new Agent(rows[0]);
  }
}

module.exports = AgentPostgresRepository;