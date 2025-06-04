const User = require("../../domain/entities/User");
const { sequelize } = require("../config/database");

class UserRepository {
  async findByMatricule(matricule) {
    const [user] = await sequelize.query(
      "SELECT id, matricule, nom, prenom FROM personnel WHERE matricule = :matricule",
      {
        replacements: { matricule },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (!user) return null;

    return new User(user);
  }
}

module.exports = UserRepository;
