/**
 * Index des Schémas MongoDB
 * CENADI Chat-Files-Service
 */

const ConversationSchema = require('./ConversationSchema');
const MessageSchema = require('./MessageSchema');
const FileSchema = require('./FileSchema');

module.exports = {
  ConversationSchema,
  MessageSchema,
  FileSchema
};
