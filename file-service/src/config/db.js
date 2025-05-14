const mongoose = require("mongoose");
require("dotenv").config();

const FileModel = require("../models/file");

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connecté à file_db (Fichiers)"))
  .catch((err) => console.error("Erreur MongoDB (File):", err));

module.exports = { mongoose, File: FileModel };
