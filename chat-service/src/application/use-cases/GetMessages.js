class GetMessages {
  constructor(messageRepository) {
    this.messageRepository = messageRepository;
  }

  async execute({ conversationId, userId }) {
    if (!conversationId || !userId) {
      throw new Error("conversationId et userId sont requis");
    }

    return await this.messageRepository.getMessagesByConversationId(
      conversationId
    );
  }
}

module.exports = GetMessages;
