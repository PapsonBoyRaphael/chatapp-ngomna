/**
 * Événement : Message édité
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class MessageEdited extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.messageId,
      aggregateType: 'Message',
      userId: data.editedBy,
      messageId: data.messageId,
      conversationId: data.conversationId,
      editedBy: data.editedBy,
      newContent: data.newContent,
      previousContent: data.previousContent,
      ...data
    });
  }

  getMessageId() {
    return this.data.messageId;
  }

  getConversationId() {
    return this.data.conversationId;
  }

  getEditedBy() {
    return this.data.editedBy;
  }

  getNewContent() {
    return this.data.newContent;
  }

  getPreviousContent() {
    return this.data.previousContent;
  }
}

module.exports = MessageEdited;
