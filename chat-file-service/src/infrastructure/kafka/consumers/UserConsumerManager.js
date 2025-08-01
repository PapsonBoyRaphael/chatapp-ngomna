// Nouveau fichier: src/infrastructure/kafka/consumers/UserConsumerManager.js
class UserConsumerManager {
  constructor(kafkaInstance) {
    this.kafkaInstance = kafkaInstance;
    this.userConsumers = new Map(); // userId -> consumer instance
    this.isEnabled = !!kafkaInstance;
  }

  async createUserConsumer(userId, socket) {
    if (!this.isEnabled) {
      throw new Error(
        "Kafka non disponible pour créer un consumer utilisateur"
      );
    }

    // Éviter les doublons
    if (this.userConsumers.has(userId)) {
      console.log(`⚠️ Consumer utilisateur ${userId} existe déjà`);
      return this.userConsumers.get(userId);
    }

    try {
      const consumer = this.kafkaInstance.consumer({
        groupId: `user-consumer-${userId}-${Date.now()}`,
        maxWaitTimeInMs: 3000,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
      });

      await consumer.connect();
      await consumer.subscribe({
        topic: "chat.messages",
        fromBeginning: false, // Seulement les nouveaux messages
      });

      // Configuration du traitement des messages
      await consumer.run({
        eachMessage: async ({ message }) => {
          try {
            const msg = JSON.parse(message.value.toString());

            // Filtrer les messages pour cet utilisateur
            if (
              this.shouldReceiveMessage(msg, userId, socket.userConversations)
            ) {
              // Envoyer le message au client
              socket.emit("newMessage", msg);

              // Marquer automatiquement comme DELIVERED
              if (socket.chatHandler?.updateMessageStatusUseCase) {
                await socket.chatHandler.updateMessageStatusUseCase.markSingleMessage(
                  {
                    messageId: msg.messageId,
                    receiverId: userId,
                    status: "DELIVERED",
                  }
                );
              }
            }
          } catch (error) {
            console.warn(
              "⚠️ Erreur traitement message utilisateur:",
              error.message
            );
          }
        },
      });

      // Stocker le consumer
      this.userConsumers.set(userId, consumer);
      console.log(`✅ Consumer personnel créé pour utilisateur ${userId}`);

      return consumer;
    } catch (error) {
      console.error(
        `❌ Erreur création consumer utilisateur ${userId}:`,
        error
      );
      throw error;
    }
  }

  shouldReceiveMessage(message, userId, userConversations) {
    // Messages directs à l'utilisateur
    if (message.receiverId === userId) {
      return true;
    }

    // Messages dans les conversations de l'utilisateur
    if (message.conversationId && userConversations) {
      return userConversations.includes(message.conversationId);
    }

    // Messages de diffusion où l'utilisateur est destinataire
    if (
      message.eventType === "BROADCAST_MESSAGE" &&
      message.recipients &&
      message.recipients.includes(userId)
    ) {
      return true;
    }

    return false;
  }

  async removeUserConsumer(userId) {
    const consumer = this.userConsumers.get(userId);
    if (consumer) {
      try {
        await consumer.stop();
        await consumer.disconnect();
        this.userConsumers.delete(userId);
        console.log(
          `✅ Consumer personnel supprimé pour utilisateur ${userId}`
        );
      } catch (error) {
        console.warn(
          `⚠️ Erreur suppression consumer ${userId}:`,
          error.message
        );
      }
    }
  }

  async removeAllUserConsumers() {
    for (const [userId, consumer] of this.userConsumers) {
      await this.removeUserConsumer(userId);
    }
  }

  getUserConsumerCount() {
    return this.userConsumers.size;
  }
}

module.exports = UserConsumerManager;
