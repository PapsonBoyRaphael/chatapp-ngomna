const { sequelize } = require("./connection");
require("../../models/User"); // Importer le modèle

const initDatabase = async () => {
  try {
    await sequelize.sync({ alter: false });
    console.log("✅ Base de données initialisée avec succès");
    return true;
  } catch (error) {
    console.error("❌ Erreur initialisation BD:", error);
    return false;
  }
};

module.exports = initDatabase;
