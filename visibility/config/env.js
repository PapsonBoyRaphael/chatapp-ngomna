require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3001,
  neo4j: {
    uri: process.env.NEO4J_URI,
    user: process.env.NEO4J_USER,
    password: process.env.NEO4J_PASSWORD,
  },
  sessionSecret: process.env.SESSION_SECRET,
  authServiceUrl: process.env.AUTH_SERVICE_URL,
};