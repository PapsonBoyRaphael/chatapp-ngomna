class UpdateMessageStatus {
  constructor(messageRepository, conversationRepository) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
  }

  async execute({ conversationId, receiverId, status }) {
    if (!conversationId || !receiverId || !status) {
      throw new Error('conversationId, receiverId et status sont requis');
    }

    const validStatuses = ['SENT', 'DELIVERED', 'READ'];
    if (!validStatuses.includes(status)) {
      throw new Error('Status invalide');
    }

    // Mettre à jour le statut des messages
    const updatedCount = await this.messageRepository.updateMessagesStatus(
      conversationId, 
      receiverId, 
      status
    );

    return {
      conversationId,
      receiverId,
      status,
      updatedCount
    };
  }
}

module.exports = UpdateMessageStatus;
