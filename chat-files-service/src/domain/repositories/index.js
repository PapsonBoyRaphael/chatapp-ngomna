/**
 * Index des Repository Interfaces
 * CENADI Chat-Files-Service
 */

const BaseRepository = require('./BaseRepository');
const ConversationRepository = require('./ConversationRepository');
const MessageRepository = require('./MessageRepository');
const FileRepository = require('./FileRepository');

module.exports = {
  BaseRepository,
  ConversationRepository,
  MessageRepository,
  FileRepository
};
