class SendMessage {
  constructor(messageRepository, conversationRepository) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
  }

  async execute({ senderId, receiverId, content, conversationId }) {
    // Si pas de conversationId, c'est un nouveau chat
    if (!conversationId) {
      const conversation =
        await this.conversationRepository.findOrCreateConversation([
          senderId,
          receiverId,
        ]);
      conversationId = conversation._id;
    }

    const message = await this.messageRepository.saveMessage({
      conversationId,
      senderId,
      receiverId,
      content,
    });

    await this.conversationRepository.updateLastMessage(
      conversationId,
      message._id
    );

    return {
      ...message.toObject(),
      conversationId,
    };
  }
}

module.exports = SendMessage;
