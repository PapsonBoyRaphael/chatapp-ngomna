class GetConversations {
  constructor(conversationRepository, messageRepository) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
  }

  async execute(userId) {
    if (!userId) {
      throw new Error('userId est requis');
    }

    const conversations = await this.conversationRepository.getConversationsByUserId(userId);
    
    // Pour chaque conversation, ajouter le nombre de messages non lus
    const conversationsWithUnread = await Promise.all(
      conversations.map(async (conversation) => {
        const unreadCount = await this.messageRepository.getUnreadMessagesCount(
          conversation._id, 
          userId
        );
        
        return {
          ...conversation,
          unreadCount
        };
      })
    );

    return conversationsWithUnread;
  }
}

module.exports = GetConversations;
