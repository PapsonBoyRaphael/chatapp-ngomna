const User = require("../../domain/entities/User");
const { sequelize } = require("../config/database");

class UserRepository {
  async findAll() {
    const users = await sequelize.query(
      `SELECT id, agt_id, matricule, nom, prenom, sexe, mmnaissance, aanaissance, lieunaissance, ministere 
       FROM personnel`,
      { type: sequelize.QueryTypes.SELECT }
    );

    return users.map((user) => new User(user));
  }

  async findById(userId) {
    try {
      const [user] = await sequelize.query(
        `SELECT id, agt_id, matricule, nom, prenom, sexe, mmnaissance, aanaissance, lieunaissance, ministere 
         FROM personnel 
         WHERE id = :userId`,
        {
          replacements: { userId },
          type: sequelize.QueryTypes.SELECT,
        }
      );

      if (!user) {
        return null;
      }

      return new User(user);
    } catch (error) {
      console.error("Erreur lors de la récupération de l'utilisateur:", error);
      throw error;
    }
  }
}

module.exports = UserRepository;
