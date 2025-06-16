/**
 * Événement : Conversation créée
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class ConversationCreated extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.conversationId,
      aggregateType: 'Conversation',
      userId: data.createdBy,
      conversationId: data.conversationId,
      name: data.name,
      type: data.type,
      participants: data.participants,
      createdBy: data.createdBy,
      settings: data.settings,
      ...data
    });
  }

  getConversationId() {
    return this.data.conversationId;
  }

  getParticipants() {
    return this.data.participants;
  }

  getCreator() {
    return this.data.createdBy;
  }

  getType() {
    return this.data.type;
  }
}

module.exports = ConversationCreated;
