class SendMessage {
  constructor(
    messageRepository,
    conversationRepository,
    kafkaProducer = null,
    redisClient = null
  ) {
    this.messageRepository = messageRepository;
    this.conversationRepository = conversationRepository;
    this.kafkaProducer = kafkaProducer;
    this.redisClient = redisClient;
  }

  async execute(messageData) {
    try {
      const { content, senderId, conversationId, type = "TEXT" } = messageData;

      if (!content || !senderId || !conversationId) {
        throw new Error("Données de message incomplètes");
      }

      // Vérifier que la conversation existe
      const conversation = await this.conversationRepository.findById(
        conversationId
      );
      if (!conversation) {
        throw new Error("Conversation non trouvée");
      }

      // Créer le message
      const message = {
        content: String(content),
        senderId: String(senderId),
        conversationId: String(conversationId),
        type,
        status: "SENT",
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Sauvegarder le message
      const savedMessage = await this.messageRepository.save(message);

      // Mettre à jour la conversation
      await this.conversationRepository.updateLastMessage(conversationId, {
        content: message.content,
        timestamp: message.timestamp,
        senderId: message.senderId,
      });

      // Publier sur Kafka
      if (this.kafkaProducer) {
        try {
          await this.kafkaProducer.publishMessage({
            eventType: "MESSAGE_SENT",
            messageId: String(savedMessage.id),
            conversationId: String(conversationId),
            senderId: String(senderId),
            content: String(content),
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaError) {
          console.warn("⚠️ Erreur Kafka SendMessage:", kafkaError.message);
        }
      }

      // Invalider le cache Redis
      if (this.redisClient) {
        try {
          await this.redisClient.del(`messages:${conversationId}`);
          await this.redisClient.del(`conversation:${conversationId}`);
        } catch (redisError) {
          console.warn("⚠️ Erreur cache Redis:", redisError.message);
        }
      }

      return {
        id: savedMessage.id,
        content: savedMessage.content,
        senderId: savedMessage.senderId,
        conversationId: savedMessage.conversationId,
        type: savedMessage.type,
        status: savedMessage.status,
        timestamp: savedMessage.timestamp,
        createdAt: savedMessage.createdAt,
      };
    } catch (error) {
      console.error("❌ Erreur SendMessage use case:", error);
      throw error;
    }
  }
}

module.exports = SendMessage;
