const { Sequelize } = require("sequelize");
require("dotenv").config();

const config = {
  development: {
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    dialect: "postgres",
    port: process.env.DB_PORT,
    dialectOptions: {
      connectTimeout: 120000,
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 3600000,
      idle: 3600000,
    },
    logging: false,
  },
  production: {
    // Même configuration mais avec logging: false
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    dialect: "postgres",
    port: process.env.DB_PORT,
    dialectOptions: {
      connectTimeout: 120000,
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 3600000,
      idle: 3600000,
    },
    logging: false,
  },
};

module.exports = config;
