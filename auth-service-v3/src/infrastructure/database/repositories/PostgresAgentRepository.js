const AgentRepository = require('../../../domain/repositories/AgentRepository');
const Agent = require('../../../domain/entities/Agent');
const Matricule = require('../../../domain/value-objects/Matricule');

/**
 * PostgreSQL Agent Repository Implementation
 * 
 * Why implement the repository interface?
 * - Provides concrete implementation for data access
 * - Handles SQL queries and result mapping
 * - Manages database-specific concerns
 * - Can be easily replaced with a different implementation
 */
class PostgresAgentRepository extends AgentRepository {
  constructor(databaseConfig) {
    super();
    this.db = databaseConfig;
  }

  async findByMatricule(matricule) {
    try {
      const matriculeObj = matricule instanceof Matricule ? matricule : new Matricule(matricule);
      
      const query = `
        SELECT matricule, nom, prenom, sexe, mmnaissance, aanaissance, rang, ministere
        FROM Personnel 
        WHERE UPPER(matricule) = UPPER($1)
      `;
      
      const result = await this.db.query(query, [matriculeObj.toString()]);
      
      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return new Agent({
        matricule: row.matricule,
        nom: row.nom,
        prenom: row.prenom,
        sexe: row.sexe,
        mmnaissance: row.mmnaissance,
        aanaissance: row.aanaissance,
        rang: row.rang,
        ministere: row.ministere
      });
    } catch (error) {
      console.error('Error finding agent by matricule:', error);
      throw new Error('Failed to find agent');
    }
  }

  async exists(matricule) {
    try {
      const matriculeObj = matricule instanceof Matricule ? matricule : new Matricule(matricule);
      
      const query = `
        SELECT COUNT(*) as count
        FROM agents 
        WHERE UPPER(matricule) = UPPER($1)
      `;
      
      const result = await this.db.query(query, [matriculeObj.toString()]);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      console.error('Error checking agent existence:', error);
      throw new Error('Failed to check agent existence');
    }
  }

  async findByMinistere(ministere) {
    try {
      const query = `
        SELECT matricule, nom, prenom, sexe, mmnaissance, aanaissance, rang, ministere
        FROM agents 
        WHERE LOWER(ministere) = LOWER($1)
        ORDER BY nom, prenom
      `;
      
      const result = await this.db.query(query, [ministere]);
      
      return result.rows.map(row => new Agent({
        matricule: row.matricule,
        nom: row.nom,
        prenom: row.prenom,
        sexe: row.sexe,
        mmnaissance: row.mmnaissance,
        aanaissance: row.aanaissance,
        rang: row.rang,
        ministere: row.ministere
      }));
    } catch (error) {
      console.error('Error finding agents by ministere:', error);
      throw new Error('Failed to find agents by ministere');
    }
  }

  async findAll() {
    try {
      const query = `
        SELECT matricule, nom, prenom, sexe, mmnaissance, aanaissance, rang, ministere
        FROM agents 
        ORDER BY nom, prenom
      `;
      
      const result = await this.db.query(query);
      
      return result.rows.map(row => new Agent({
        matricule: row.matricule,
        nom: row.nom,
        prenom: row.prenom,
        sexe: row.sexe,
        mmnaissance: row.mmnaissance,
        aanaissance: row.aanaissance,
        rang: row.rang,
        ministere: row.ministere
      }));
    } catch (error) {
      console.error('Error finding all agents:', error);
      throw new Error('Failed to find all agents');
    }
  }
}

module.exports = PostgresAgentRepository;