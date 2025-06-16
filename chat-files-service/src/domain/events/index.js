/**
 * Index des événements de domaine
 * CENADI Chat-Files-Service
 */

// Base
const DomainEvent = require('./DomainEvent');

// Conversation Events
const ConversationCreated = require('./ConversationCreated');
const ConversationUpdated = require('./ConversationUpdated');
const ParticipantAdded = require('./ParticipantAdded');
const ParticipantRemoved = require('./ParticipantRemoved');

// Message Events
const MessageSent = require('./MessageSent');
const MessageEdited = require('./MessageEdited');
const MessageDeleted = require('./MessageDeleted');
const MessageRead = require('./MessageRead');
const MessageReactionAdded = require('./MessageReactionAdded');

// File Events
const FileUploaded = require('./FileUploaded');
const FileDownloaded = require('./FileDownloaded');
const FileDeleted = require('./FileDeleted');
const FileProcessed = require('./FileProcessed');

// User Events
const UserJoinedConversation = require('./UserJoinedConversation');
const UserLeftConversation = require('./UserLeftConversation');
const UserOnlineStatusChanged = require('./UserOnlineStatusChanged');

module.exports = {
  // Base
  DomainEvent,

  // Conversation Events
  ConversationCreated,
  ConversationUpdated,
  ParticipantAdded,
  ParticipantRemoved,

  // Message Events
  MessageSent,
  MessageEdited,
  MessageDeleted,
  MessageRead,
  MessageReactionAdded,

  // File Events
  FileUploaded,
  FileDownloaded,
  FileDeleted,
  FileProcessed,

  // User Events
  UserJoinedConversation,
  UserLeftConversation,
  UserOnlineStatusChanged
};
