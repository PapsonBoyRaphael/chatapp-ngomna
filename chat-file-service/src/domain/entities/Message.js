class Message {
  constructor({
    id,
    conversationId,
    senderId,
    receiverId,
    content,
    type = "TEXT",
    metadata = {},
    status = "SENT",
    createdAt,
    updatedAt
  }) {
    this.id = id;
    this.conversationId = conversationId;
    this.senderId = senderId;
    this.receiverId = receiverId;
    this.content = content;
    this.type = type;
    this.metadata = metadata;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

module.exports = Message;
