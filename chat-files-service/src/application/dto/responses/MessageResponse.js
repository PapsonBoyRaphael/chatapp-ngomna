/**
 * DTO pour les réponses de message
 * CENADI Chat-Files-Service
 */

class MessageResponse {
  constructor(message) {
    this.id = message._id || message.id;
    this.conversationId = message.conversationId;
    this.senderId = message.senderId;
    this.content = message.content;
    this.type = message.type;
    this.fileId = message.fileId;
    this.replyTo = message.replyTo;
    this.metadata = message.metadata || {};
    this.status = message.status;
    this.editedAt = message.editedAt;
    this.deletedAt = message.deletedAt;
    this.createdAt = message.createdAt;
    this.updatedAt = message.updatedAt;

    // Informations enrichies
    this.isEdited = !!message.editedAt;
    this.isDeleted = !!message.deletedAt;
    this.hasFile = !!message.fileId;
    this.isReply = !!message.replyTo;
  }

  static fromArray(messages) {
    return messages.map(message => new MessageResponse(message));
  }

  toPlainObject() {
    return {
      id: this.id,
      conversationId: this.conversationId,
      senderId: this.senderId,
      content: this.content,
      type: this.type,
      fileId: this.fileId,
      replyTo: this.replyTo,
      metadata: this.metadata,
      status: this.status,
      editedAt: this.editedAt,
      deletedAt: this.deletedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      flags: {
        isEdited: this.isEdited,
        isDeleted: this.isDeleted,
        hasFile: this.hasFile,
        isReply: this.isReply
      }
    };
  }

  // Version publique sans données sensibles
  toPublicObject() {
    const obj = this.toPlainObject();
    
    // Masquer le contenu si le message est supprimé
    if (this.isDeleted) {
      obj.content = '[Message supprimé]';
      obj.fileId = null;
    }

    return obj;
  }
}

module.exports = MessageResponse;
