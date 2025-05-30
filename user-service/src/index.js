const express = require("express");
const chalk = require("chalk");
const { testConnection } = require("./infrastructure/database/connection");
const initDatabase = require("./infrastructure/database/init");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    // Test connexion BD
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error("Échec de connexion à la base de données");
    }

    // Initialisation BD
    const isInitialized = await initDatabase();
    if (!isInitialized) {
      throw new Error("Échec initialisation de la base de données");
    }

    app.listen(PORT, () => {
      console.log(chalk.yellow(`user-service démarré sur le port ${PORT}`));
    });
  } catch (error) {
    console.error("Erreur de démarrage:", error);
    process.exit(1);
  }
};

startServer();
