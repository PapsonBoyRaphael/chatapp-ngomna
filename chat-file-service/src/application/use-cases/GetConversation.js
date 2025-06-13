class GetConversation {
  constructor(conversationRepository, messageRepository) {
    this.conversationRepository = conversationRepository;
    this.messageRepository = messageRepository;
  }

  async execute(conversationId, userId) {
    if (!conversationId || !userId) {
      throw new Error('conversationId et userId sont requis');
    }

    const conversation = await this.conversationRepository.getConversationById(conversationId);
    
    if (!conversation) {
      throw new Error('Conversation non trouvée');
    }

    // Vérifier que l'utilisateur fait partie de cette conversation
    if (!conversation.participants.includes(userId)) {
      throw new Error('Accès non autorisé à cette conversation');
    }

    // Ajouter le nombre de messages non lus
    const unreadCount = await this.messageRepository.getUnreadMessagesCount(conversationId, userId);
    
    return {
      ...conversation,
      unreadCount
    };
  }
}

module.exports = GetConversation;
