class SendMessage {
  constructor(messageRepository, conversationRepository) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
  }

  async execute({ senderId, receiverId, content, conversationId, type = "TEXT", metadata = {} }) {
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
      type,
      metadata
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
