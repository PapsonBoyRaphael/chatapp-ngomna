/**
 * Index Repositories Redis
 * CENADI Chat-Files-Service
 */

const RedisBaseRepository = require('./RedisBaseRepository');
const RedisFileRepository = require('./RedisFileRepository');
const RedisConversationRepository = require('./RedisConversationRepository');
const RedisSessionRepository = require('./RedisSessionRepository');

module.exports = {
  RedisBaseRepository,
  RedisFileRepository,
  RedisConversationRepository,
  RedisSessionRepository
};
