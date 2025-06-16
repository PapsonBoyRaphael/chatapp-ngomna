/**
 * Événement : Réaction ajoutée à un message
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class MessageReactionAdded extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.messageId,
      aggregateType: 'Message',
      userId: data.userId,
      messageId: data.messageId,
      conversationId: data.conversationId,
      reaction: data.reaction,
      addedAt: data.addedAt || new Date(),
      ...data
    });
  }

  getMessageId() {
    return this.data.messageId;
  }

  getConversationId() {
    return this.data.conversationId;
  }

  getUserId() {
    return this.data.userId;
  }

  getReaction() {
    return this.data.reaction;
  }

  getAddedAt() {
    return this.data.addedAt;
  }
}

module.exports = MessageReactionAdded;
