/**
 * Événement : Message supprimé
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class MessageDeleted extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.messageId,
      aggregateType: 'Message',
      userId: data.deletedBy,
      messageId: data.messageId,
      conversationId: data.conversationId,
      deletedBy: data.deletedBy,
      reason: data.reason,
      ...data
    });
  }

  getMessageId() {
    return this.data.messageId;
  }

  getConversationId() {
    return this.data.conversationId;
  }

  getDeletedBy() {
    return this.data.deletedBy;
  }

  getReason() {
    return this.data.reason;
  }
}

module.exports = MessageDeleted;
