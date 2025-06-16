/**
 * DTO pour les réponses de conversation
 * CENADI Chat-Files-Service
 */

class ConversationResponse {
  constructor(conversation) {
    this.id = conversation._id || conversation.id;
    this.name = conversation.name;
    this.type = conversation.type;
    this.description = conversation.description;
    this.participants = conversation.participants || [];
    this.createdBy = conversation.createdBy;
    this.settings = conversation.settings || {};
    this.lastMessage = conversation.lastMessage;
    this.lastActivity = conversation.lastActivity;
    this.unreadCount = conversation.unreadCount || 0;
    this.createdAt = conversation.createdAt;
    this.updatedAt = conversation.updatedAt;

    // Informations enrichies
    this.participantCount = this.participants.length;
    this.isGroup = this.type === 'group';
    this.isChannel = this.type === 'channel';
    this.hasUnreadMessages = this.unreadCount > 0;
  }

  static fromArray(conversations) {
    return conversations.map(conversation => new ConversationResponse(conversation));
  }

  toPlainObject() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
      participants: this.participants,
      createdBy: this.createdBy,
      settings: this.settings,
      lastMessage: this.lastMessage,
      lastActivity: this.lastActivity,
      unreadCount: this.unreadCount,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      stats: {
        participantCount: this.participantCount,
        hasUnreadMessages: this.hasUnreadMessages
      },
      flags: {
        isGroup: this.isGroup,
        isChannel: this.isChannel
      }
    };
  }

  // Version liste (moins de détails)
  toListObject() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      participantCount: this.participantCount,
      lastMessage: this.lastMessage ? {
        id: this.lastMessage.id,
        content: this.lastMessage.content?.substring(0, 100) + (this.lastMessage.content?.length > 100 ? '...' : ''),
        senderId: this.lastMessage.senderId,
        createdAt: this.lastMessage.createdAt
      } : null,
      lastActivity: this.lastActivity,
      unreadCount: this.unreadCount,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = ConversationResponse;
