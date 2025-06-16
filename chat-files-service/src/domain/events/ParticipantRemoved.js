/**
 * Événement : Participant retiré d'une conversation
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class ParticipantRemoved extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.conversationId,
      aggregateType: 'Conversation',
      userId: data.removedBy,
      conversationId: data.conversationId,
      removedParticipant: data.removedParticipant,
      removedBy: data.removedBy,
      reason: data.reason,
      ...data
    });
  }

  getConversationId() {
    return this.data.conversationId;
  }

  getRemovedParticipant() {
    return this.data.removedParticipant;
  }

  getRemovedBy() {
    return this.data.removedBy;
  }

  getReason() {
    return this.data.reason;
  }

  isLeaving() {
    return this.data.removedParticipant === this.data.removedBy;
  }
}

module.exports = ParticipantRemoved;
