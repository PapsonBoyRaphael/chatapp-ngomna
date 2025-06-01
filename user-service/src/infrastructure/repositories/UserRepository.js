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
}

module.exports = UserRepository;
