const mongoose = require("mongoose");
require("dotenv").config();

// Ajouter ici le modèle File une fois défini, par exemple : const FileModel = require("../models/file");
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connecté à file_db (Files)"))
  .catch((err) => console.error("Erreur MongoDB (File):", err));

module.exports = {
  mongoose,
  // File: FileModel, // Décommenter et ajouter après définition du modèle
};
