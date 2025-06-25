require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  postgres: {
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  },
  sessionSecret: process.env.SESSION_SECRET,
  visibilityServiceUrl: process.env.VISIBILITY_SERVICE_URL,
};