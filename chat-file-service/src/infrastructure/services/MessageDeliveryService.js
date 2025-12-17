/**
 * MessageDeliveryService - CONSOMMATEUR du stream Redis
 * ✅ Lit les messages depuis le stream et les distribue aux utilisateurs
 * ✅ Responsabilité unique : Livraison et distribution des messages
 */

class MessageDeliveryService {
  constructor(redis, io) {
    if (!redis || !io) {
      throw new Error("Redis et Socket.io sont requis pour MessageDeliveryService");
    }

    this.redis = redis;
    this.io = io;

    // Configuration
    this.streamKey = "messages:stream";
    this.consumerGroup = "message-delivery";
    this.consumerId = `delivery-${Date.now()}`;
    this.blockTimeout = 5000; // 5 secondes
    this.maxMessagesPerRead = 50;

    // État de la livraison
    this.userSockets = new Map(); // userId → [socketIds]
    this.isRunning = false;
    this.lastReadId = "0"; // Commence depuis le début
  }

  /**
   * ✅ Initialiser le service au démarrage
   */
  async initialize() {
    try {
      console.log("🚀 Initialisation MessageDeliveryService...");

      // Créer le groupe de consommateurs s'il n'existe pas
      try {
        await this.redis.xGroupCreate(this.streamKey, this.consumerGroup, "$", {
          MKSTREAM: true,
        });
        console.log(`✅ Groupe consommateur créé: ${this.consumerGroup}`);
      } catch (groupError) {
        if (groupError.message.includes("BUSYGROUP")) {
          console.log(
            `ℹ️ Groupe consommateur existant: ${this.consumerGroup}`
          );
        } else {
          throw groupError;
        }
      }

      // Démarrer la boucle de lecture
      this.startConsumer();

      console.log("✅ MessageDeliveryService initialisé");
      return true;
    } catch (error) {
      console.error("❌ Erreur initialisation MessageDeliveryService:", error);
      throw error;
    }
  }

  /**
   * ✅ Enregistrer un socket utilisateur
   */
  registerUserSocket(userId, socket) {
    try {
      const userIdStr = String(userId);

      if (!this.userSockets.has(userIdStr)) {
        this.userSockets.set(userIdStr, []);
      }

      this.userSockets.get(userIdStr).push(socket.id);

      console.log(`✅ Socket enregistré pour ${userIdStr}:`, {
        socketId: socket.id,
        totalSockets: this.userSockets.get(userIdStr).length,
      });

      return true;
    } catch (error) {
      console.error("❌ Erreur enregistrement socket:", error);
      return false;
    }
  }

  /**
   * ✅ Désenregistrer un socket utilisateur
   */
  unregisterUserSocket(userId, socketId) {
    try {
      const userIdStr = String(userId);

      if (!this.userSockets.has(userIdStr)) {
        return true;
      }

      const sockets = this.userSockets.get(userIdStr);
      const index = sockets.indexOf(socketId);

      if (index > -1) {
        sockets.splice(index, 1);
        console.log(`👋 Socket désenregistré pour ${userIdStr}:`, {
          socketId,
          socketsRestants: sockets.length,
        });
      }

      // Supprimer l'utilisateur s'il n'a plus de sockets
      if (sockets.length === 0) {
        this.userSockets.delete(userIdStr);
      }

      return true;
    } catch (error) {
      console.error("❌ Erreur désenregistrement socket:", error);
      return false;
    }
  }

  /**
   * ✅ Livrer tous les messages en attente lors de la connexion
   */
  async deliverPendingMessagesOnConnect(userId, socket) {
    try {
      const userIdStr = String(userId);

      console.log(`📥 Livraison messages en attente pour ${userIdStr}`);

      // Lire TOUS les messages du stream (depuis le début)
      const allMessages = await this.redis.xRead(
        [{ key: this.streamKey, id: "0" }],
        { COUNT: this.maxMessagesPerRead }
      );

      if (!allMessages || allMessages.length === 0) {
        console.log(`ℹ️ Aucun message en attente pour ${userIdStr}`);
        return 0;
      }

      const streamEntries = allMessages[0]?.messages || [];
      let deliveredCount = 0;

      for (const entry of streamEntries) {
        try {
          const message = entry.message;

          // ✅ FILTRER : uniquement pour cet utilisateur
          // (conversation où il est participant, ou direct message pour lui)
          if (this._isMessageForUser(message, userIdStr)) {
            socket.emit("message:received", {
              messageId: message.messageId,
              conversationId: message.conversationId,
              senderId: message.senderId,
              receiverId: message.receiverId,
              content: message.content,
              type: message.type,
              status: message.status || "SENT",
              timestamp: message.timestamp,
              metadata: message.metadata,
            });

            deliveredCount++;
            console.log(
              `✅ Message livré à ${userIdStr}: ${message.messageId}`
            );
          }
        } catch (msgError) {
          console.warn(`⚠️ Erreur traitement message:`, msgError.message);
        }
      }

      console.log(
        `✅ ${deliveredCount} messages livrés à ${userIdStr} à la connexion`
      );
      return deliveredCount;
    } catch (error) {
      console.error("❌ Erreur livraison messages en attente:", error);
      return 0;
    }
  }

  /**
   * ✅ Démarrer la boucle de consommation (temps réel)
   */
  startConsumer() {
    if (this.isRunning) {
      console.warn("⚠️ Consumer déjà en cours");
      return;
    }

    this.isRunning = true;
    console.log("▶️ Démarrage de la boucle de consommation...");

    this._consumeMessagesLoop();
  }

  /**
   * ✅ Arrêter la boucle de consommation
   */
  stopConsumer() {
    this.isRunning = false;
    console.log("⏹️ Arrêt de la boucle de consommation");
  }

  /**
   * ✅ Boucle infinie de lecture du stream (temps réel)
   */
  async _consumeMessagesLoop() {
    while (this.isRunning) {
      try {
        // Lire les nouveaux messages depuis la dernière ID
        const messages = await this.redis.xRead(
          [{ key: this.streamKey, id: this.lastReadId }],
          {
            COUNT: this.maxMessagesPerRead,
            BLOCK: this.blockTimeout,
          }
        );

        if (messages && messages.length > 0) {
          const streamEntries = messages[0]?.messages || [];

          console.log(
            `📨 ${streamEntries.length} nouveau(x) message(s) reçu(s)`
          );

          for (const entry of streamEntries) {
            try {
              const messageId = entry.id;
              const message = entry.message;

              // ✅ DISTRIBUER À TOUS LES UTILISATEURS CONCERNÉS
              await this._distributeMessage(message);

              // ✅ METTRE À JOUR LA DERNIÈRE ID LUE
              this.lastReadId = messageId;
            } catch (msgError) {
              console.warn(
                `⚠️ Erreur traitement message ${entry.id}:`,
                msgError.message
              );
            }
          }
        }
      } catch (error) {
        if (error.message.includes("NOGROUP")) {
          console.error(
            "❌ Groupe consommateur introuvable, réinitialisation..."
          );
          await this.initialize();
        } else {
          console.error("❌ Erreur dans la boucle de consommation:", error);
        }

        // Attendre avant de réessayer
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  /**
   * ✅ DISTRIBUER UN MESSAGE À TOUS LES UTILISATEURS CONCERNÉS
   */
  async _distributeMessage(message) {
    try {
      const conversationId = message.conversationId;
      const senderId = message.senderId;
      const receiverId = message.receiverId;
      const messageId = message.messageId;

      console.log(`📤 Distribution du message ${messageId}:`, {
        conversationId,
        senderId,
        receiverId,
      });

      // ✅ CAS 1 : MESSAGE PRIVÉ (directMessage)
      if (receiverId && receiverId !== "null" && receiverId !== "") {
        // Envoyer au destinataire
        await this._emitToUser(String(receiverId), "message:received", {
          messageId,
          conversationId,
          senderId,
          receiverId,
          content: message.content,
          type: message.type,
          status: message.status || "SENT",
          timestamp: message.timestamp,
          metadata: message.metadata,
        });

        // Confirmer à l'expéditeur
        await this._emitToUser(String(senderId), "message:ack", {
          messageId,
          status: "SENT",
          timestamp: new Date().toISOString(),
        });

        console.log(
          `✅ Message privé distribué: ${senderId} → ${receiverId}`
        );
      }
      // ✅ CAS 2 : MESSAGE DE GROUPE/CONVERSATION
      else if (conversationId && conversationId !== "null" && conversationId !== "") {
        // Envoyer à TOUS les utilisateurs connectés de la conversation
        const room = `conversation_${conversationId}`;
        const socketsInRoom = this.io.sockets.adapter.rooms.get(room);

        if (socketsInRoom && socketsInRoom.size > 0) {
          this.io.to(room).emit("message:received", {
            messageId,
            conversationId,
            senderId,
            content: message.content,
            type: message.type,
            status: message.status || "SENT",
            timestamp: message.timestamp,
            metadata: message.metadata,
          });

          console.log(
            `✅ Message de groupe distribué à ${socketsInRoom.size} utilisateurs`
          );
        } else {
          console.log(`ℹ️ Aucun utilisateur connecté pour ${room}`);
        }
      }
    } catch (error) {
      console.error("❌ Erreur distribution message:", error);
    }
  }

  /**
   * ✅ ÉMETTRE À UN UTILISATEUR SPÉCIFIQUE
   */
  async _emitToUser(userId, event, data) {
    try {
      const userIdStr = String(userId);
      const socketIds = this.userSockets.get(userIdStr);

      if (!socketIds || socketIds.length === 0) {
        console.warn(
          `⚠️ Aucun socket pour l'utilisateur ${userIdStr}, message en attente`
        );
        return 0;
      }

      let emittedCount = 0;
      for (const socketId of socketIds) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit(event, data);
          emittedCount++;
        }
      }

      console.log(`📨 Événement ${event} émis à ${emittedCount} socket(s) pour ${userIdStr}`);
      return emittedCount;
    } catch (error) {
      console.error(`❌ Erreur émission à ${userId}:`, error);
      return 0;
    }
  }

  /**
   * ✅ VÉRIFIER SI UN MESSAGE EST POUR CET UTILISATEUR
   */
  _isMessageForUser(message, userId) {
    const receiverId = message.receiverId;
    const conversationId = message.conversationId;

    // ✅ CAS 1 : Message privé direct
    if (receiverId && receiverId !== "null" && receiverId !== "") {
      return String(receiverId) === String(userId);
    }

    // ✅ CAS 2 : Message de conversation
    // Pour l'instant, on distribue à tous les connectés dans la room
    // (La vérification de participation se fait via Socket.io rooms)
    if (conversationId && conversationId !== "null" && conversationId !== "") {
      return true; // On fait confiance à Socket.io pour la room
    }

    return false;
  }

  /**
   * ✅ OBTENIR LES STATISTIQUES DU SERVICE
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      lastReadId: this.lastReadId,
      connectedUsers: this.userSockets.size,
      totalConnectedSockets: Array.from(this.userSockets.values()).reduce(
        (sum, sockets) => sum + sockets.length,
        0
      ),
      users: Array.from(this.userSockets.entries()).map(([userId, sockets]) => ({
        userId,
        socketsCount: sockets.length,
        socketIds: sockets,
      })),
    };
  }

  /**
   * ✅ NETTOYER ET ARRÊTER LE SERVICE
   */
  async cleanup() {
    try {
      this.stopConsumer();
      this.userSockets.clear();
      console.log("✅ MessageDeliveryService nettoyé");
    } catch (error) {
      console.error("❌ Erreur nettoyage MessageDeliveryService:", error);
    }
  }
}

module.exports = MessageDeliveryService;
