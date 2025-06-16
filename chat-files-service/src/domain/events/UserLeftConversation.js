/**
 * Événement : Utilisateur a quitté une conversation
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class UserLeftConversation extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.userId,
      aggregateType: 'User',
      userId: data.userId,
      conversationId: data.conversationId,
      leftAt: data.leftAt || new Date(),
      reason: data.reason,
      removedBy: data.removedBy,
      ...data
    });
  }

  getUserId() {
    return this.data.userId;
  }

  getConversationId() {
    return this.data.conversationId;
  }

  getLeftAt() {
    return this.data.leftAt;
  }

  getReason() {
    return this.data.reason;
  }

  getRemovedBy() {
    return this.data.removedBy;
  }

  wasRemoved() {
    return !!this.data.removedBy && this.data.removedBy !== this.data.userId;
  }

  leftVoluntarily() {
    return !this.wasRemoved();
  }
}

module.exports = UserLeftConversation;
