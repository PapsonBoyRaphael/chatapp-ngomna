const neo4j = require('neo4j-driver');
const logger = require('../utils/logger');
require('dotenv').config();


class Neo4jConfig {
  constructor() {
    this.driver = neo4j.driver(
      process.env.NEO4J_URI,
      neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD),
      { disableLosslessIntegers: true }
    );
  }

  async testConnection() {
    try {
      const session = this.driver.session();
      await session.run('MATCH (n) RETURN n LIMIT 1');
      await session.close();
      logger.info('✅ Neo4j connection successful');
      return true;
    } catch (error) {
      logger.error('❌ Neo4j connection failed:', error);
      return false;
    }
  }

  getDriver() {
    return this.driver;
  }

  async close() {
    await this.driver.close();
  }
}

module.exports = new Neo4jConfig();