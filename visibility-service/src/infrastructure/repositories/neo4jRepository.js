const driver = require('../database/neo4jDriver');

class Neo4jRepository {
  async getSession() {
    return driver.session();
  }
}

module.exports = new Neo4jRepository();