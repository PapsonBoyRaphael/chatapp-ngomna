const MessageTypes = {
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
  DOCUMENT: 'DOCUMENT',
  AUDIO: 'AUDIO',
  FILE: 'FILE'
};

const MessageStatus = {
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  READ: 'READ'
};

const ConversationType = {
  PRIVATE: 'PRIVATE',
  GROUP: 'GROUP',
  CHANNEL: 'CHANNEL'
};

module.exports = {
  MessageTypes,
  MessageStatus,
  ConversationType
};
