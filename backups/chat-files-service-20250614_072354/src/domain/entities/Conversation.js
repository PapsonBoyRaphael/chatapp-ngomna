const { v4: uuidv4 } = require('uuid');

class Conversation {
  constructor({
    id = uuidv4(),
    title = null,
    type = 'PRIVATE',
    participants = [],
    createdBy,
    lastMessageId = null,
    lastMessageAt = null,
    isArchived = false,
    isPinned = false,
    metadata = {},
    createdAt = new Date()
  }) {
    this.id = id;
    this.title = title;
    this.type = type;
    this.participants = participants;
    this.createdBy = createdBy;
    this.lastMessageId = lastMessageId;
    this.lastMessageAt = lastMessageAt;
    this.isArchived = isArchived;
    this.isPinned = isPinned;
    this.metadata = metadata;
    this.createdAt = createdAt;
  }

  static create(data) {
    return new Conversation(data);
  }

  addParticipant(userId) {
    if (!this.participants.includes(userId)) {
      this.participants.push(userId);
    }
    return this;
  }

  removeParticipant(userId) {
    this.participants = this.participants.filter(id => id !== userId);
    return this;
  }

  hasParticipant(userId) {
    return this.participants.includes(userId);
  }

  validate() {
    const errors = [];

    if (!this.createdBy) {
      errors.push('createdBy is required');
    }

    if (this.participants.length === 0) {
      errors.push('at least one participant is required');
    }

    const validTypes = ['PRIVATE', 'GROUP', 'CHANNEL'];
    if (!validTypes.includes(this.type)) {
      errors.push('invalid conversation type');
    }

    return errors;
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      type: this.type,
      participants: this.participants,
      participantCount: this.participants.length,
      createdBy: this.createdBy,
      lastMessageId: this.lastMessageId,
      lastMessageAt: this.lastMessageAt,
      isArchived: this.isArchived,
      isPinned: this.isPinned,
      metadata: this.metadata,
      createdAt: this.createdAt
    };
  }
}

module.exports = Conversation;
