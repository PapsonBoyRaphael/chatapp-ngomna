// src/infrastructure/kafka/consumers/KafkaReplayConsumer.js
class KafkaReplayConsumer {
  constructor(kafkaInstance, chatHandler, redisManager) {
    this.kafkaInstance = kafkaInstance;
    this.chatHandler = chatHandler;
    this.redisManager = redisManager;
    this.consumers = new Map(); // userId -> consumer instance
  }

  /**
   * Créer un consumer temporaire pour rejouer les messages manquants
   */
  async createReplayConsumer(userId, conversationIds, fromTimestamp) {
    const consumerId = `replay-${userId}-${Date.now()}`;

    const consumer = this.kafkaInstance.consumer({
      groupId: consumerId, // Group ID unique pour rejouer depuis le début
      sessionTimeout: 60000,
      heartbeatInterval: 20000,
    });

    await consumer.connect();

    // S'abonner aux topics des conversations de l'utilisateur
    const topics = conversationIds.map((convId) => `chat.messages`);

    await consumer.subscribe({
      topic: "chat.messages",
      fromBeginning: true, // ← CRITIQUE: lire depuis le début
    });

    let deliveredCount = 0;
    const startTime = Date.now();
    const MAX_REPLAY_TIME = 30000; // 30 secondes max

    await consumer.run({
      eachMessage: async ({ message, topic, partition }) => {
        // Arrêter si ça prend trop de temps
        if (Date.now() - startTime > MAX_REPLAY_TIME) {
          await consumer.stop();
          return;
        }

        const messageData = JSON.parse(message.value.toString());

        // Filtrer les messages pour cet utilisateur
        if (
          this.shouldDeliverToUser(
            messageData,
            userId,
            conversationIds,
            fromTimestamp
          )
        ) {
          await this.deliverMessageToUser(userId, messageData);
          deliveredCount++;
        }

        // Si on a dépassé la limite de temps, arrêter
        if (Date.now() - startTime > MAX_REPLAY_TIME) {
          await consumer.stop();
        }
      },
    });

    // Planifier l'arrêt automatique après 30s
    setTimeout(async () => {
      try {
        await consumer.stop();
        await consumer.disconnect();
        console.log(
          `✅ Replay terminé pour ${userId}: ${deliveredCount} messages`
        );
      } catch (error) {
        console.warn(`⚠️ Erreur arrêt consumer replay:`, error.message);
      }
    }, MAX_REPLAY_TIME);

    this.consumers.set(consumerId, consumer);
    return { consumerId, deliveredCount };
  }

  shouldDeliverToUser(messageData, userId, conversationIds, fromTimestamp) {
    // 1. Vérifier le type de message
    if (messageData.eventType !== "MESSAGE_SENT") return false;

    // 2. Vérifier que l'utilisateur est destinataire
    const isRecipient = this.isUserRecipient(
      messageData,
      userId,
      conversationIds
    );
    if (!isRecipient) return false;

    // 3. Vérifier la date (messages après la déconnexion)
    const messageTime = new Date(messageData.timestamp).getTime();
    const fromTime = new Date(fromTimestamp).getTime();

    return messageTime >= fromTime;
  }

  isUserRecipient(messageData, userId, conversationIds) {
    const { conversationId, receiverId, participants } = messageData;

    // Message direct à l'utilisateur
    if (receiverId === userId) return true;

    // Message de groupe où l'utilisateur est participant
    if (conversationId && conversationIds.includes(conversationId)) return true;

    // Vérifier les participants du message
    if (participants && participants.includes(userId)) return true;

    return false;
  }

  async deliverMessageToUser(userId, messageData) {
    try {
      this.chatHandler.sendToUser(userId, "newMessage", {
        messageId: messageData.messageId,
        conversationId: messageData.conversationId,
        content: messageData.content,
        senderId: messageData.senderId,
        timestamp: messageData.timestamp,
        type: messageData.type,
        recovered: true, // Indique que c'est un message récupéré
      });

      console.log(
        `📨 Message replay livré à ${userId}: ${messageData.messageId}`
      );

      // Marquer comme livré dans Redis (seulement pour le suivi)
      await this.redisManager.set(
        `delivered:${userId}:${messageData.messageId}`,
        { timestamp: new Date().toISOString() },
        86400 // 24h
      );
    } catch (error) {
      console.warn(`⚠️ Erreur livraison message replay:`, error.message);
    }
  }
}
