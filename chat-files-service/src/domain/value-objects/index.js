/**
 * Index des Value Objects
 * CENADI Chat-Files-Service
 */

// Base
const ValueObject = require('./ValueObject');

// File Value Objects
const FileSize = require('./FileSize');
const MimeType = require('./MimeType');
const FileName = require('./FileName');

// Conversation Value Objects
const ConversationType = require('./ConversationType');
const MessageContent = require('./MessageContent');

module.exports = {
  // Base
  ValueObject,

  // File Value Objects
  FileSize,
  MimeType,
  FileName,

  // Conversation Value Objects
  ConversationType,
  MessageContent
};
