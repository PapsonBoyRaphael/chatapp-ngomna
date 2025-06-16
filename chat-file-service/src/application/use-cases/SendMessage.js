class SendMessage {
  constructor(messageRepository, conversationRepository, kafkaProducer = null) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
    this.kafkaProducer = kafkaProducer; // Ajout du producer Kafka
  }

  async execute({
    senderId,
    receiverId,
    content,
    conversationId,
    type = "TEXT",
    metadata = {},
  }) {
    try {
      // Validation renforcée
      if (!senderId || !receiverId || !content?.trim()) {
        throw new Error("senderId, receiverId et content sont requis");
      }

      // Créer ou récupérer la conversation
      if (!conversationId) {
        const conversation =
          await this.conversationRepository.findOrCreateConversation([
            senderId,
            receiverId,
          ]);
        conversationId = conversation._id;
      }

      // Sauvegarder le message avec métadonnées enrichies
      const enrichedMetadata = {
        ...metadata,
        timestamp: new Date().toISOString(),
        messageId: `msg_${Date.now()}_${senderId}`,
        serverId: process.env.SERVER_ID || "default",
      };

      const message = await this.messageRepository.saveMessage({
        conversationId,
        senderId,
        receiverId,
        content: content.trim(),
        type,
        metadata: enrichedMetadata,
        status: "SENT",
      });

      // Mettre à jour la conversation
      await this.conversationRepository.updateLastMessage(
        conversationId,
        message._id
      );

      const messageData = {
        ...message.toObject(),
        conversationId,
      };

      // 🚀 PUBLIER DANS KAFKA
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "MESSAGE_SENT",
            messageId: message._id,
            conversationId,
            senderId,
            receiverId,
            content: content.trim(),
            type,
            metadata: enrichedMetadata,
            timestamp: new Date().toISOString(),
            // Données pour les notifications
            notificationData: {
              title: `Nouveau message`,
              body: content.substring(0, 100),
              data: {
                conversationId,
                senderId,
                messageId: message._id,
              },
            },
          });

          console.log(`📤 Message publié dans Kafka: ${message._id}`);
        } catch (kafkaError) {
          // Ne pas faire échouer l'envoi si Kafka échoue
          console.warn(
            "⚠️ Erreur publication Kafka (non bloquant):",
            kafkaError.message
          );
        }
      }

      return messageData;
    } catch (error) {
      console.error("❌ Erreur SendMessage:", error);
      throw error;
    }
  }
}

module.exports = SendMessage;
