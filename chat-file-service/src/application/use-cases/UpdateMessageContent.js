class UpdateMessageContent {
  constructor(
    messageRepository,
    kafkaProducer = null,
    resilientMessageService = null,
  ) {
    this.messageRepository = messageRepository;
    this.kafkaProducer = kafkaProducer;
    this.resilientMessageService = resilientMessageService;
  }

  /**
   * Met à jour le contenu d'un message (texte uniquement)
   * @param {Object} params
   * @param {string} params.messageId
   * @param {string} params.newContent
   * @param {string} params.userId
   * @returns {Promise<Object>} message mis à jour
   */
  async execute({ messageId, newContent, userId }) {
    if (!messageId || !newContent || !userId) {
      throw new Error("messageId, newContent et userId sont requis");
    }

    // Récupérer le message
    const message = await this.messageRepository.findById(messageId);
    if (!message) {
      throw new Error("Message introuvable");
    }

    // Vérifier que l'utilisateur est bien l'auteur
    if (String(message.senderId) !== String(userId)) {
      throw new Error("Modification non autorisée");
    }

    // Mettre à jour le contenu et la date d'édition
    message.content = newContent;
    message.editedAt = new Date();
    message.updatedAt = new Date();

    // Historiser l'ancien contenu si besoin
    if (
      !message.metadata?.contentMetadata?.originalContent &&
      message.metadata?.contentMetadata
    ) {
      message.metadata.contentMetadata.originalContent = message.content;
    }

    // Sauvegarder la modification
    const updated = await this.messageRepository.save(message);

    // ✅ PUBLIER DANS REDIS STREAMS - STATUT EDITED
    if (this.resilientMessageService) {
      try {
        await this.resilientMessageService.publishMessageStatus(
          messageId,
          userId,
          "EDITED",
        );
        console.log(`📤 [EDITED] événement publié pour message ${messageId}`);
      } catch (streamErr) {
        console.error(
          "❌ Erreur publication statut EDITED:",
          streamErr.message,
        );
      }
    }

    return updated;
  }
}

module.exports = UpdateMessageContent;
