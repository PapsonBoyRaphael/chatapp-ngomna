const { Pool } = require('pg');
const { postgres: postgresConfig } = require('../../config/settings');

const pool = new Pool({
  host: postgresConfig.host,
  port: postgresConfig.port,
  database: postgresConfig.database,
  user: postgresConfig.user,
  password: postgresConfig.password,
  max: 20, // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

module.exports = pool;