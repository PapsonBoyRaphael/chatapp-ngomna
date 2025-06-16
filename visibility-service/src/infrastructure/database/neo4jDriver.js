const neo4j = require('neo4j-driver');
const { neo4j: neo4jConfig } = require('../../config/settings');

const driver = neo4j.driver(
  neo4jConfig.uri,
  neo4j.auth.basic(neo4jConfig.user, neo4jConfig.password),
  { maxConnectionPoolSize: 100 } // For 50,000 concurrent requests by precaustion
);

module.exports = driver;