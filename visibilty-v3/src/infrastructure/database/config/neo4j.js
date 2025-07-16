const neo4j = require('neo4j-driver');

/**
 * Neo4j Database Configuration
 * 
 * Why use Neo4j?
 * - Perfect for hierarchical organizational structures
 * - Efficient graph traversals for complex relationships
 * - Cypher query language is intuitive for hierarchy queries
 */
class Neo4jConfig {
  constructor() {
    this.driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'password'
      ),
      {
        maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
        disableLosslessIntegers: true
      }
    );

    // Handle driver errors
    this.driver.onError = (error) => {
      console.error('Neo4j Driver Error:', error);
    };

    // Handle driver completed
    this.driver.onCompleted = () => {
      console.log('Neo4j Driver completed');
    };
  }

  async session() {
    return this.driver.session();
  }

  async testConnection() {
    const session = this.driver.session();
    try {
      const result = await session.run('RETURN 1 as test');
      const record = result.records[0];
      const testValue = record.get('test');
      
      if (testValue === 1) {
        console.log('✅ Neo4j connection successful');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Neo4j connection failed:', error.message);
      return false;
    } finally {
      await session.close();
    }
  }

  async close() {
    await this.driver.close();
  }

  // Helper method for transactions
  async executeTransaction(transactionFunction) {
    const session = this.driver.session();
    try {
      return await session.executeWrite(transactionFunction);
    } finally {
      await session.close();
    }
  }

  async executeQuery(query, parameters = {}) {
    const session = this.driver.session();
    try {
      const result = await session.run(query, parameters);
      return result.records;
    } finally {
      await session.close();
    }
  }
}

module.exports = Neo4jConfig;