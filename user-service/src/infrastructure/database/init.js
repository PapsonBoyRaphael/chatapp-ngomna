const { sequelize } = require("./connection");
const seedDatabase = require("./seeders");
require("../../models/User"); // Importer le modèle

const initDatabase = async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log("✅ Base de données initialisée avec succès");
    // Insérer les données de test
    await seedDatabase();
    return true;
  } catch (error) {
    console.error("❌ Erreur initialisation BD:", error);
    return false;
  }
};

module.exports = initDatabase;
