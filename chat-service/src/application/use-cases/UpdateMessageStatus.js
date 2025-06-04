class UpdateMessageStatus {
  constructor(messageRepository) {
    this.messageRepository = messageRepository;
  }

  async execute({ conversationId, receiverId, status }) {
    if (!["SENT", "DELIVERED", "READ"].includes(status)) {
      throw new Error("Statut invalide");
    }

    return await this.messageRepository.updateMessagesStatus(
      conversationId,
      receiverId,
      status
    );
  }
}

module.exports = UpdateMessageStatus;
