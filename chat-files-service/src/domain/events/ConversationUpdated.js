/**
 * Événement : Conversation mise à jour
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class ConversationUpdated extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.conversationId,
      aggregateType: 'Conversation',
      userId: data.updatedBy,
      conversationId: data.conversationId,
      updatedBy: data.updatedBy,
      updates: data.updates,
      previousValues: data.previousValues,
      ...data
    });
  }

  getConversationId() {
    return this.data.conversationId;
  }

  getUpdatedBy() {
    return this.data.updatedBy;
  }

  getUpdates() {
    return this.data.updates;
  }

  getPreviousValues() {
    return this.data.previousValues;
  }

  getUpdatedFields() {
    return Object.keys(this.data.updates);
  }
}

module.exports = ConversationUpdated;
