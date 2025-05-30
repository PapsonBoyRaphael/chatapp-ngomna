const User = require("../../models/User");
const mockUsers = require("./mock-ressources");

const seedDatabase = async () => {
  try {
    // Vérifier si la table est vide
    const count = await User.count();

    if (count === 0) {
      // Insérer les données mock uniquement si la table est vide
      await User.bulkCreate(mockUsers);
      console.log("✅ Données de test insérées avec succès");
    } else {
      console.log("ℹ️ La base de données contient déjà des données");
    }

    return true;
  } catch (error) {
    console.error("❌ Erreur lors de l'insertion des données:", error);
    return false;
  }
};

module.exports = seedDatabase;
