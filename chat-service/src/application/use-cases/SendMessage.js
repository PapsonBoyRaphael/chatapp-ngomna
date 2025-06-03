class SendMessage {
  constructor(messageRepository, conversationRepository) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
  }

  async execute({ senderId, receiverId, content, type = "TEXT" }) {
    const participants = [senderId, receiverId];
    const conversation =
      await this.conversationRepository.findOrCreateConversation(participants);

    const message = await this.messageRepository.saveMessage({
      conversationId: conversation._id,
      senderId,
      receiverId,
      content,
      type,
    });

    await this.conversationRepository.updateLastMessage(
      conversation._id,
      message._id
    );

    return message;
  }
}

module.exports = SendMessage;
