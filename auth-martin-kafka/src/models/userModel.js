const pool = require('../config/db');

const getUserByMatricule = async (matricule) => {
  const result = await pool.query(
    'SELECT matricule, nom, prenom, sexe, mmnaissance, aanaissance, ministere, rang FROM personnel WHERE matricule = $1',
    [matricule]
  );
  return result.rows[0]; // Assuming unique matricule
};

module.exports = { getUserByMatricule };