const { v4: uuidv4 } = require('uuid');

class Message {
  constructor({
    id = uuidv4(),
    conversationId,
    senderId,
    content,
    type = 'TEXT',
    fileId = null,
    status = 'SENT',
    replyToId = null,
    editedAt = null,
    deletedAt = null,
    createdAt = new Date(),
    updatedAt = new Date()
  }) {
    this.id = id;
    this.conversationId = conversationId;
    this.senderId = senderId;
    this.content = content;
    this.type = type; // TEXT, IMAGE, VIDEO, DOCUMENT, AUDIO
    this.fileId = fileId;
    this.status = status; // SENT, DELIVERED, READ
    this.replyToId = replyToId;
    this.editedAt = editedAt;
    this.deletedAt = deletedAt;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static create(data) {
    return new Message(data);
  }

  edit(newContent) {
    this.content = newContent;
    this.editedAt = new Date();
    this.updatedAt = new Date();
  }

  delete() {
    this.deletedAt = new Date();
    this.updatedAt = new Date();
  }

  updateStatus(status) {
    this.status = status;
    this.updatedAt = new Date();
  }

  isDeleted() {
    return this.deletedAt !== null;
  }

  hasFile() {
    return this.fileId !== null;
  }

  toJSON() {
    return {
      id: this.id,
      conversationId: this.conversationId,
      senderId: this.senderId,
      content: this.content,
      type: this.type,
      fileId: this.fileId,
      status: this.status,
      replyToId: this.replyToId,
      editedAt: this.editedAt,
      deletedAt: this.deletedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = Message;
