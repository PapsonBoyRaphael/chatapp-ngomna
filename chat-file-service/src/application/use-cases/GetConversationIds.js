class GetConversationIds {
  constructor(conversationRepository) {
    this.conversationRepository = conversationRepository;
  }

  /**
   * Retourne la liste des IDs de conversations où l'utilisateur est participant
   * @param {string} userId
   * @returns {Promise<string[]>}
   */
  async execute(userId) {
    if (!userId) throw new Error("userId requis");
    // Utilise findByParticipant du repository
    const result = await this.conversationRepository.findByParticipant(userId, {
      page: 1,
      limit: 1000, // ou plus selon besoin
      useCache: false,
    });
    // result peut être { conversations: [...] }
    const conversations = result.conversations || result || [];
    return conversations.map((conv) =>
      conv._id ? conv._id.toString() : conv.id?.toString()
    );
  }
}

module.exports = GetConversationIds;
