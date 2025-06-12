class Conversation {
  constructor({
    id,
    participants,
    lastMessage,
    metadata = {},
    settings = {},
    createdAt,
    updatedAt
  }) {
    this.id = id;
    this.participants = participants;
    this.lastMessage = lastMessage;
    this.metadata = metadata;
    this.settings = settings;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

module.exports = Conversation;
