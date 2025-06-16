/**
 * Événement : Message lu
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class MessageRead extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.messageId,
      aggregateType: 'Message',
      userId: data.readBy,
      messageId: data.messageId,
      conversationId: data.conversationId,
      readBy: data.readBy,
      readAt: data.readAt || new Date(),
      ...data
    });
  }

  getMessageId() {
    return this.data.messageId;
  }

  getConversationId() {
    return this.data.conversationId;
  }

  getReadBy() {
    return this.data.readBy;
  }

  getReadAt() {
    return this.data.readAt;
  }
}

module.exports = MessageRead;
