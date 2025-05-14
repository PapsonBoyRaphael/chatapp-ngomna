const { mongoose, File } = require("./db");

const initFileDb = async () => {
  try {
    await File.deleteMany({});
    console.log("✅ File_DB initialisée (aucun fichier de test par défaut)");
  } catch (error) {
    console.error("❌ Erreur lors de l'init File_DB:", error);
  }
};

module.exports = initFileDb;
