const { v4: uuidv4 } = require('uuid');

class Message {
  constructor({
    id = uuidv4(),
    conversationId,
    senderId,
    content,
    type = 'TEXT',
    status = 'SENT',
    fileId = null,
    replyToId = null,
    editedAt = null,
    deletedAt = null,
    metadata = {},
    createdAt = new Date()
  }) {
    this.id = id;
    this.conversationId = conversationId;
    this.senderId = senderId;
    this.content = content;
    this.type = type;
    this.status = status;
    this.fileId = fileId;
    this.replyToId = replyToId;
    this.editedAt = editedAt;
    this.deletedAt = deletedAt;
    this.metadata = metadata;
    this.createdAt = createdAt;
  }

  static create(data) {
    return new Message(data);
  }

  edit(newContent) {
    this.content = newContent;
    this.editedAt = new Date();
    return this;
  }

  delete() {
    this.deletedAt = new Date();
    return this;
  }

  validate() {
    const errors = [];

    if (!this.conversationId) {
      errors.push('conversationId is required');
    }

    if (!this.senderId) {
      errors.push('senderId is required');
    }

    if (!this.content && !this.fileId) {
      errors.push('content or fileId is required');
    }

    return errors;
  }

  toJSON() {
    return {
      id: this.id,
      conversationId: this.conversationId,
      senderId: this.senderId,
      content: this.content,
      type: this.type,
      status: this.status,
      fileId: this.fileId,
      replyToId: this.replyToId,
      editedAt: this.editedAt,
      deletedAt: this.deletedAt,
      metadata: this.metadata,
      createdAt: this.createdAt
    };
  }

  createReply(content, senderId) {
    return Message.create({
      conversationId: this.conversationId,
      senderId,
      content,
      replyToId: this.id
    });
  }
}

module.exports = Message;
