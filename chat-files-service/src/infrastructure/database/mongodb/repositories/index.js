/**
 * Index des Repository MongoDB
 * CENADI Chat-Files-Service
 */

const MongoBaseRepository = require('./MongoBaseRepository');
const MongoConversationRepository = require('./MongoConversationRepository');
const MongoMessageRepository = require('./MongoMessageRepository');
const MongoFileRepository = require('./MongoFileRepository');

module.exports = {
  MongoBaseRepository,
  MongoConversationRepository,
  MongoMessageRepository,
  MongoFileRepository
};
