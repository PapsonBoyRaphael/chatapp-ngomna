/**
 * Événement : Utilisateur a rejoint une conversation
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class UserJoinedConversation extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.userId,
      aggregateType: 'User',
      userId: data.userId,
      conversationId: data.conversationId,
      joinedAt: data.joinedAt || new Date(),
      invitedBy: data.invitedBy,
      ...data
    });
  }

  getUserId() {
    return this.data.userId;
  }

  getConversationId() {
    return this.data.conversationId;
  }

  getJoinedAt() {
    return this.data.joinedAt;
  }

  getInvitedBy() {
    return this.data.invitedBy;
  }

  wasInvited() {
    return !!this.data.invitedBy;
  }
}

module.exports = UserJoinedConversation;
