const { Sequelize } = require("sequelize");
require("dotenv").config();

const initDb = require("./initDb");

// Utiliser le nom du service 'postgres' au lieu de localhost
const sequelize = new Sequelize(
  "chatapp",
  "postgres",
  "postgres",
  {
    host: "localhost",
    dialect: "postgres",
    port: 5432,
  }
  // process.env.DB_URL || "postgres://user:password@postgres:5432/chatapp",
  // {
  //   dialect: "postgres",
  //   logging: false,
  // }
);

console.log("Sequelize instance:", sequelize); // Log pour déboguer
console.log("Sequelize define method:", typeof sequelize.define); // Vérifier si define existe

(async () => {
  try {
    await sequelize.authenticate();
    console.log("Connecté à user_db (PostgreSQL)");
    await sequelize.sync({ alter: true });
    console.log("Modèles synchronisés");
  } catch (error) {
    console.error("Erreur de connexion ou de synchronisation:", error);
  }
})();

module.exports = sequelize;
