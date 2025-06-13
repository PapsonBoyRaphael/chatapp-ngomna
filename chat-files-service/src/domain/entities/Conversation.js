const { v4: uuidv4 } = require('uuid');

class Conversation {
  constructor({
    id = uuidv4(),
    title = null,
    type = 'PRIVATE',
    participants = [],
    createdBy,
    isArchived = false,
    lastMessageId = null,
    lastMessageAt = null,
    createdAt = new Date(),
    updatedAt = new Date()
  }) {
    this.id = id;
    this.title = title;
    this.type = type; // PRIVATE, GROUP, CHANNEL
    this.participants = participants;
    this.createdBy = createdBy;
    this.isArchived = isArchived;
    this.lastMessageId = lastMessageId;
    this.lastMessageAt = lastMessageAt;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static create(data) {
    return new Conversation(data);
  }

  addParticipant(userId) {
    if (!this.participants.includes(userId)) {
      this.participants.push(userId);
      this.updatedAt = new Date();
    }
  }

  removeParticipant(userId) {
    this.participants = this.participants.filter(id => id !== userId);
    this.updatedAt = new Date();
  }

  updateLastMessage(messageId) {
    this.lastMessageId = messageId;
    this.lastMessageAt = new Date();
    this.updatedAt = new Date();
  }

  archive() {
    this.isArchived = true;
    this.updatedAt = new Date();
  }

  unarchive() {
    this.isArchived = false;
    this.updatedAt = new Date();
  }

  updateTitle(title) {
    this.title = title;
    this.updatedAt = new Date();
  }

  hasParticipant(userId) {
    return this.participants.includes(userId);
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      type: this.type,
      participants: this.participants,
      createdBy: this.createdBy,
      isArchived: this.isArchived,
      lastMessageId: this.lastMessageId,
      lastMessageAt: this.lastMessageAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Conversation;
