const { Sequelize } = require("sequelize");
const config = require("../../config/database");

const env = process.env.NODE_ENV || "development";
const dbConfig = config[env];

const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    dialect: dbConfig.dialect,
    port: dbConfig.port,
    dialectOptions: dbConfig.dialectOptions,
    pool: dbConfig.pool,
    logging: dbConfig.logging,
  }
);

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Connexion PostgreSQL établie avec succès.");
    return true;
  } catch (error) {
    console.error("❌ Impossible de se connecter à la base de données:", error);
    return false;
  }
};

module.exports = { sequelize, testConnection };
