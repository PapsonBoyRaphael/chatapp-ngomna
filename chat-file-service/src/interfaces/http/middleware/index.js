// Export centralisé de tous les middleware
const authMiddleware = require('./authMiddleware');
const rateLimitMiddleware = require('./rateLimitMiddleware');
const cacheMiddleware = require('./cacheMiddleware');
const validationMiddleware = require('./validationMiddleware');

module.exports = {
  authMiddleware,
  rateLimitMiddleware,
  cacheMiddleware,
  validationMiddleware
};
