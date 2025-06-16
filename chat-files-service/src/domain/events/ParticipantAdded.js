/**
 * Événement : Participant ajouté à une conversation
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class ParticipantAdded extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.conversationId,
      aggregateType: 'Conversation',
      userId: data.addedBy,
      conversationId: data.conversationId,
      addedParticipants: data.addedParticipants,
      addedBy: data.addedBy,
      ...data
    });
  }

  getConversationId() {
    return this.data.conversationId;
  }

  getAddedParticipants() {
    return this.data.addedParticipants;
  }

  getAddedBy() {
    return this.data.addedBy;
  }
}

module.exports = ParticipantAdded;
