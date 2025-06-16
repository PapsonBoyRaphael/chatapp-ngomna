/**
 * Index Infrastructure Redis
 * CENADI Chat-Files-Service
 */

// Clients
const RedisClient = require('./clients/RedisClient');

// Cache
const CacheManager = require('./cache/CacheManager');

// Sessions
const SessionManager = require('./sessions/SessionManager');

// Pub/Sub
const PubSubManager = require('./pubsub/PubSubManager');

// Repositories
const RedisBaseRepository = require('./repositories/RedisBaseRepository');
const RedisFileRepository = require('./repositories/RedisFileRepository');
const RedisConversationRepository = require('./repositories/RedisConversationRepository');
const RedisSessionRepository = require('./repositories/RedisSessionRepository');

module.exports = {
  // Clients
  RedisClient,
  
  // Managers
  CacheManager,
  SessionManager,
  PubSubManager,
  
  // Repositories
  RedisBaseRepository,
  RedisFileRepository,
  RedisConversationRepository,
  RedisSessionRepository
};
