//PROVIDES configuration settings for the application in case .env variables are not set.
require('dotenv').config();
const process = require('process');

module.exports = {
  port: process.env.PORT || 3000,
  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7689',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || '123456789',
  },
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'minesup',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
  },
};