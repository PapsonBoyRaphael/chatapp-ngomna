/**
 * Événement : Message envoyé
 * CENADI Chat-Files-Service
 */

const DomainEvent = require('./DomainEvent');

class MessageSent extends DomainEvent {
  constructor(data) {
    super({
      aggregateId: data.messageId,
      aggregateType: 'Message',
      userId: data.senderId,
      messageId: data.messageId,
      conversationId: data.conversationId,
      senderId: data.senderId,
      content: data.content,
      type: data.type,
      fileId: data.fileId,
      replyToId: data.replyToId,
      ...data
    });
  }

  getMessageId() {
    return this.data.messageId;
  }

  getConversationId() {
    return this.data.conversationId;
  }

  getSenderId() {
    return this.data.senderId;
  }

  getContent() {
    return this.data.content;
  }

  getType() {
    return this.data.type;
  }

  isFileMessage() {
    return ['file', 'image', 'video', 'audio'].includes(this.data.type);
  }

  isReply() {
    return !!this.data.replyToId;
  }
}

module.exports = MessageSent;
