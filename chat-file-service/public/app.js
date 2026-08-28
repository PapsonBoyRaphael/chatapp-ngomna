// Configuration
const CONFIG = {
  SERVER_URL: "http://localhost:8003",
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 2000,
  PING_INTERVAL: 30000, // Intervalle de 30 secondes pour les pings
};

// Variables globales
let socket = null;
let isAuthenticated = false;
let currentUser = null;
let reconnectAttempts = 0;
let pingInterval = null;

function getCookie(name) {
  if (typeof document === "undefined") {
    return null;
  }

  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);

  if (parts.length === 2) {
    const cookieValue = parts.pop().split(";").shift();
    return cookieValue ? decodeURIComponent(cookieValue) : null;
  }

  return null;
}

// ✅ AJOUTER CES VARIABLES GLOBALES AU DÉBUT DE app.js (après les variables existantes)
let receivedMessages = [];
let onlineUsers = new Map();
let typingUsers = new Map();
let currentMessageTab = "all";
let autoScroll = true;
let messageCount = 0;

// ========================================
// INITIALISATION ET CONNEXION
// ========================================

document.addEventListener("DOMContentLoaded", () => {
  log("🚀 Initialisation du testeur Socket.IO", "info");
  initializeSocket();
  setupPingInterval();

  const fileForm = document.getElementById("fileUploadForm");
  if (fileForm) {
    fileForm.addEventListener("submit", handleFileUpload);
  }
});

function initializeSocket() {
  try {
    updateConnectionStatus("connecting");
    log("🔌 Tentative de connexion au serveur...", "info");

    socket = io(CONFIG.SERVER_URL, {
      transports: ["websocket", "polling"],
      timeout: 5000,
      reconnection: true,
      reconnectionAttempts: CONFIG.RECONNECT_ATTEMPTS,
      reconnectionDelay: CONFIG.RECONNECT_DELAY,
    });

    setupSocketEvents();
  } catch (error) {
    log(`❌ Erreur lors de l'initialisation: ${error.message}`, "error");
    updateConnectionStatus("disconnected");
  }
}

function setupSocketEvents() {
  // ========================================
  // ÉVÉNEMENTS DE CONNEXION
  // ========================================

  socket.on("connect", () => {
    log(`✅ Connecté au serveur (ID: ${socket.id})`, "success");
    updateConnectionStatus("connected");
    reconnectAttempts = 0;
  });

  socket.on("disconnect", (reason) => {
    log(`🔌 Déconnecté du serveur (Raison: ${reason})`, "warning");
    updateConnectionStatus("disconnected");
    isAuthenticated = false;
    updateAuthStatus("");
  });

  socket.on("connect_error", (error) => {
    log(`❌ Erreur de connexion: ${error.message}`, "error");
    updateConnectionStatus("disconnected");
    reconnectAttempts++;

    if (reconnectAttempts < CONFIG.RECONNECT_ATTEMPTS) {
      log(
        `🔄 Tentative de reconnexion ${reconnectAttempts}/${CONFIG.RECONNECT_ATTEMPTS}`,
        "info",
      );
    }
  });

  socket.on("reconnect", (attemptNumber) => {
    log(`🔄 Reconnecté après ${attemptNumber} tentative(s)`, "success");
    reconnectAttempts = 0;
  });

  // ========================================
  // ÉVÉNEMENTS D'AUTHENTIFICATION
  // ========================================

  socket.on("authenticated", (data) => {
    log("🔐 Authentification réussie", "success", data);
    isAuthenticated = true;
    currentUser = {
      userId: data.userId,
      matricule: data.matricule,
    };
    updateAuthStatus(
      `✅ Authentifié: ${data.matricule} (${data.userId})`,
      "success",
    );
    // Auto-enregistrement de la clé E2EE après authentification
    console.log("📋 Appel de autoRegisterE2EEKey()...");
    autoRegisterE2EEKey().catch((err) => {
      console.error("❌ Erreur dans autoRegisterE2EEKey:", err);
      log(`❌ Erreur E2EE auto-register: ${err.message}`, "error");
    });
  });

  socket.on("auth_error", (data) => {
    log("❌ Erreur d'authentification", "error", data);
    isAuthenticated = false;
    currentUser = null;
    updateAuthStatus(
      `❌ Erreur: ${data.message} (Code: ${data.code})`,
      "error",
    );
  });

  // ========================================
  // ÉVÉNEMENTS DE MESSAGES AMÉLIORÉS
  // ========================================

  socket.on("newMessage", (data) => {
    log("💬 Nouveau message reçu", "info", data);

    // ✅ MARQUER AUTOMATIQUEMENT LE MESSAGE COMME LIVRÉ
    if (data.messageId && data.conversationId) {
      marquerCommeDelivered(data.messageId, data.conversationId);
    }

    const title = data.isForwarded
      ? "↪️📤 Message Transféré Reçu"
      : "💬 Nouveau Message";

    const displayData = {
      sender: data.senderName || data.senderId,
      content: data.content,
      conversation: data.conversationId,
      status: data.status || "SENT",
    };

    if (data.isForwarded) {
      displayData.isForwarded = true;
      displayData.forwardedFrom = data.forwardedFrom || "N/A";
      displayData.originalSenderId = data.originalSenderId || "N/A";
    }

    addReceivedMessage("message", title, data, displayData);
  });

  socket.on("message_sent", (data) => {
    log("✅ Message envoyé avec succès", "success", data);
    addReceivedMessage("message", "✅ Message Envoyé", data, {
      status: "Envoyé avec succès",
      messageId: data.messageId || data.id,
      conversation: data.conversationId,
    });
  });

  socket.on("message_error", (data) => {
    log("❌ Erreur envoi message", "error", data);
    addReceivedMessage("error", "❌ Erreur Message", data, {
      error: data.message || data.error,
      code: data.code,
    });
  });

  // ========================================
  // ÉVÉNEMENTS UTILISATEURS AMÉLIORÉS
  // ========================================

  socket.on("user_connected", (data) => {
    log("👤 Utilisateur connecté", "info", data);

    // Ajouter à la liste des utilisateurs en ligne
    if (data.userId && data.userId !== currentUser?.userId) {
      onlineUsers.set(data.userId, {
        userId: data.userId,
        matricule: data.matricule || data.userId,
        socketId: data.socketId,
        connectedAt: new Date(),
        status: "online",
      });
      updateOnlineUsersDisplay();
    }

    addReceivedMessage("user", "👤 Utilisateur Connecté", data, {
      user: data.matricule || data.userId,
      socketId: data.socketId,
    });
  });

  socket.on("user_disconnected", (data) => {
    log("👋 Utilisateur déconnecté", "info", data);

    // Retirer de la liste des utilisateurs en ligne
    if (data.userId) {
      onlineUsers.delete(data.userId);
      updateOnlineUsersDisplay();

      // Retirer des indicateurs de frappe
      typingUsers.delete(data.userId);
      updateTypingDisplay();
    }

    addReceivedMessage("user", "👋 Utilisateur Déconnecté", data, {
      user: data.matricule || data.userId,
      reason: data.reason,
    });
  });

  // ========================================
  // ÉVÉNEMENTS DE FRAPPE AMÉLIORÉS
  // ========================================

  socket.on("typing", (data) => {
    log("⌨️ Indicateur de frappe", "info", data);

    if (data.userId && data.userId !== currentUser?.userId) {
      if (data.isTyping) {
        typingUsers.set(data.userId, {
          userId: data.userId,
          userName: data.userName || data.matricule || data.userId,
          conversationId: data.conversationId,
          startedAt: new Date(),
        });
      } else {
        typingUsers.delete(data.userId);
      }
      updateTypingDisplay();
    }

    addReceivedMessage("typing", "⌨️ Frappe", data, {
      user: data.userName || data.userId,
      conversation: data.conversationId,
      typing: data.isTyping ? "commence à écrire" : "arrête d'écrire",
    });
  });

  socket.on("stopTyping", (data) => {
    log("⏹️ Arrêt frappe", "info", data);

    if (data.userId) {
      typingUsers.delete(data.userId);
      updateTypingDisplay();
    }
  });

  // ========================================
  // ÉVÉNEMENTS MESSAGE:GROUP (Messages de groupe)
  // ========================================

  socket.on("message:group", (data) => {
    log("📬 Message groupe reçu", "info", data);

    // ✅ MARQUER AUTOMATIQUEMENT LE MESSAGE COMME LIVRÉ
    if (data.messageId && data.conversationId) {
      marquerCommeDelivered(data.messageId, data.conversationId);
    }

    addReceivedMessage("message", "📬 Message Groupe", data, {
      sender: data.senderName || data.senderId,
      content: data.content,
      conversation: data.conversationId,
      status: data.status || "SENT",
    });
  });

  // ========================================
  // ÉVÉNEMENTS MESSAGES QUICK/FULL LOAD
  // ========================================

  socket.on("messages:quick", (data) => {
    log("⚡ Messages Quick Load reçus", "info", data);
    displayMessages(data);
  });

  socket.on("messages:full", (data) => {
    log("📚 Messages Full Load reçus", "info", data);
    displayMessages(data);

    // ✅ MARQUER TOUS LES MESSAGES COMME LUS
    if (data.messages && Array.isArray(data.messages)) {
      data.messages.forEach((msg) => {
        if (msg._id && data.conversationId) {
          marquerCommeRead(msg._id, data.conversationId);
        }
      });
    }
  });

  // ========================================
  // ÉVÉNEMENTS DE FRAPPE REÇUS (broadcast)
  // ========================================

  socket.on("user:typing", (data) => {
    log("⌨️ Utilisateur en train de taper (broadcast)", "info", data);

    if (data.userId && data.userId !== currentUser?.userId) {
      typingUsers.set(data.userId, {
        userId: data.userId,
        userName: data.userName || data.matricule || data.userId,
        conversationId: data.conversationId,
        startedAt: new Date(),
      });
      updateTypingDisplay();
    }
  });

  socket.on("user:stopTyping", (data) => {
    log("⏹️ Utilisateur a arrêté de taper (broadcast)", "info", data);

    if (data.userId) {
      typingUsers.delete(data.userId);
      updateTypingDisplay();
    }
  });

  // ========================================
  // ÉVÉNEMENTS UTILISATEURS EN LIGNE
  // ========================================

  socket.on("onlineUsers", (data) => {
    log("👥 Liste utilisateurs en ligne", "info", data);

    // Mettre à jour la liste complète
    onlineUsers.clear();
    if (data.users && Array.isArray(data.users)) {
      data.users.forEach((user) => {
        if (user.userId !== currentUser?.userId) {
          onlineUsers.set(user.userId, {
            userId: user.userId,
            matricule: user.matricule || user.userId,
            socketId: user.socketId,
            status: "online",
            connectedAt: user.connectedAt
              ? new Date(user.connectedAt)
              : new Date(),
          });
        }
      });
    }
    updateOnlineUsersDisplay();

    addReceivedMessage("user", "👥 Utilisateurs En Ligne", data, {
      count: data.users?.length || 0,
      users: data.users?.map((u) => u.matricule || u.userId).join(", "),
    });
  });

  // ========================================
  // ÉVÉNEMENTS CONVERSATIONS
  // ========================================

  socket.on("conversationJoined", (data) => {
    log("➕ Conversation rejointe", "success", data);
    addReceivedMessage("message", "➕ Conversation Rejointe", data, {
      conversation: data.conversationId,
      participants: data.participants?.length || 0,
    });
  });

  socket.on("conversationLeft", (data) => {
    log("➖ Conversation quittée", "info", data);
    addReceivedMessage("message", "➖ Conversation Quittée", data, {
      conversation: data.conversationId,
    });
  });

  // ✅ ÉVÉNEMENTS DE MESSAGES CHARGÉS
  socket.on("messagesLoaded", (data) => {
    log("✅ Messages chargés", "success", data);
    displayMessages(data);
    addReceivedMessage("message", "✅ Messages Chargés", data, {
      total: data.total || 0,
      hasMore: data.hasMore || false,
      processingTime: data.processingTime || "N/A",
    });
  });

  socket.on("messages:quick", (data) => {
    log("⚡ Quick load messages reçus", "success", data);
    displayMessages(data);
    addReceivedMessage("message", "⚡ Quick Load Messages", data, {
      total: data.messages?.length || 0,
      conversationId: data.conversationId,
      fromCache: data.fromCache || false,
    });
  });

  socket.on("messages:full", (data) => {
    log("📚 Full load messages reçus", "success", data);
    displayMessages(data);
    addReceivedMessage("message", "📚 Full Load Messages", data, {
      total: data.messages?.length || 0,
      hasMore: data.hasMore || false,
      conversationId: data.conversationId,
    });
  });

  socket.on("messages:error", (error) => {
    log("❌ Erreur récupération messages", "error", error);
    addReceivedMessage("error", "❌ Erreur Messages", error, {
      message: error.error || error.message,
      code: error.code,
    });
    alert(`Erreur: ${error.error || error.message}`);
  });

  // ========================================
  // ÉVÉNEMENTS GÉNÉRIQUES
  // ========================================

  socket.on("pong", () => {
    log("🏓 Pong reçu du serveur", "info");
  });

  socket.on("error", (error) => {
    log("❌ Erreur Socket.IO", "error", error);
  });

  // Capturer tous les événements non gérés
  const originalEmit = socket.emit;
  socket.emit = function (event, ...args) {
    log(`📤 Émission: ${event}`, "info", args.length > 0 ? args[0] : null);
    return originalEmit.apply(socket, [event, ...args]);
  };

  const originalOn = socket.on;
  socket.on = function (event, callback) {
    return originalOn.call(socket, event, (...args) => {
      if (
        ![
          "connect",
          "disconnect",
          "connect_error",
          "reconnect",
          "authenticated",
          "auth_error",
          "newMessage",
          "message_sent",
          "message_error",
          "user_connected",
          "user_disconnected",
          "typing",
          "pong",
          "error",
        ].includes(event)
      ) {
        log(
          `📥 Événement reçu: ${event}`,
          "info",
          args.length > 0 ? args[0] : null,
        );
      }
      callback(...args);
    });
  };

  // ✅ ÉVÉNEMENTS DE STATUTS DE MESSAGES
  socket.on("messageDelivered", (data) => {
    log("📬 Message marqué comme livré", "success", data);
    addReceivedMessage("message", "📬 Message Livré", data, {
      messageId: data.messageId,
      status: data.status,
      time: new Date(data.timestamp).toLocaleTimeString(),
    });
  });

  socket.on("messageRead", (data) => {
    log("📖 Message marqué comme lu", "success", data);
    addReceivedMessage("message", "📖 Message Lu", data, {
      messageId: data.messageId,
      status: data.status,
      time: new Date(data.timestamp).toLocaleTimeString(),
    });
  });

  socket.on("messageStatusChanged", (data) => {
    log("🔄 Statut de message changé", "info", data);
    addReceivedMessage("message", "🔄 Statut Changé", data, {
      messageId: data.messageId,
      status: data.status,
      userId: data.userId,
      time: new Date(data.timestamp).toLocaleTimeString(),
    });
  });

  socket.on("conversationRead", (data) => {
    log("📚 Conversation marquée comme lue", "success", data);
    addReceivedMessage("message", "📚 Conversation Lue", data, {
      conversationId: data.conversationId,
      readBy: data.readBy,
      readCount: data.readCount,
      time: new Date(data.timestamp).toLocaleTimeString(),
    });
  });

  socket.on("conversationMarkedRead", (data) => {
    log("✅ Confirmation conversation lue", "success", data);
    addReceivedMessage("message", "✅ Conversation Lue", data, {
      conversationId: data.conversationId,
      readCount: data.readCount,
      message: data.message || "Messages marqués comme lus",
      time: new Date(data.timestamp).toLocaleTimeString(),
    });
  });

  socket.on("messageStatus", (data) => {
    log("📊 Statut du message", "info", data);
    addReceivedMessage("message", "📊 Statut Message", data, {
      messageId: data.messageId,
      status: data.status,
      deliveredAt: data.deliveredAt
        ? new Date(data.deliveredAt).toLocaleString()
        : "Non livré",
      readAt: data.readAt ? new Date(data.readAt).toLocaleString() : "Non lu",
    });
  });

  socket.on("status_error", (data) => {
    log("❌ Erreur de statut", "error", data);
    addReceivedMessage("error", "❌ Erreur Statut", data, {
      type: data.type,
      message: data.message,
      code: data.code,
    });
  });

  // ✅ ACCUSÉ DE RÉCEPTION AUTOMATIQUE POUR LES NOUVEAUX MESSAGES
  socket.on("newMessage", (data) => {
    // ... traitement existant ...

    // ✅ ENVOYER ACCUSÉ DE RÉCEPTION AUTOMATIQUE SI REQUIS
    if (data.requiresDeliveryReceipt && data.senderId !== currentUser?.userId) {
      setTimeout(() => {
        socket.emit("messageReceived", {
          messageId: data.id,
          conversationId: data.conversationId,
        });
        log("✅ Accusé de réception envoyé automatiquement", "info", {
          messageId: data.id,
        });
      }, 200); // Petit délai pour éviter les conflits
    }

    const title = data.isForwarded
      ? "↪️📤 Message Transféré Reçu"
      : "💬 Nouveau Message";

    const displayData = {
      sender: data.senderName || data.senderId,
      content: data.content,
      conversation: data.conversationId,
      requiresReceipt: data.requiresDeliveryReceipt,
    };

    if (data.isForwarded) {
      displayData.isForwarded = true;
      displayData.forwardedFrom = data.forwardedFrom || "N/A";
      displayData.originalSenderId = data.originalSenderId || "N/A";
    }

    // Traitement existant...
    addReceivedMessage("message", title, data, displayData);
  });

  // ✅ ÉVÉNEMENTS GROUPE
  socket.on("group:created", (data) => {
    log("✅ Groupe créé avec succès", "success", data);
    addReceivedMessage("group", "👥 Groupe Créé", data, {
      groupId: data.group?.id,
      groupName: data.group?.name,
      participants: data.group?.participantCount,
    });
    alert(`Groupe "${data.group?.name}" créé avec succès !`);
  });

  socket.on("group:error", (data) => {
    log("❌ Erreur création groupe", "error", data);
    addReceivedMessage("error", "❌ Erreur Groupe", data, {
      error: data.error,
      code: data.code,
    });
    alert(`Erreur: ${data.error}`);
  });

  socket.on("group:invitation", (data) => {
    log("📨 Invitation au groupe", "info", data);
    addReceivedMessage("group", "📨 Invitation Groupe", data, {
      groupId: data.group?.id,
      groupName: data.group?.name,
      invitedBy: data.invitedBy?.matricule,
    });
  });

  // ✅ ÉVÉNEMENTS DIFFUSION
  socket.on("broadcast:created", (data) => {
    log("✅ Liste de diffusion créée", "success", data);

    const broadcastId = data.broadcast?.id || data.conversationId;
    const broadcastName = data.broadcast?.name;
    const recipientCount = data.broadcast?.recipientCount;
    const privateConvs =
      data.broadcast?.broadcastMetadata?.privateConversations || [];

    addReceivedMessage("broadcast", "📢 Diffusion Créée", data, {
      broadcastId,
      broadcastName,
      recipients: recipientCount,
      privateConvsLinked: privateConvs.length,
    });

    // ✅ Auto-remplir les champs pour les tests suivants
    const convIdEl = document.getElementById("broadcastConversationId");
    const fetchEl = document.getElementById("broadcastFetchConversationId");
    const metaEl = document.getElementById("broadcastMetaConvId");
    if (broadcastId) {
      if (convIdEl) convIdEl.value = broadcastId;
      if (fetchEl) fetchEl.value = broadcastId;
      if (metaEl) metaEl.value = broadcastId;
    }

    const statusDiv = document.getElementById("createBroadcastStatus");
    if (statusDiv) {
      statusDiv.textContent = `✅ Diffusion "${broadcastName}" créée ! ${privateConvs.length} conv(s) privée(s) liée(s). ID: ${broadcastId}`;
      statusDiv.className = "status success";
    }

    log(
      `📢 broadcastMetadata: ${privateConvs.length} conv(s) privée(s)`,
      "success",
      privateConvs,
    );
  });

  socket.on("broadcast:error", (data) => {
    log("❌ Erreur création diffusion", "error", data);
    addReceivedMessage("error", "❌ Erreur Diffusion", data, {
      error: data.error,
      code: data.code,
    });
    alert(`Erreur: ${data.error}`);
  });

  // ========================================
  // ✅ ÉVÉNEMENTS GESTION PARTICIPANTS
  // ========================================

  socket.on("participant:added", (data) => {
    const ids = data.participantIds || [data.participantId];
    const failedCount = data.failed?.length || 0;
    log(`✅ ${ids.length} participant(s) ajouté(s)`, "success", data);
    addReceivedMessage("message", "➕ Participant(s) Ajouté(s)", data, {
      conversationId: data.conversationId,
      ajoutés: ids.join(", "),
      échecs:
        failedCount > 0
          ? data.failed.map((f) => `${f.participantId}: ${f.error}`).join("; ")
          : "Aucun",
      addedBy: data.addedByMatricule || data.addedBy,
    });
    const statusDiv = document.getElementById("participantStatus");
    if (statusDiv) {
      let msg = `✅ ${ids.length} participant(s) ajouté(s) avec succès`;
      if (failedCount > 0) {
        msg += ` | ⚠️ ${failedCount} échec(s)`;
      }
      statusDiv.textContent = msg;
      statusDiv.className =
        failedCount > 0 ? "status warning" : "status success";
    }
  });

  socket.on("participant:removed", (data) => {
    const ids = data.participantIds || [data.participantId];
    const failedCount = data.failed?.length || 0;
    log(`✅ ${ids.length} participant(s) retiré(s)`, "success", data);
    addReceivedMessage("message", "➖ Participant(s) Retiré(s)", data, {
      conversationId: data.conversationId,
      retirés: ids.join(", "),
      échecs:
        failedCount > 0
          ? data.failed.map((f) => `${f.participantId}: ${f.error}`).join("; ")
          : "Aucun",
      removedBy: data.removedByMatricule || data.removedBy,
    });
    const statusDiv = document.getElementById("participantStatus");
    if (statusDiv) {
      let msg = `✅ ${ids.length} participant(s) retiré(s) avec succès`;
      if (failedCount > 0) {
        msg += ` | ⚠️ ${failedCount} échec(s)`;
      }
      statusDiv.textContent = msg;
      statusDiv.className =
        failedCount > 0 ? "status warning" : "status success";
    }
  });

  socket.on("participant:left", (data) => {
    log("👋 Participant a quitté", "info", data);
    addReceivedMessage("message", "👋 Participant Parti", data, {
      conversationId: data.conversationId,
      userId: data.userId,
      matricule: data.matricule,
    });
  });

  socket.on("participant:error", (data) => {
    log("❌ Erreur participant", "error", data);
    addReceivedMessage("error", "❌ Erreur Participant", data, {
      error: data.error,
      code: data.code,
    });
    const statusDiv = document.getElementById("participantStatus");
    if (statusDiv) {
      statusDiv.textContent = `❌ ${data.error}`;
      statusDiv.className = "status error";
    }
  });

  // ========================================
  // ✅ ÉVÉNEMENTS QUITTER CONVERSATION
  // ========================================

  socket.on("conversation:left_permanent", (data) => {
    log("🚪 Conversation quittée définitivement", "success", data);
    addReceivedMessage("message", "🚪 Conversation Quittée", data, {
      conversationId: data.conversationId,
      remainingParticipants: data.remainingParticipants,
    });
    const statusDiv = document.getElementById("leaveStatus");
    if (statusDiv) {
      statusDiv.textContent = `✅ Vous avez quitté la conversation ${data.conversationId}. ${data.remainingParticipants} participants restants.`;
      statusDiv.className = "status success";
    }
  });

  // ========================================
  // ✅ ÉVÉNEMENTS ÉDITION MESSAGE
  // ========================================

  socket.on("message:edited", (data) => {
    log("✏️ Message modifié", "success", data);
    addReceivedMessage("message", "✏️ Message Modifié", data, {
      messageId: data.messageId,
      newContent: data.newContent,
      editedBy: data.editedByMatricule || data.editedBy || "Vous",
      editedAt: data.editedAt,
    });
    const statusDiv = document.getElementById("editMessageStatus");
    if (statusDiv) {
      statusDiv.textContent = `✅ Message ${data.messageId} modifié avec succès`;
      statusDiv.className = "status success";
    }
  });

  // ========================================
  // ✅ ÉVÉNEMENTS SUPPRESSION MESSAGE
  // ========================================

  socket.on("message:deleted", (data) => {
    log("🗑️ Message supprimé", "success", data);
    addReceivedMessage("message", "🗑️ Message Supprimé", data, {
      messageId: data.messageId,
      deleteType: data.deleteType,
      deletedBy: data.deletedByMatricule || data.deletedBy || "Vous",
      message: data.message,
    });
    const statusDiv = document.getElementById("deleteMessageStatus");
    if (statusDiv) {
      statusDiv.textContent = `✅ ${data.message || "Message supprimé"}`;
      statusDiv.className = "status success";
    }
  });

  socket.on("message:error", (data) => {
    log("❌ Erreur message", "error", data);
    addReceivedMessage("error", "❌ Erreur Message", data, {
      error: data.error,
      code: data.code,
    });
    // Mettre à jour les status divs concernés
    ["editMessageStatus", "deleteMessageStatus"].forEach((id) => {
      const statusDiv = document.getElementById(id);
      if (statusDiv && statusDiv.textContent === "") {
        statusDiv.textContent = `❌ ${data.error}`;
        statusDiv.className = "status error";
      }
    });
  });

  // ========================================
  // 💾 ÉVÉNEMENTS BACKUP & SAUVEGARDE
  // ========================================

  socket.on("backup:started", (data) => {
    log("💾 Backup Socket démarré", "success", data);
    showBackupProgress(true);
    updateBackupProgressUI("loading_conversations", 5, "Démarrage du backup...");
    showBackupHTTPStatus(`✅ Backup démarré. ID Session: ${data.sessionId}`);
  });

  socket.on("backup:progress", (data) => {
    log("💾 Progression Backup", "info", data);
    const p = data.progress;
    const msg = `${p.message} | Conv: ${p.conversationsLoaded}/${p.conversationsTotal} | Msg: ${p.messagesLoaded}/${p.messagesTotal}`;
    updateBackupProgressUI(p.currentStep, p.percentage, msg);
  });

  socket.on("backup:paused", (data) => {
    log("⏸️ Backup Suspendu", "warning", data);
    updateBackupProgressUI("paused", data.progress.percentage, `⏸️ Suspendu à ${data.progress.percentage}%`);
    showBackupHTTPStatus(`⏸️ Session suspendue.`);
  });

  socket.on("backup:resumed", (data) => {
    log("▶️ Backup Repris", "success", data);
    updateBackupProgressUI("running", data.progress.percentage, `▶️ Reprise de la sauvegarde...`);
    showBackupHTTPStatus(`▶️ Session reprise.`);
  });

  socket.on("backup:cancelled", (data) => {
    log("🚫 Backup Annulé", "error", data);
    updateBackupProgressUI("cancelled", data.progress.percentage, "🚫 Sauvegarde annulée.");
    setTimeout(() => showBackupProgress(false), 3000);
    showBackupHTTPStatus(`🚫 Session annulée.`);
  });

  socket.on("backup:completed", (data) => {
    log("✅ Backup Terminé avec succès", "success", data);
    updateBackupProgressUI("done", 100, "✅ Backup complété et stocké dans MinIO !");
    setTimeout(() => showBackupProgress(false), 5000);
    
    // Auto-remplir le champ objectPath de restauration
    const r = data.result;
    document.getElementById("backupObjectPath").value = r.objectPath;
    
    showBackupHTTPStatus(`✅ Backup Réussi !\nChemin : ${r.objectPath}\nTaille : ${formatFileSize(r.size)}\nBucket : ${r.bucket}`);
  });

  socket.on("backup:failed", (data) => {
    log("❌ Backup Échoué", "error", data);
    updateBackupProgressUI("failed", 0, `❌ Erreur : ${data.error}`);
    showBackupHTTPStatus(`❌ Sauvegarde échouée : ${data.error}`);
  });

  socket.on("backup:error", (data) => {
    log("❌ Erreur Commande Backup", "error", data);
    showBackupHTTPStatus(`❌ Erreur Commande [${data.code}] : ${data.message}`);
  });

  socket.on("backup:sessionStatus", (data) => {
    log("🔍 Statut Session Backup", "info", data);
    if (!data.session) {
      showBackupHTTPStatus("Aucune session de sauvegarde active.");
      showBackupProgress(false);
    } else {
      const s = data.session;
      showBackupProgress(true);
      updateBackupProgressUI(s.progress.currentStep, s.progress.percentage, `${s.state} : ${s.progress.message}`);
      showBackupHTTPStatus(`Statut : ${s.state}\nID Session: ${s.sessionId}\nProgression: ${s.progress.percentage}%`);
    }
  });

  // ========================================
  // ✅ ÉVÉNEMENTS SUPPRESSION FICHIER
  // ========================================

  // ========================================
  // ✅ ÉVÉNEMENTS TRANSFERT MESSAGE
  // ========================================

  socket.on("forward:sent", (data) => {
    log("📤 Message transféré avec succès", "success", data);
    addReceivedMessage("message", "📤 Message Transféré", data, {
      originalMessageId: data.originalMessageId,
      forwardedCount: data.results ? data.results.length : 0,
      results: data.results,
    });
    const statusDiv = document.getElementById("forwardMessageStatus");
    if (statusDiv) {
      const count = data.results ? data.results.length : 0;
      statusDiv.textContent = `✅ Message transféré vers ${count} conversation(s)`;
      statusDiv.className = "status success";
    }
  });

  socket.on("forward:error", (data) => {
    log("❌ Erreur transfert message", "error", data);
    addReceivedMessage("error", "❌ Erreur Transfert", data, {
      error: data.error,
      code: data.code,
    });
    const statusDiv = document.getElementById("forwardMessageStatus");
    if (statusDiv) {
      statusDiv.textContent = `❌ ${data.error}`;
      statusDiv.className = "status error";
    }
  });

  // ========================================
  // ✅ ÉVÉNEMENTS SUPPRESSION FICHIER (suite)
  // ========================================

  socket.on("file:deleted", (data) => {
    log("🗑️ Fichier supprimé", "success", data);
    addReceivedMessage("message", "🗑️ Fichier Supprimé", data, {
      fileId: data.fileId,
      physicalDelete: data.physicalDelete,
      message: data.message,
    });
    const statusDiv = document.getElementById("deleteFileStatus");
    if (statusDiv) {
      statusDiv.textContent = `✅ ${data.message || "Fichier supprimé"}`;
      statusDiv.className = "status success";
    }
  });

  socket.on("file:error", (data) => {
    log("❌ Erreur fichier", "error", data);
    addReceivedMessage("error", "❌ Erreur Fichier", data, {
      error: data.error,
      code: data.code,
    });
    const statusDiv = document.getElementById("deleteFileStatus");
    if (statusDiv) {
      statusDiv.textContent = `❌ ${data.error}`;
      statusDiv.className = "status error";
    }
  });

  socket.on("conversation:error", (data) => {
    log("❌ Erreur conversation", "error", data);
    addReceivedMessage("error", "❌ Erreur Conversation", data, {
      error: data.error,
      code: data.code,
    });
    const statusDiv = document.getElementById("leaveStatus");
    if (statusDiv) {
      statusDiv.textContent = `❌ ${data.error}`;
      statusDiv.className = "status error";
    }
  });

  // ✅ ÉVÉNEMENTS CONVERSATIONS CHARGÉES
  socket.on("conversationsLoaded", (data) => {
    log("✅ Conversations chargées", "success", data);
    displayConversations(data);
    addReceivedMessage("message", "✅ Conversations Chargées", data, {
      total: data.stats?.total || 0,
      unread: data.stats?.unread || 0,
      processingTime: data.processingTime || "N/A",
    });
  });

  socket.on("conversations:quick", (data) => {
    log("⚡ Quick load conversations reçues", "success", data);
    displayConversations(data);
    addReceivedMessage("message", "⚡ Quick Load Conversations", data, {
      total: data.stats?.total || 0,
      groups: data.stats?.groups || 0,
      broadcasts: data.stats?.broadcasts || 0,
    });
  });

  socket.on("conversations:full", (data) => {
    log("📚 Full load conversations reçues", "success", data);
    displayConversations(data);
    addReceivedMessage("message", "📚 Full Load Conversations", data, {
      total: data.stats?.total || 0,
      page: data.pagination?.currentPage || 1,
      totalPages: data.pagination?.totalPages || 1,
    });
  });

  socket.on("conversations_error", (error) => {
    log("❌ Erreur récupération conversations", "error", error);
    addReceivedMessage("error", "❌ Erreur Conversations", error, {
      message: error.message || error.error,
      code: error.code,
    });
    alert(`Erreur: ${error.message || error.error}`);
  });

  // ========================================
  // ✅ ÉVÉNEMENTS PRÉSENCE (Utilisateurs en ligne par conversation)
  // ========================================

  socket.on("conversation_online_users", (data) => {
    log("👥 Utilisateurs en ligne de la conversation", "success", data);
    displayConversationOnlineUsers(data);
    addReceivedMessage("user", "👥 Utilisateurs En Ligne", data, {
      conversation: data.conversationId,
      count: data.onlineUsers || 0,
      total: data.totalUsers || 0,
    });
  });

  socket.on("conversation_users:error", (error) => {
    log("❌ Erreur récupération utilisateurs en ligne", "error", error);
    addReceivedMessage("error", "❌ Erreur Utilisateurs En Ligne", error, {
      error: error.error || error.message,
      code: error.code,
    });
  });

  socket.on("conversations_with_presence", (data) => {
    log("👥 Conversations avec présence", "success", data);
    addReceivedMessage("user", "👥 Conversations avec Présence", data, {
      count: data.conversations?.length || 0,
      userId: data.userId,
    });
  });

  // ========================================
  // ✅ ÉVÉNEMENTS APPELS (CALL / VIDEO_CALL)
  // ========================================

  socket.on("call:initiated", (data) => {
    log("📞 Appel initié avec succès", "success", data);
    addReceivedMessage("message", "📞 Appel Initié", data, {
      callId: data.callId,
      messageId: data.messageId,
      callType: data.callType,
      conversationId: data.conversationId,
    });
    // Auto-remplir les champs de gestion d'appel
    document.getElementById("activeCallId").value = data.callId || "";
    document.getElementById("activeCallMessageId").value = data.messageId || "";
    document.getElementById("activeCallConversationId").value =
      data.conversationId || "";
    updateStatus(
      "initiateCallStatus",
      `✅ Appel ${data.callType} initié — CallID: ${data.callId}`,
      "success",
    );
    addCallLogEntry(
      "📞 INITIÉ",
      data.callType,
      data.callId,
      data.conversationId,
    );
  });

  socket.on("call:incoming", (data) => {
    log("📲 Appel entrant !", "warning", data);
    addReceivedMessage("message", "📲 Appel Entrant", data, {
      callId: data.callId,
      callType: data.callType,
      caller: `${data.caller?.prenom || ""} ${data.caller?.nom || ""} (${data.caller?.matricule || data.caller?.userId})`,
    });
    // Auto-remplir les champs pour pouvoir répondre
    document.getElementById("activeCallId").value = data.callId || "";
    document.getElementById("activeCallMessageId").value = data.messageId || "";
    document.getElementById("activeCallConversationId").value =
      data.conversationId || "";
    updateStatus(
      "callActionStatus",
      `📲 Appel entrant de ${data.caller?.matricule || data.caller?.userId} — ${data.callType}`,
      "warning",
    );
    addCallLogEntry(
      "📲 ENTRANT",
      data.callType,
      data.callId,
      data.conversationId,
      `de ${data.caller?.matricule || data.caller?.userId}`,
    );
  });

  socket.on("call:answered", (data) => {
    log("✅ Appel décroché", "success", data);
    addReceivedMessage("message", "✅ Appel Décroché", data, {
      callId: data.callId,
      answeredBy: data.answeredByMatricule || data.answeredBy,
    });
    updateStatus(
      "callActionStatus",
      `✅ Appel décroché par ${data.answeredByMatricule || data.answeredBy}`,
      "success",
    );
    addCallLogEntry(
      "✅ DÉCROCHÉ",
      null,
      data.callId,
      null,
      `par ${data.answeredByMatricule || data.answeredBy}`,
    );
  });

  socket.on("call:declined", (data) => {
    log("❌ Appel refusé", "warning", data);
    addReceivedMessage("message", "❌ Appel Refusé", data, {
      callId: data.callId,
      declinedBy: data.declinedByMatricule || data.declinedBy,
    });
    updateStatus(
      "callActionStatus",
      `❌ Appel refusé par ${data.declinedByMatricule || data.declinedBy}`,
      "warning",
    );
    addCallLogEntry(
      "❌ REFUSÉ",
      null,
      data.callId,
      null,
      `par ${data.declinedByMatricule || data.declinedBy}`,
    );
  });

  socket.on("call:ended", (data) => {
    log("📴 Appel terminé", "info", data);
    addReceivedMessage("message", "📴 Appel Terminé", data, {
      callId: data.callId,
      endedBy: data.endedByMatricule || data.endedBy,
      reason: data.reason,
    });
    updateStatus(
      "callActionStatus",
      `📴 Appel terminé par ${data.endedByMatricule || data.endedBy} — Raison: ${data.reason}`,
      "info",
    );
    addCallLogEntry(
      "📴 TERMINÉ",
      null,
      data.callId,
      null,
      `par ${data.endedByMatricule || data.endedBy} (${data.reason})`,
    );
  });

  socket.on("call:missed", (data) => {
    log("📵 Appel manqué", "warning", data);
    addReceivedMessage("message", "📵 Appel Manqué", data, {
      callId: data.callId,
      missedBy: data.missedBy,
    });
    updateStatus(
      "callActionStatus",
      `📵 Appel manqué — CallID: ${data.callId}`,
      "warning",
    );
    addCallLogEntry(
      "📵 MANQUÉ",
      null,
      data.callId,
      null,
      `par ${data.missedBy}`,
    );
  });

  // ✅ ÉVÉNEMENT STREAM : Mise à jour du statut d'appel (via Redis stream → MDS)
  socket.on("call:statusUpdated", (data) => {
    const statusLabels = {
      ANSWERED: "✅ Décroché",
      DECLINED: "❌ Refusé",
      ENDED: "📴 Terminé",
      MISSED: "📵 Manqué",
      INITIATED: "📞 Initié",
      RINGING: "🔔 Sonnerie",
      CANCELLED: "🚫 Annulé",
      FAILED: "💥 Échoué",
      BUSY: "📳 Occupé",
    };
    const label = statusLabels[data.status] || `📞 ${data.status}`;
    log(`📞 [Stream] Statut appel mis à jour: ${data.status}`, "info", data);
    addReceivedMessage("message", `${label} (via Stream)`, data, {
      callId: data.callId,
      status: data.status,
      conversationId: data.conversationId,
      userId: data.userId,
      duration: data.duration || 0,
      endReason: data.endReason || "-",
    });
    updateStatus(
      "callActionStatus",
      `${label} — CallID: ${data.callId} (stream)`,
      data.status === "ANSWERED" ? "success" : "info",
    );
    addCallLogEntry(
      `${label} [STREAM]`,
      null,
      data.callId,
      data.conversationId,
      `par ${data.userId} | durée: ${data.duration || 0}s`,
    );
  });

  socket.on("call:error", (data) => {
    log("❌ Erreur appel", "error", data);
    addReceivedMessage("error", "❌ Erreur Appel", data, {
      error: data.error,
      code: data.code,
    });
    updateStatus("initiateCallStatus", `❌ ${data.error}`, "error");
    updateStatus(
      "callActionStatus",
      `❌ ${data.error} (${data.code})`,
      "error",
    );
  });

  // ========================================
  // ÉVÉNEMENTS CHIFFREMENT E2EE
  // ========================================

  socket.on("encryption:keyRegistered", (data) => {
    log("🔑 Clé publique enregistrée", "success", data);
    updateStatus(
      "e2eeRegisterStatus",
      `✅ Clé enregistrée — version: ${data.keyVersion} | fingerprint: ${data.fingerprint?.slice(0, 16)}…`,
      "success",
    );
    document.getElementById("e2eeFingerprint").textContent =
      data.fingerprint || "—";
    document.getElementById("e2eeKeyVersion").textContent =
      data.keyVersion || "—";
    addReceivedMessage("e2ee", "🔑 Clé E2EE Enregistrée", data, {
      keyVersion: data.keyVersion,
      fingerprint: data.fingerprint,
    });
  });

  socket.on("encryption:publicKey", (data) => {
    log("📤 Clé publique reçue", "info", data);
    updateStatus(
      "e2eeGetKeyStatus",
      `✅ Clé reçue — fingerprint: ${data.fingerprint?.slice(0, 16)}…`,
      "success",
    );
    document.getElementById("e2eeRecipientKeyDisplay").textContent =
      data.publicKey ? data.publicKey.slice(0, 80) + "…" : "N/A";
    addReceivedMessage("e2ee", "📤 Clé Publique Reçue", data, {
      userId: data.userId,
      fingerprint: data.fingerprint,
      keyVersion: data.keyVersion,
    });
  });

  socket.on("encryption:config", (data) => {
    log("⚙️ Config chiffrement", "info", data);
    updateStatus(
      "e2eeConfigStatus",
      `Mode actif: ${data.mode} | E2EE: ${data.isE2EEEnabled ? "✅" : "❌"}`,
      "info",
    );
    document.getElementById("e2eeCurrentMode").textContent = data.mode || "—";
    addReceivedMessage("e2ee", "⚙️ Config E2EE", data, data);
  });

  socket.on("encryption:modeChanged", (data) => {
    log("🔄 Mode chiffrement changé", "warning", data);
    updateStatus(
      "e2eeSwitchStatus",
      `✅ Mode changé → ${data.newMode}`,
      "success",
    );
    document.getElementById("e2eeCurrentMode").textContent =
      data.newMode || "—";
    addReceivedMessage("e2ee", "🔄 Mode E2EE Changé", data, {
      previousMode: data.previousMode,
      newMode: data.newMode,
      changedBy: data.changedBy,
    });
  });

  socket.on("encryption:keyRevoked", (data) => {
    log("🚫 Clé révoquée", "warning", data);
    updateStatus(
      "e2eeRevokeStatus",
      `✅ Clé révoquée pour userId: ${data.userId}`,
      "success",
    );
    document.getElementById("e2eeFingerprint").textContent = "—";
    document.getElementById("e2eeKeyVersion").textContent = "—";
    addReceivedMessage("e2ee", "🚫 Clé E2EE Révoquée", data, data);
  });

  socket.on("encryption:error", (data) => {
    log("❌ Erreur chiffrement", "error", data);
    const msg = data.message || data.error || JSON.stringify(data);
    [
      "e2eeRegisterStatus",
      "e2eeGetKeyStatus",
      "e2eeConfigStatus",
      "e2eeSwitchStatus",
      "e2eeRevokeStatus",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (el) updateStatus(id, `❌ ${msg}`, "error");
    });
    addReceivedMessage("error", "❌ Erreur E2EE", data, { error: msg });
  });

  // ========================================
  // 📂 ÉVÉNEMENTS ARCHIVAGE
  // ========================================

  socket.on("conversation:archived", (data) => {
    updateStatus(
      "archiveStatus",
      `✅ Archivée: ${data.conversationId}${data.alreadyArchived ? " (déjà archivée)" : ""}`,
      "success",
    );
    addReceivedMessage("archive", "📥 Conversation Archivée", data, data);
    log(`📂 Conversation archivée: ${data.conversationId}`, "success");
  });

  socket.on("conversation:unarchived", (data) => {
    updateStatus(
      "archiveStatus",
      `✅ Désarchivée: ${data.conversationId}${data.alreadyUnarchived ? " (déjà active)" : ""}`,
      "success",
    );
    addReceivedMessage("archive", "📤 Conversation Désarchivée", data, data);
    log(`📂 Conversation désarchivée: ${data.conversationId}`, "success");
  });

  socket.on("conversation:archivedList", (data) => {
    const count = data.conversations?.length || 0;
    updateStatus(
      "archivedListStatus",
      `✅ ${count} conversation(s) archivée(s) — total: ${data.totalCount || 0}`,
      "success",
    );
    const container = document.getElementById("archivedConvList");
    if (container) {
      if (count === 0) {
        container.innerHTML =
          '<em style="color:#888">Aucune conversation archivée</em>';
      } else {
        container.innerHTML = data.conversations
          .map(
            (c) =>
              `<div style="padding:4px 0; border-bottom:1px solid #333">
            <strong>${c.name || c.id || c._id}</strong>
            <span style="color:#888; margin-left:8px">[${c.type || "?"}]</span>
            ${c.archivedAt ? `<span style="color:#f59e0b; margin-left:8px">📅 ${new Date(c.archivedAt).toLocaleDateString()}</span>` : ""}
          </div>`,
          )
          .join("");
      }
    }
    addReceivedMessage("archive", "📂 Liste Archivées", data, {
      count,
      totalCount: data.totalCount,
    });
  });

  socket.on("conversation:archiveError", (data) => {
    const msg = data.message || JSON.stringify(data);
    updateStatus("archiveStatus", `❌ ${msg}`, "error");
    updateStatus("archivedListStatus", `❌ ${msg}`, "error");
    addReceivedMessage("error", "❌ Erreur Archivage", data, { error: msg });
    log(`❌ Erreur archivage: ${msg}`, "error");
  });
}

// ========================================
// FONCTIONS ARCHIVAGE
// ========================================

function archiveConversation() {
  const conversationId = document
    .getElementById("archiveConvId")
    ?.value?.trim();
  if (!conversationId) {
    updateStatus("archiveStatus", "❌ conversationId requis", "error");
    return;
  }
  if (!socket || !isAuthenticated) {
    updateStatus("archiveStatus", "❌ Non authentifié", "error");
    return;
  }
  updateStatus("archiveStatus", "⏳ Archivage en cours...", "info");
  socket.emit("conversation:archive", { conversationId });
  log(`📤 Émission conversation:archive pour ${conversationId}`, "info");
}

function unarchiveConversation() {
  const conversationId = document
    .getElementById("archiveConvId")
    ?.value?.trim();
  if (!conversationId) {
    updateStatus("archiveStatus", "❌ conversationId requis", "error");
    return;
  }
  if (!socket || !isAuthenticated) {
    updateStatus("archiveStatus", "❌ Non authentifié", "error");
    return;
  }
  updateStatus("archiveStatus", "⏳ Désarchivage en cours...", "info");
  socket.emit("conversation:unarchive", { conversationId });
  log(`📤 Émission conversation:unarchive pour ${conversationId}`, "info");
}

function getArchivedConversations() {
  if (!socket || !isAuthenticated) {
    updateStatus("archivedListStatus", "❌ Non authentifié", "error");
    return;
  }
  const page = parseInt(document.getElementById("archivedPage")?.value) || 1;
  const limit = parseInt(document.getElementById("archivedLimit")?.value) || 20;
  updateStatus("archivedListStatus", "⏳ Chargement...", "info");
  socket.emit("conversation:getArchived", { page, limit });
  log(
    `📤 Émission conversation:getArchived (page=${page}, limit=${limit})`,
    "info",
  );
}

// ========================================
// FONCTIONS GROUPES ET DIFFUSION
// ========================================

function createGroup() {
  console.log("🔵 createGroup() appelée");

  const name = document.getElementById("groupName")?.value?.trim();
  const receiverIds = document
    .getElementById("groupReceiverIds")
    ?.value?.trim();
  const groupId =
    document.getElementById("groupId")?.value?.trim() || undefined;

  console.log("📝 Valeurs récupérées:", { name, receiverIds, groupId });

  if (!name) {
    alert("Veuillez saisir un nom de groupe");
    return;
  }

  if (!receiverIds) {
    alert("Veuillez saisir les IDs des membres (séparés par virgule)");
    return;
  }

  const members = receiverIds
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id);

  if (members.length === 0) {
    alert("Aucun membre valide");
    return;
  }

  const data = {
    name,
    members,
    groupId,
  };

  log("📤 Émission createGroup", "info", data);
  socket.emit("createGroup", data);
}

function createBroadcast() {
  const name = document.getElementById("broadcastName")?.value?.trim();
  const receiverIdsStr =
    document.getElementById("broadcastRecipientIds")?.value?.trim() ||
    document.getElementById("groupReceiverIds")?.value?.trim();
  const broadcastId =
    document.getElementById("broadcastId")?.value?.trim() || undefined;
  const statusDiv = document.getElementById("createBroadcastStatus");

  const setStatus = (msg, type) => {
    if (statusDiv) {
      statusDiv.textContent = msg;
      statusDiv.className = `status ${type}`;
    }
  };

  if (!name) {
    setStatus("❌ Nom de diffusion requis", "error");
    return;
  }
  if (!receiverIdsStr) {
    setStatus("❌ IDs destinataires requis", "error");
    return;
  }

  const recipients = receiverIdsStr
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id);

  if (recipients.length === 0) {
    setStatus("❌ Aucun destinataire valide", "error");
    return;
  }

  const data = { name, recipients, broadcastId };
  setStatus(
    `⏳ Création de la diffusion (${recipients.length} destinataires)…`,
    "info",
  );
  log("📤 Émission createBroadcast", "info", data);
  socket.emit("createBroadcast", data);
}

// ========================================
// ✅ FONCTIONS BROADCAST
// ========================================

function generateBroadcastId() {
  const id = generateMongoObjectId();
  const el = document.getElementById("broadcastId");
  if (el) el.value = id;
  log(`🔧 ID diffusion généré: ${id}`, "info");
}

function sendBroadcastMessage() {
  if (!socket || !socket.connected) {
    log("❌ Socket non connecté", "error");
    return;
  }

  const conversationId = document
    .getElementById("broadcastConversationId")
    ?.value?.trim();
  const content = document
    .getElementById("broadcastMessageContent")
    ?.value?.trim();
  const type = document.getElementById("broadcastMessageType")?.value || "TEXT";
  const statusDiv = document.getElementById("sendBroadcastStatus");

  const setStatus = (msg, cls) => {
    if (statusDiv) {
      statusDiv.textContent = msg;
      statusDiv.className = `status ${cls}`;
    }
  };

  if (!conversationId) {
    setStatus("❌ ID conversation broadcast requis", "error");
    return;
  }
  if (!content && type === "TEXT") {
    setStatus("❌ Contenu requis pour un message TEXT", "error");
    return;
  }

  const payload = {
    conversationId,
    content,
    type,
    senderId: currentUser?.userId,
  };

  setStatus("⏳ Envoi en cours…", "info");
  log("📤 Envoi message broadcast", "info", payload);
  socket.emit("sendMessage", payload, (ack) => {
    if (ack?.success) {
      setStatus(
        `✅ Message envoyé (id: ${ack.data?.messageId || "?"})`,
        "success",
      );
      log("✅ Broadcast message envoyé", "success", ack.data);
    } else {
      setStatus(`❌ ${ack?.message || "Erreur"}`, "error");
      log("❌ Erreur envoi broadcast", "error", ack);
    }
  });
}

async function fetchBroadcastMessages() {
  const conversationId = document
    .getElementById("broadcastFetchConversationId")
    ?.value?.trim();
  const limit = document.getElementById("broadcastFetchLimit")?.value || 20;
  const statusDiv = document.getElementById("fetchBroadcastStatus");
  const outputEl = document.getElementById("broadcastMessagesOutput");

  const setStatus = (msg, cls) => {
    if (statusDiv) {
      statusDiv.textContent = msg;
      statusDiv.className = `status ${cls}`;
    }
  };

  if (!conversationId) {
    setStatus("❌ ID conversation requis", "error");
    return;
  }

  setStatus("⏳ Récupération…", "info");
  try {
    const res = await fetch(
      `/conversations/${conversationId}/messages?limit=${limit}`,
      { headers: { "user-id": currentUser?.userId || "" } },
    );
    const data = await res.json();
    if (data.success) {
      const msgs = data.data?.messages || [];
      setStatus(`✅ ${msgs.length} message(s) récupéré(s)`, "success");
      if (outputEl) outputEl.textContent = JSON.stringify(msgs, null, 2);
      log("✅ Messages broadcast récupérés", "success", { count: msgs.length });
    } else {
      setStatus(`❌ ${data.message || "Erreur"}`, "error");
      if (outputEl) outputEl.textContent = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    setStatus(`❌ ${err.message}`, "error");
    log("❌ Erreur fetchBroadcastMessages", "error", err);
  }
}

async function fetchBroadcastMetadata() {
  const conversationId = document
    .getElementById("broadcastMetaConvId")
    ?.value?.trim();
  const statusDiv = document.getElementById("broadcastMetaStatus");
  const outputEl = document.getElementById("broadcastMetaOutput");

  const setStatus = (msg, cls) => {
    if (statusDiv) {
      statusDiv.textContent = msg;
      statusDiv.className = `status ${cls}`;
    }
  };

  if (!conversationId) {
    setStatus("❌ ID conversation requis", "error");
    return;
  }

  setStatus("⏳ Récupération du mapping…", "info");
  try {
    const res = await fetch(`/conversations/${conversationId}`, {
      headers: { "user-id": currentUser?.userId || "" },
    });
    const data = await res.json();
    if (data.success) {
      const conv = data.data;
      const meta = conv?.broadcastMetadata || null;
      const privateConvs = meta?.privateConversations || [];
      setStatus(
        `✅ ${privateConvs.length} conv(s) privée(s) liée(s) | totalMessagesSent: ${meta?.totalMessagesSent ?? 0}`,
        "success",
      );
      if (outputEl) outputEl.textContent = JSON.stringify(meta, null, 2);
      log("✅ broadcastMetadata récupéré", "success", meta);
    } else {
      setStatus(`❌ ${data.message || "Erreur"}`, "error");
      if (outputEl) outputEl.textContent = JSON.stringify(data, null, 2);
    }
  } catch (err) {
    setStatus(`❌ ${err.message}`, "error");
    log("❌ Erreur fetchBroadcastMetadata", "error", err);
  }
}

// ========================================
// FONCTIONS D'AUTHENTIFICATION
// ========================================

function authenticate() {
  if (!socket || !socket.connected) {
    log("❌ Socket non connecté", "error");
    return;
  }

  const userId = document.getElementById("userId").value.trim();
  const matricule = document.getElementById("matricule").value.trim();
  const token = document.getElementById("token").value.trim();
  // ✅ Récupérer receiverId et status
  const receiverId = document.getElementById("receiverIdAuth")?.value.trim();
  const status = document.getElementById("statusAuth")?.value.trim();

  if (!userId || !matricule) {
    log("❌ ID utilisateur et matricule requis", "error");
    updateAuthStatus("❌ Veuillez remplir tous les champs requis", "error");
    return;
  }

  const authData = {
    userId,
    matricule,
    ...(token && { token }),
    ...(receiverId && { receiverId }), // Ajouté si présent
    ...(status && { status }), // Ajouté si présent
  };

  log("🔐 Tentative d'authentification...", "info", authData);
  updateAuthStatus("🔄 Authentification en cours...", "info");

  socket.emit("authenticate", authData);
}

// ========================================
// FONCTIONS DE TESTS DE BASE
// ========================================

function pingTest() {
  if (!socket || !socket.connected) {
    log("❌ Socket non connecté", "error");
    return;
  }

  log("🏓 Envoi de ping...", "info");
  socket.emit("ping");
}

function getOnlineUsers() {
  if (!socket || !socket.connected) {
    log("❌ Socket non connecté", "error");
    return;
  }

  if (!isAuthenticated) {
    log("❌ Authentification requise", "error");
    return;
  }

  log("👥 Demande des utilisateurs en ligne...", "info");
  socket.emit("getOnlineUsers");
}

function disconnect() {
  if (socket) {
    log("🔌 Déconnexion manuelle...", "info");
    socket.disconnect();
  }
}

function reconnect() {
  if (socket && !socket.connected) {
    log("🔄 Reconnexion manuelle...", "info");
    socket.connect();
  } else if (!socket) {
    initializeSocket();
  } else {
    log("ℹ️ Socket déjà connecté", "info");
  }
}

// ========================================
// FONCTIONS DE MESSAGES
// ========================================

function sendMessage() {
  if (!socket || !socket.connected) {
    log("❌ Socket non connecté", "error");
    return;
  }

  if (!isAuthenticated) {
    log("❌ Authentification requise", "error");
    return;
  }

  // ✅ VALIDER D'ABORD LES DONNÉES
  if (!validateMessageData()) {
    log("❌ Validation des données échouée - Envoi annulé", "error");
    return;
  }

  const conversationId = document.getElementById("conversationId").value.trim();
  const receiverId = document.getElementById("receiverId").value.trim();
  const content = document.getElementById("messageContent").value.trim();
  const type = document.getElementById("messageType").value;

  const messageData = {
    conversationId,
    content,
    type,
    ...(receiverId && { receiverId }),
  };

  log("📤 Envoi d'un message validé...", "info", messageData);
  socket.emit("sendMessage", messageData);
}

// ========================================
// FONCTIONS DE CONVERSATIONS
// ========================================

function joinConversation() {
  if (!socket || !socket.connected) {
    log("❌ Socket non connecté", "error");
    return;
  }

  if (!isAuthenticated) {
    log("❌ Authentification requise", "error");
    return;
  }

  const conversationId = document.getElementById("conversationId").value.trim();

  if (!conversationId) {
    log("❌ ID conversation requis", "error");
    return;
  }

  const data = { conversationId };
  log("➕ Rejoindre la conversation...", "info", data);
  socket.emit("joinConversation", data);
}

function leaveConversation() {
  if (!socket || !socket.connected) {
    log("❌ Socket non connecté", "error");
    return;
  }

  if (!isAuthenticated) {
    log("❌ Authentification requise", "error");
    return;
  }

  const conversationId = document.getElementById("conversationId").value.trim();

  if (!conversationId) {
    log("❌ ID conversation requis", "error");
    return;
  }

  const data = { conversationId };
  log("➖ Quitter la conversation...", "info", data);
  socket.emit("leaveConversation", data);
}

function startTyping() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    return;
  }

  const conversationId = document.getElementById("conversationId").value.trim();

  if (!conversationId) {
    log("❌ ID conversation requis", "error");
    return;
  }

  const data = {
    conversationId,
    isTyping: true,
    userId: currentUser?.userId,
    userName: currentUser?.matricule,
  };

  log("⌨️ Commencer à taper...", "info", data);
  socket.emit("typing", data);
}

function stopTyping() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    return;
  }

  const conversationId = document.getElementById("conversationId").value.trim();

  if (!conversationId) {
    log("❌ ID conversation requis", "error");
    return;
  }

  const data = {
    conversationId,
    isTyping: false,
    userId: currentUser?.userId,
    userName: currentUser?.matricule,
  };

  log("⏹️ Arrêter de taper...", "info", data);
  socket.emit("stopTyping", data);
}

// ========================================
// TESTS AVANCÉS
// ========================================

function testInvalidData() {
  if (!socket || !socket.connected) {
    log("❌ Socket non connecté", "error");
    return;
  }

  log("❌ Test avec données invalides...", "warning");

  // Test avec des données manquantes
  socket.emit("sendMessage", {});

  // Test avec ID invalide
  socket.emit("sendMessage", {
    conversationId: "invalid-id",
    content: "Test avec ID invalide",
  });

  // Test avec contenu vide
  socket.emit("sendMessage", {
    conversationId: "60f7b3b3b3b3b3b3b3b3b3b6",
    content: "",
  });
}

function testLongMessage() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    return;
  }

  const conversationId = document.getElementById("conversationId").value.trim();

  if (!conversationId) {
    log("❌ ID conversation requis", "error");
    return;
  }

  const longContent =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(100);

  const data = {
    conversationId,
    content: longContent,
    type: "TEXT",
  };

  log("📝 Test avec message très long...", "warning", {
    conversationId,
    contentLength: longContent.length,
  });
  socket.emit("sendMessage", data);
}

function testSpecialChars() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    return;
  }

  const conversationId = document.getElementById("conversationId").value.trim();

  if (!conversationId) {
    log("❌ ID conversation requis", "error");
    return;
  }

  const specialContent =
    "🚀🔥💬 Test avec émojis et caractères spéciaux: @#$%^&*()_+{}[]|\\:\";'<>?,./`~àáâãäåæçèéêëìíîïñòóôõöøùúûüýÿ";

  const data = {
    conversationId,
    content: specialContent,
    type: "TEXT",
  };

  log("🔤 Test avec caractères spéciaux...", "warning", data);
  socket.emit("sendMessage", data);
}

function stressTest() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    return;
  }

  const conversationId = document.getElementById("conversationId").value.trim();

  if (!conversationId) {
    log("❌ ID conversation requis", "error");
    return;
  }

  log("⚡ Début du test de charge (10 messages)...", "warning");

  for (let i = 1; i <= 10; i++) {
    setTimeout(() => {
      const data = {
        conversationId,
        content: `Message de test de charge #${i}`,
        type: "TEXT",
      };
      socket.emit("sendMessage", data);
    }, i * 100); // Délai de 100ms entre chaque message
  }
}

// ========================================
// FONCTIONS UTILITAIRES
// ========================================

function setupPingInterval() {
  pingInterval = setInterval(() => {
    if (socket && socket.connected && isAuthenticated) {
      pingTest();
    }
  }, CONFIG.PING_INTERVAL);
}

function updateConnectionStatus(status) {
  const statusElement = document.getElementById("connectionStatus");
  statusElement.className = `connection-status ${status}`;

  switch (status) {
    case "connected":
      statusElement.textContent = "🟢 Connecté";
      break;
    case "connecting":
      statusElement.textContent = "🟡 Connexion...";
      break;
    case "disconnected":
    default:
      statusElement.textContent = "🔴 Déconnecté";
      break;
  }
}

function updateAuthStatus(message, type = "info") {
  const statusElement = document.getElementById("authStatus");
  statusElement.className = `status ${type}`;
  statusElement.textContent = message;
}

function log(message, type = "info", data = null) {
  const timestamp = new Date().toLocaleTimeString();
  const logsContainer = document.getElementById("logsContainer");

  const logEntry = document.createElement("div");
  logEntry.className = `log-entry ${type}`;

  let logContent = `<span class="log-timestamp">[${timestamp}]</span>`;
  logContent += `<span class="log-event">${message}</span>`;

  if (data) {
    logContent += `<span class="log-data">${JSON.stringify(
      data,
      null,
      2,
    )}</span>`;
  }

  logEntry.innerHTML = logContent;
  logsContainer.appendChild(logEntry);
  logsContainer.scrollTop = logsContainer.scrollHeight;

  // Limiter le nombre de logs (garder les 100 derniers)
  while (logsContainer.children.length > 100) {
    logsContainer.removeChild(logsContainer.firstChild);
  }

  // Aussi dans la console pour debugging
  console.log(`[${timestamp}] ${message}`, data || "");
}

function clearLogs() {
  const logsContainer = document.getElementById("logsContainer");
  logsContainer.innerHTML = "";
  log("🧹 Logs effacés", "info");
}

// ========================================
// FONCTIONS DE VALIDATION ET GÉNÉRATION D'IDS
// ========================================

function validateMessageData() {
  const conversationId = document.getElementById("conversationId").value.trim();
  const receiverId = document.getElementById("receiverId").value.trim();
  const userId = document.getElementById("userId").value.trim();
  const content = document.getElementById("messageContent").value.trim();

  let isValid = true;
  let messages = [];

  // ✅ VÉRIFICATIONS DE BASE
  if (!content) {
    messages.push("❌ Le contenu du message est requis");
    isValid = false;
  }

  if (!conversationId) {
    messages.push("❌ L'ID de conversation est requis");
    isValid = false;
  }

  if (!userId) {
    messages.push("❌ L'ID utilisateur est requis (authentifiez-vous d'abord)");
    isValid = false;
  }

  // ✅ VÉRIFIER QUE LES IDS SONT VALIDES (au moins 1 caractère)
  if (conversationId && conversationId.length < 1) {
    messages.push("❌ ID conversation invalide");
    isValid = false;
  }

  if (receiverId && receiverId.length < 1) {
    messages.push("❌ ID destinataire invalide");
    isValid = false;
  }

  // ✅ VÉRIFIER QUE L'UTILISATEUR NE S'ENVOIE PAS UN MESSAGE À LUI-MÊME
  if (receiverId && receiverId === userId) {
    messages.push("❌ Vous ne pouvez pas vous envoyer un message à vous-même");
    isValid = false;
  }

  // ✅ POUR UNE NOUVELLE CONVERSATION, RECEIVER ID EST REQUIS
  if (conversationId && conversationId.length === 24 && !receiverId) {
    messages.push(
      "❌ Pour une nouvelle conversation, l'ID destinataire est requis",
    );
    isValid = false;
  }

  // ✅ AFFICHER LES MESSAGES D'ERREUR
  messages.forEach((msg) => log(msg, "error"));

  // ✅ AFFICHER UN MESSAGE DE SUCCÈS SI VALIDE
  if (isValid) {
    log("✅ Données du message validées avec succès", "success");
  }

  return isValid;
}

function generateTestIds() {
  const userId = document.getElementById("userId").value.trim();
  const conversationId = document.getElementById("conversationId");
  const receiverId = document.getElementById("receiverId");

  // ✅ GÉNÉRER DES IDS BASÉS SUR LES VALEURS ACTUELLES
  if (userId && receiverId.value.trim()) {
    // Créer un ID de conversation basé sur les deux utilisateurs
    const sortedIds = [userId, receiverId.value.trim()].sort();
    const generatedConvId = `conv_${sortedIds.join("_")}_${Date.now()}`;
    conversationId.value = generatedConvId;

    log("🔧 ID de conversation généré automatiquement", "info", {
      participants: sortedIds,
      conversationId: generatedConvId,
    });
  } else if (userId) {
    // ✅ PROPOSER DES IDS DE TEST PAR DÉFAUT
    const defaultReceiverId = userId === "3" ? "1" : "3"; // Alterner entre utilisateur 1 et 3
    const timestamp = Date.now();

    receiverId.value = defaultReceiverId;
    conversationId.value = `conv_${Math.min(
      userId,
      defaultReceiverId,
    )}_${Math.max(userId, defaultReceiverId)}_${timestamp}`;

    log("🔧 IDs de test générés automatiquement", "info", {
      senderId: userId,
      receiverId: defaultReceiverId,
      conversationId: conversationId.value,
    });
  } else {
    // ✅ GÉNÉRER DES IDS COMPLÈTEMENT ALÉATOIRES
    const randomUserId1 = Math.floor(Math.random() * 100) + 1;
    const randomUserId2 = Math.floor(Math.random() * 100) + 1;
    const timestamp = Date.now();

    document.getElementById("userId").value = randomUserId1.toString();
    receiverId.value = randomUserId2.toString();
    conversationId.value = `conv_${Math.min(
      randomUserId1,
      randomUserId2,
    )}_${Math.max(randomUserId1, randomUserId2)}_${timestamp}`;

    log("🔧 IDs aléatoires générés", "info", {
      userId: randomUserId1,
      receiverId: randomUserId2,
      conversationId: conversationId.value,
    });
  }

  // ✅ VALIDER LES NOUVELLES DONNÉES
  setTimeout(() => validateMessageData(), 100);
}

// ✅ FONCTION UTILITAIRE POUR GÉNÉRER DES OBJECTIDS MONGODB VALIDES (OPTIONNEL)
function generateMongoObjectId() {
  const timestamp = Math.floor(Date.now() / 1000).toString(16);
  const randomHex = "xxxxxxxxxxxxxxxx".replace(/[x]/g, () => {
    return ((Math.random() * 16) | 0).toString(16);
  });
  return (timestamp + randomHex).substring(0, 24);
}

// ✅ FONCTION POUR GÉNÉRER DES IDS MONGODB VALIDES
function generateMongoIds() {
  const userId = document.getElementById("userId");
  const conversationId = document.getElementById("conversationId");
  const receiverId = document.getElementById("receiverId");

  const mongoUserId = generateMongoObjectId();
  const mongoReceiverId = generateMongoObjectId();
  const mongoConversationId = generateMongoObjectId();

  userId.value = mongoUserId;
  receiverId.value = mongoReceiverId;
  conversationId.value = mongoConversationId;

  log("🔧 IDs MongoDB générés", "info", {
    userId: mongoUserId,
    receiverId: mongoReceiverId,
    conversationId: mongoConversationId,
  });

  setTimeout(() => validateMessageData(), 100);
}

// ✅ FONCTION POUR AFFICHER L'AIDE
function showValidationHelp() {
  const helpMessage = `
📋 AIDE VALIDATION DES DONNÉES:

🔐 Authentification:
- ID Utilisateur: Identifiant numérique (ex: 3)
- Matricule: Code utilisateur (ex: 559296X)

💬 Message:
- ID Conversation: Identifiant de la conversation
- ID Destinataire: REQUIS pour nouvelles conversations
- Contenu: Texte du message (obligatoire)
- Type: TEXT, IMAGE, ou FILE

✅ Validations automatiques:
- Vérification des champs obligatoires
- Validation que sender ≠ receiver
- Contrôle de la longueur des IDs
- Vérification de l'authentification

🔧 Outils disponibles:
- "Générer IDs Test": Crée des IDs de test
- "Validation": Vérifie les données avant envoi
  `;

  alert(helpMessage);
  log("ℹ️ Aide affichée", "info");
}

// ========================================
// NETTOYAGE
// ========================================

window.addEventListener("beforeunload", () => {
  if (pingInterval) {
    clearInterval(pingInterval);
  }
  if (socket) {
    socket.disconnect();
  }
});

// ========================================
// FONCTIONS POUR GÉRER LES MESSAGES REÇUS
// ========================================

function addReceivedMessage(type, title, originalData, displayData) {
  const message = {
    id: Date.now() + Math.random(),
    type: type, // 'message', 'typing', 'user', 'error'
    title: title,
    timestamp: new Date(),
    originalData: originalData,
    displayData: displayData,
  };

  receivedMessages.unshift(message); // Ajouter au début

  // Limiter à 100 messages
  if (receivedMessages.length > 100) {
    receivedMessages = receivedMessages.slice(0, 100);
  }

  messageCount = receivedMessages.length;
  updateMessageDisplay();
  updateMessageStats();
}

function updateMessageDisplay() {
  const display = document.getElementById("messagesDisplay");
  const filteredMessages = getFilteredMessages();

  if (filteredMessages.length === 0) {
    display.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <p>Aucun message dans cette catégorie</p>
        <small>Les messages de type "${currentMessageTab}" apparaîtront ici</small>
      </div>
    `;
    return;
  }

  const messagesHtml = filteredMessages
    .map((message) => createMessageHTML(message))
    .join("");
  display.innerHTML = messagesHtml;

  if (autoScroll) {
    display.scrollTop = display.scrollHeight;
  }
}

function createMessageHTML(message) {
  const timeStr = message.timestamp.toLocaleTimeString();
  const dateStr = message.timestamp.toLocaleDateString();

  return `
    <div class="message-item ${message.type}-type">
      <div class="message-header">
        <span class="message-type-badge ${message.type}">${message.title}</span>
        <span class="message-timestamp">${dateStr} ${timeStr}</span>
      </div>
      <div class="message-content">
        ${formatDisplayData(message.displayData)}
      </div>
      ${
        message.originalData
          ? `<div class="message-data">${JSON.stringify(
              message.originalData,
              null,
              2,
            )}</div>`
          : ""
      }
    </div>
  `;
}

function formatDisplayData(data) {
  if (!data) return "";

  let html = "";
  Object.entries(data).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      html += `<strong>${key}:</strong> ${escapeHtml(String(value))}<br>`;
    }
  });
  return html;
}

function getFilteredMessages() {
  if (currentMessageTab === "all") {
    return receivedMessages;
  }

  const typeMap = {
    messages: ["message"],
    typing: ["typing"],
    users: ["user"],
    errors: ["error"],
  };

  const allowedTypes = typeMap[currentMessageTab] || [];
  return receivedMessages.filter((msg) => allowedTypes.includes(msg.type));
}

function switchMessageTab(tab) {
  currentMessageTab = tab;

  // Mettre à jour l'UI des onglets
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.getElementById(tab + "Tab").classList.add("active");

  updateMessageDisplay();
  log(`🔄 Basculement vers l'onglet: ${tab}`, "info");
}

function clearMessages() {
  receivedMessages = [];
  messageCount = 0;
  updateMessageDisplay();
  updateMessageStats();
  log("🗑️ Messages effacés", "info");
}

function toggleAutoScroll() {
  autoScroll = !autoScroll;
  const btn = document.getElementById("autoScrollBtn");
  btn.textContent = `📜 Auto-scroll: ${autoScroll ? "ON" : "OFF"}`;
  btn.className = autoScroll ? "btn-success" : "btn-secondary";
  log(`📜 Auto-scroll ${autoScroll ? "activé" : "désactivé"}`, "info");
}

function updateMessageStats() {
  document.getElementById("messageCount").textContent =
    `${messageCount} messages`;
}

// ========================================
// FONCTIONS POUR GÉRER LES UTILISATEURS EN LIGNE
// ========================================

function updateOnlineUsersDisplay() {
  const grid = document.getElementById("onlineUsersGrid");
  const count = document.getElementById("onlineCount");

  count.textContent = `${onlineUsers.size} utilisateurs en ligne`;

  if (onlineUsers.size === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-users"></i>
        <p>Aucun utilisateur en ligne</p>
        <small>Les utilisateurs connectés apparaîtront ici</small>
      </div>
    `;
    return;
  }

  const usersHtml = Array.from(onlineUsers.values())
    .map(
      (user) => `
    <div class="user-card">
      <div class="user-avatar">
        ${getUserInitials(user.matricule)}
        <div class="online-dot"></div>
      </div>
      <div class="user-info">
        <div class="user-name">${escapeHtml(user.matricule)}</div>
        <div class="user-status">En ligne depuis ${formatRelativeTime(
          user.connectedAt,
        )}</div>
      </div>
    </div>
  `,
    )
    .join("");

  grid.innerHTML = usersHtml;
}

function getUserInitials(name) {
  if (!name) return "?";
  const parts = name.split(/[\s\-_]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// ========================================
// FONCTIONS POUR GÉRER LES INDICATEURS DE FRAPPE
// ========================================

function updateTypingDisplay() {
  const list = document.getElementById("typingList");

  if (typingUsers.size === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-keyboard"></i>
        <p>Personne n'écrit actuellement</p>
      </div>
    `;
    return;
  }

  const typingHtml = Array.from(typingUsers.values())
    .map(
      (user) => `
    <div class="typing-item">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
      <div>
        <div class="typing-user">${escapeHtml(user.userName)}</div>
        <div class="typing-conversation">dans ${user.conversationId}</div>
      </div>
    </div>
  `,
    )
    .join("");

  list.innerHTML = typingHtml;
}

// ========================================
// FONCTIONS UTILITAIRES
// ========================================

function formatRelativeTime(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return "quelques secondes";
  if (minutes < 60) return `${minutes} min`;
  if (hours < 24) return `${hours}h ${minutes % 60}min`;
  return date.toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ========================================
// ✅ FONCTIONS POUR MARQUER LES MESSAGES (AUTOMATIQUE)
// ========================================

/**
 * ✅ Marquer un message comme LIVRÉ (DELIVERED)
 * Appelée automatiquement à la réception de newMessage ou message:group
 */
function marquerCommeDelivered(messageId, conversationId) {
  try {
    if (!socket || !socket.connected || !isAuthenticated) {
      log(
        "⚠️ Socket non connecté ou non authentifié, marking DELIVERED non envoyé",
        "warning",
      );
      return;
    }

    if (!messageId || !conversationId) {
      log("⚠️ messageId ou conversationId manquant", "warning");
      return;
    }

    socket.emit("markMessageDelivered", {
      messageId: messageId,
      conversationId: conversationId,
    });

    log(`✅ Marquage DELIVERED envoyé pour message ${messageId}`, "success");
  } catch (error) {
    log(`❌ Erreur marquage DELIVERED: ${error.message}`, "error");
  }
}

/**
 * ✅ Marquer un message comme LU (READ)
 * Appelée automatiquement quand on charge les messages
 */
function marquerCommeRead(messageId, conversationId) {
  try {
    if (!socket || !socket.connected || !isAuthenticated) {
      log(
        "⚠️ Socket non connecté ou non authentifié, marking READ non envoyé",
        "warning",
      );
      return;
    }

    if (!messageId || !conversationId) {
      log("⚠️ messageId ou conversationId manquant", "warning");
      return;
    }

    socket.emit("markMessageRead", {
      messageId: messageId,
      conversationId: conversationId,
    });

    log(`📖 Marquage READ envoyé pour message ${messageId}`, "info");
  } catch (error) {
    log(`❌ Erreur marquage READ: ${error.message}`, "error");
  }
}

// ========================================
// AJOUTER UNE FONCTION POUR RÉCUPÉRER UN MESSAGE ID RÉEL DANS app.js
function getLastMessageId() {
  // Récupérer le dernier message envoyé pour avoir un ID réel
  const lastMessage = receivedMessages.find(
    (msg) =>
      msg.type === "message" &&
      msg.title === "✅ Message Envoyé" &&
      msg.originalData &&
      msg.originalData.messageId,
  );

  if (lastMessage) {
    const messageId = lastMessage.originalData.messageId;
    document.getElementById("messageIdStatus").value = messageId;
    log(`🔍 Message ID récupéré: ${messageId}`, "info");
    return messageId;
  } else {
    log("❌ Aucun message ID trouvé dans l'historique", "warning");
    return null;
  }
}

// ✅ AMÉLIORER LA FONCTION markMessageDelivered
function markMessageDelivered() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    return;
  }

  let messageId = document.getElementById("messageIdStatus")?.value.trim();
  const conversationId = document.getElementById("conversationId").value.trim();

  // ✅ SI PAS D'ID, ESSAYER DE RÉCUPÉRER LE DERNIER
  if (!messageId) {
    messageId = getLastMessageId();
    if (!messageId) {
      log("❌ ID du message requis", "error");
      return;
    }
  }

  const data = {
    messageId: messageId,
    conversationId: conversationId,
  };

  log("📬 Marquage message comme livré...", "info", data);
  socket.emit("markMessageDelivered", data);
}

// ✅ AMÉLIORER LA FONCTION markMessageRead
function markMessageRead() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    return;
  }

  let messageId = document.getElementById("messageIdStatus")?.value.trim();
  const conversationId = document.getElementById("conversationId").value.trim();

  // ✅ SI PAS D'ID, ESSAYER DE RÉCUPÉRER LE DERNIER
  if (!messageId) {
    messageId = getLastMessageId();
    if (!messageId) {
      log("❌ ID du message requis", "error");
      return;
    }
  }

  const data = {
    messageId: messageId,
    conversationId: conversationId,
  };

  log("📖 Marquage message comme lu...", "info", data);
  socket.emit("markMessageRead", data);
}

// ========================================
// NETTOYAGE AUTOMATIQUE DES INDICATEURS
// ========================================

// Nettoyer les indicateurs de frappe après 10 secondes d'inactivité
setInterval(() => {
  const now = new Date();
  let hasChanges = false;

  typingUsers.forEach((user, userId) => {
    if (now - user.startedAt > 10000) {
      // 10 secondes
      typingUsers.delete(userId);
      hasChanges = true;
    }
  });

  if (hasChanges) {
    updateTypingDisplay();
  }
}, 5000); // Vérifier toutes les 5 secondes

// ========================================
// FONCTIONS POUR GÉRER LES FICHIERS
// ========================================

// ✅ CORRIGER LA FONCTION fetchMyFiles (lignes ~1430-1450)
async function fetchMyFiles() {
  const statusDiv = document.getElementById("myFilesList");

  try {
    // ✅ RÉCUPÉRER LE TOKEN DEPUIS LES COOKIES
    const token = getCookie("token");

    if (!token) {
      statusDiv.innerHTML = `
        <div class="error-state">
          <i class="fas fa-lock"></i>
          <p>❌ Authentification requise</p>
          <small>Veuillez vous authentifier d'abord</small>
        </div>
      `;
      return;
    }

    // ✅ AFFICHER LE STATUT DE CHARGEMENT
    statusDiv.innerHTML =
      '<div class="loading">⏳ Chargement des fichiers...</div>';

    // ✅ AJOUTER LE TOKEN DANS LES HEADERS
    const headers = {
      Authorization: `Bearer ${token}`,
    };

    const res = await fetch("/files", {
      method: "GET",
      headers: headers,
    });

    // ✅ VÉRIFIER LE STATUT DE LA RÉPONSE
    if (res.status === 401) {
      statusDiv.innerHTML = `
        <div class="error-state">
          <i class="fas fa-lock"></i>
          <p>❌ Non autorisé</p>
          <small>Veuillez vous authentifier d'abord ou vérifier votre token</small>
        </div>
      `;
      log("❌ Erreur 401: Token manquant ou invalide", "error");
      return;
    }

    if (!res.ok) {
      throw new Error(`Erreur HTTP: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    if (data.success && data.data.files) {
      // ✅ AFFICHER LES FICHIERS AVEC PLUS D'INFORMATIONS
      const list = data.data.files
        .map((f) => {
          const size = formatFileSize(f.size);
          const date = f.createdAt
            ? new Date(f.createdAt).toLocaleDateString()
            : "Date inconnue";

          return `
            <li class="file-item">
              <div class="file-info">
                <a href="${
                  f.url || "/files/" + f.id
                }" target="_blank" class="file-link">
                  ${f.originalName}
                </a>
                <div class="file-meta">
                  <span class="file-size">${size}</span>
                  <span class="file-date">${date}</span>
                  <span class="file-type">${f.mimeType || "Type inconnu"}</span>
                </div>
              </div>
              <div class="file-actions">
                <button onclick="downloadFile('${
                  f.id
                }')" class="btn-mini">📥 Télécharger</button>
                <button onclick="deleteFile('${
                  f.id
                }')" class="btn-mini btn-danger">🗑️ Supprimer</button>
              </div>
            </li>
          `;
        })
        .join("");

      statusDiv.innerHTML = `
        <div class="files-list">
          <div class="files-header">
            <span>📁 ${data.data.files.length} fichier(s) trouvé(s)</span>
          </div>
          <ul class="files-grid">${list}</ul>
        </div>
      `;

      log(
        `✅ ${data.data.files.length} fichiers récupérés`,
        "success",
        data.data.files,
      );
    } else {
      statusDiv.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-folder-open"></i>
          <p>Aucun fichier trouvé</p>
          <small>Uploadez votre premier fichier pour le voir apparaître ici</small>
        </div>
      `;
      log("ℹ️ Aucun fichier trouvé", "info");
    }
  } catch (err) {
    statusDiv.innerHTML = `
      <div class="error-state">
        <i class="fas fa-exclamation-triangle"></i>
        <p>❌ Erreur de chargement</p>
        <small>${err.message}</small>
      </div>
    `;
    log("❌ Erreur récupération fichiers", "error", err);
  }
}

// ✅ AJOUTER CETTE FONCTION UTILITAIRE POUR FORMATER LA TAILLE
function formatFileSize(bytes) {
  if (!bytes) return "0 B";

  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
}

// ✅ AJOUTER CES FONCTIONS POUR LES ACTIONS SUR LES FICHIERS
async function downloadFile(fileId) {
  try {
    // const token = getCookie("token");

    // if (!token) {
    //   log("❌ Token manquant. Authentifiez-vous d'abord", "error");
    //   return;
    // }

    // const headers = {
    //   Authorization: `Bearer ${token}`,
    // };

    const res = await fetch(`/files/${fileId}/download`, {
      method: "GET",
      headers: headers,
    });

    if (res.status === 401) {
      log("❌ Non autorisé pour télécharger le fichier", "error");
      return;
    }

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || `Erreur HTTP: ${res.status}`);
    }

    // ✅ DÉCLENCHER LE TÉLÉCHARGEMENT
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `file_${fileId}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    log(`✅ Fichier ${fileId} téléchargé`, "success");
  } catch (err) {
    log(`❌ Erreur téléchargement fichier ${fileId}: ${err.message}`, "error");
  }
}

// ========================================
// ✅ FONCTIONS GESTION MESSAGES
// ========================================

function getMessages() {
  const conversationId = document
    .getElementById("messagesConversationId")
    ?.value.trim();

  if (!conversationId) {
    log("❌ ID conversation requis", "error");
    return;
  }

  log(`📥 Récupération messages pour ${conversationId}`, "info");
  socket.emit("getMessages", { conversationId });
}

function getMessagesQuickload() {
  const conversationId = document
    .getElementById("messagesConversationId")
    ?.value.trim();
  const limit = parseInt(document.getElementById("messagesLimit")?.value || 20);

  if (!conversationId) {
    log("❌ ID conversation requis", "error");
    return;
  }

  log(`⚡ Quick Load messages (limit ${limit})`, "info");
  socket.emit("messages:quickload", { conversationId, limit });
}

function getMessagesFullload() {
  const conversationId = document
    .getElementById("messagesConversationId")
    ?.value.trim();
  const limit = parseInt(document.getElementById("messagesLimit")?.value || 50);
  const cursor =
    document.getElementById("messagesCursor")?.value.trim() || null;

  if (!conversationId) {
    log("❌ ID conversation requis", "error");
    return;
  }

  log(`📚 Full Load messages (limit ${limit})`, "info");
  socket.emit("messages:fullload", { conversationId, limit, cursor });
}

function displayMessages(data) {
  const resultsDiv = document.getElementById("messagesResults");
  if (!resultsDiv) return;

  resultsDiv.style.display = "block";

  const statsDiv = document.getElementById("messagesStats");
  const listDiv = document.getElementById("messagesList");

  const messages = data.messages || [];
  const statsHtml = `
    <div class="stats-container">
      <div class="stat-item">
        <span class="stat-label">Total</span>
        <span class="stat-value">${messages.length}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">De Conversation</span>
        <span class="stat-value">${escapeHtml(data.conversationId || "")}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Cache</span>
        <span class="stat-value">${data.fromCache ? "✅ Oui" : "❌ Non"}</span>
      </div>
      ${
        data.hasMore
          ? `<div class="stat-item">
        <span class="stat-label">Plus disponible</span>
        <span class="stat-value">✅ Oui</span>
      </div>`
          : ""
      }
    </div>
  `;

  statsDiv.innerHTML = statsHtml;

  if (messages.length === 0) {
    listDiv.innerHTML = `
      <div class="empty-state">
        <p>Aucun message dans cette conversation</p>
      </div>
    `;
    return;
  }

  const messagesHtml = messages
    .map(
      (msg, idx) => `
    <div class="message-item conversation-message">
      <div class="message-meta">
        <span class="message-number">#${idx + 1}</span>
        <span class="message-author">${escapeHtml(msg.authorMatricule || msg.author || "Inconnu")}</span>
        <span class="message-time">${
          msg.createdAt
            ? new Date(msg.createdAt).toLocaleString()
            : "Temps inconnu"
        }</span>
      </div>
      <div class="message-body">
        <strong>Type:</strong> ${msg.type || "TEXT"}<br/>
        <strong>Contenu:</strong> ${escapeHtml((msg.content || "").substring(0, 100))}${
          (msg.content || "").length > 100 ? "..." : ""
        }<br/>
        <strong>Statut:</strong> ${msg.status || "SENT"}
      </div>
      <div class="message-id">ID: ${msg._id}</div>
    </div>
  `,
    )
    .join("");

  listDiv.innerHTML = messagesHtml;

  // ✅ MARQUER AUTOMATIQUEMENT TOUS LES MESSAGES COMME LUS
  // Délai légèrement pour s'assurer que le DOM est mis à jour
  setTimeout(() => {
    if (data.messages && Array.isArray(data.messages)) {
      let markedCount = 0;
      data.messages.forEach((msg) => {
        if (msg._id && data.conversationId && msg.status !== "READ") {
          marquerCommeRead(msg._id, data.conversationId);
          markedCount++;
        }
      });
      if (markedCount > 0) {
        log(
          `📖 ${markedCount} message(s) marqué(s) comme lus automatiquement`,
          "info",
        );
      }
    }
  }, 100);
}

// ========================================
// ✅ FONCTIONS GESTION CONVERSATIONS
// ========================================

let currentConversationsData = null;
let currentConversationTab = "all";

function getConversations() {
  const page = parseInt(
    document.getElementById("conversationsPage")?.value || 1,
  );
  const limit = parseInt(
    document.getElementById("conversationsLimit")?.value || 20,
  );

  log(`📥 Récupération conversations (page ${page}, limit ${limit})`, "info");

  socket.emit("getConversations", { page, limit });
}

function getConversationsQuickload() {
  const limit = parseInt(
    document.getElementById("conversationsLimit")?.value || 10,
  );

  log(`⚡ Quick Load conversations (limit ${limit})`, "info");

  socket.emit("conversations:quickload", { limit });
}

function getConversationsFullload() {
  const page = parseInt(
    document.getElementById("conversationsPage")?.value || 1,
  );
  const limit = parseInt(
    document.getElementById("conversationsLimit")?.value || 50,
  );

  log(`📚 Full Load conversations (page ${page}, limit ${limit})`, "info");

  socket.emit("conversations:fullload", { page, limit });
}

function displayConversations(data) {
  currentConversationsData = data;

  const resultsDiv = document.getElementById("conversationsResults");
  if (!resultsDiv) return;

  resultsDiv.style.display = "block";

  // ✅ AFFICHER LE CONTEXTE UTILISATEUR
  displayUserContext(data.userContext);

  // ✅ AFFICHER LES STATISTIQUES
  displayConversationsStats(data.stats, data.pagination);

  // ✅ METTRE À JOUR LES COMPTEURS DES ONGLETS
  updateConversationTabCounts(data);

  // ✅ AFFICHER LA LISTE SELON L'ONGLET ACTIF
  displayConversationsList(currentConversationTab);

  // ✅ AFFICHER LA PAGINATION
  displayConversationsPagination(data.pagination);
}

function displayUserContext(userContext) {
  const contextDiv = document.getElementById("userContext");
  if (!contextDiv || !userContext) return;

  contextDiv.innerHTML = `
    <div class="context-card">
      <h4>👤 Contexte Utilisateur</h4>
      <div class="context-info">
        <span><strong>ID:</strong> ${userContext.userId || "N/A"}</span>
        <span><strong>🏢 Département:</strong> ${
          userContext.departement || "N/A"
        }</span>
        <span><strong>🏛️ Ministère:</strong> ${
          userContext.ministere || "N/A"
        }</span>
      </div>
    </div>
  `;
}

function displayConversationsStats(stats, pagination) {
  const statsDiv = document.getElementById("conversationsStats");
  if (!statsDiv || !stats) return;

  statsDiv.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.total || 0}</div>
        <div class="stat-label">📋 Total</div>
      </div>
      <div class="stat-card highlight">
        <div class="stat-value">${stats.unread || 0}</div>
        <div class="stat-label">📬 Non lues</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.groups || 0}</div>
        <div class="stat-label">👥 Groupes</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.broadcasts || 0}</div>
        <div class="stat-label">📢 Diffusions</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.departement || 0}</div>
        <div class="stat-label">🏢 Département</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.private || 0}</div>
        <div class="stat-label">💬 Privées</div>
      </div>
      <div class="stat-card total">
        <div class="stat-value">${
          stats.unreadMessagesInGroups +
            stats.unreadMessagesInBroadcasts +
            stats.unreadMessagesInDepartement +
            stats.unreadMessagesInPrivate || 0
        }</div>
        <div class="stat-label">📨 Messages non lus</div>
      </div>
      ${
        pagination
          ? `
        <div class="stat-card">
          <div class="stat-value">${pagination.currentPage || 1} / ${
            pagination.totalPages || 1
          }</div>
          <div class="stat-label">📄 Page</div>
        </div>
      `
          : ""
      }
    </div>
  `;
}

function updateConversationTabCounts(data) {
  if (!data.stats) return;

  document.getElementById("convAllCount").textContent = data.stats.total || 0;
  document.getElementById("convUnreadCount").textContent =
    data.stats.unread || 0;
  document.getElementById("convGroupsCount").textContent =
    data.stats.groups || 0;
  document.getElementById("convBroadcastsCount").textContent =
    data.stats.broadcasts || 0;
  document.getElementById("convDepartementCount").textContent =
    data.stats.departement || 0;
  document.getElementById("convPrivateCount").textContent =
    data.stats.private || 0;
}

function switchConversationTab(tab) {
  currentConversationTab = tab;

  // Mettre à jour les boutons actifs
  document.querySelectorAll(".conversation-tabs .tab-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document
    .getElementById(`conv${tab.charAt(0).toUpperCase() + tab.slice(1)}Tab`)
    ?.classList.add("active");

  // Afficher la liste
  displayConversationsList(tab);
}

function displayConversationsList(tab) {
  const listDiv = document.getElementById("conversationsList");
  if (!listDiv || !currentConversationsData) return;

  let conversations = [];

  if (tab === "all") {
    conversations = currentConversationsData.conversations || [];
  } else {
    conversations = currentConversationsData.categorized?.[tab] || [];
  }

  if (conversations.length === 0) {
    listDiv.innerHTML = `
      <div class="empty-state">
        <p>Aucune conversation dans cette catégorie</p>
      </div>
    `;
    return;
  }

  listDiv.innerHTML = conversations
    .map(
      (conv) => `
    <div class="conversation-item ${conv.unreadCount > 0 ? "unread" : ""}">
      <div class="conv-header">
        <span class="conv-type">${getConversationTypeIcon(conv.type)}</span>
        <strong class="conv-name">${escapeHtml(
          conv.name || "Sans nom",
        )}</strong>
        ${
          conv.unreadCount > 0
            ? `<span class="unread-badge">${conv.unreadCount}</span>`
            : ""
        }
      </div>
      <div class="conv-info">
        <span class="conv-id">ID: ${conv._id}</span>
        <span class="conv-participants">👥 ${
          conv.participantCount || 0
        } participants</span>
      </div>
      ${
        conv.lastMessage
          ? `
        <div class="conv-last-message">
          <span class="last-msg-sender">${escapeHtml(
            getSenderName(conv.lastMessage, conv.userMetadata),
          )}:</span>
          <span class="last-msg-content">${escapeHtml(
            (conv.lastMessage.content || "").substring(0, 50),
          )}${conv.lastMessage.content?.length > 50 ? "..." : ""}</span>
        </div>
      `
          : ""
      }
      <div class="conv-actions">
        <button onclick="selectConversation('${
          conv._id
        }')" class="btn-mini btn-primary">📋 Sélectionner</button>
        <button onclick="joinConversationById('${
          conv._id
        }')" class="btn-mini btn-success">➕ Rejoindre</button>
      </div>
    </div>
  `,
    )
    .join("");
}

function displayConversationsPagination(pagination) {
  const paginationDiv = document.getElementById("conversationsPagination");
  if (!paginationDiv || !pagination) return;

  const { currentPage, totalPages, hasNext, hasPrevious } = pagination;

  paginationDiv.innerHTML = `
    <div class="pagination-controls">
      <button 
        onclick="goToConversationPage(${currentPage - 1})" 
        class="btn-secondary" 
        ${!hasPrevious ? "disabled" : ""}
      >
        ⬅️ Précédent
      </button>
      <span class="pagination-info">Page ${currentPage} / ${totalPages}</span>
      <button 
        onclick="goToConversationPage(${currentPage + 1})" 
        class="btn-secondary" 
        ${!hasNext ? "disabled" : ""}
      >
        Suivant ➡️
      </button>
    </div>
  `;
}

function goToConversationPage(page) {
  document.getElementById("conversationsPage").value = page;
  getConversations();
}

function selectConversation(conversationId) {
  document.getElementById("conversationId").value = conversationId;
  document.getElementById("fileConversationId").value = conversationId;
  document.getElementById("groupId").value = conversationId;

  log(`✅ Conversation ${conversationId} sélectionnée`, "success");
}

function joinConversationById(conversationId) {
  document.getElementById("conversationId").value = conversationId;
  joinConversation();
}

function getConversationTypeIcon(type) {
  const icons = {
    PRIVATE: "💬",
    GROUP: "👥",
    BROADCAST: "📢",
    CHANNEL: "📺",
    SUPPORT: "🆘",
  };
  return icons[type] || "💬";
}

// ✅ FONCTION POUR RÉCUPÉRER LE NOM DE L'EXPÉDITEUR
function getSenderName(lastMessage, userMetadata) {
  // 1. Si senderName existe et n'est pas "Utilisateur inconnu"
  if (
    lastMessage.senderName &&
    lastMessage.senderName !== "Utilisateur inconnu"
  ) {
    return lastMessage.senderName;
  }

  // 2. Chercher dans userMetadata par senderId
  if (lastMessage.senderId && Array.isArray(userMetadata)) {
    const sender = userMetadata.find(
      (meta) => meta.userId === lastMessage.senderId,
    );
    if (sender && sender.name && sender.name !== "Utilisateur inconnu") {
      return sender.name;
    }
  }

  // 3. Fallback: afficher le senderId ou "Inconnu"
  return lastMessage.senderId || "Inconnu";
}

// ✅ ÉVÉNEMENTS CONVERSATIONS DÉJÀ DÉFINIS DANS setupSocketEvents()

// ========================================
// ✅ FONCTIONS GESTION DES PARTICIPANTS
// ========================================

function addParticipant() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    return;
  }

  const conversationId = document
    .getElementById("participantConversationId")
    ?.value.trim();
  const rawInput = document.getElementById("participantUserId")?.value.trim();

  if (!conversationId) {
    log("❌ ID conversation requis", "error");
    updateStatus("participantStatus", "❌ ID conversation requis", "error");
    return;
  }

  if (!rawInput) {
    log("❌ ID participant(s) requis", "error");
    updateStatus("participantStatus", "❌ ID participant(s) requis", "error");
    return;
  }

  // ✅ Supporter un ID unique ou plusieurs séparés par virgule
  const ids = rawInput
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  const participantId = ids.length === 1 ? ids[0] : ids;

  const data = { conversationId, participantId };
  log(`➕ Ajout de ${ids.length} participant(s)...`, "info", data);
  updateStatus(
    "participantStatus",
    `⏳ Ajout de ${ids.length} participant(s) en cours...`,
    "info",
  );
  socket.emit("addParticipant", data);
}

function removeParticipant() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    return;
  }

  const conversationId = document
    .getElementById("participantConversationId")
    ?.value.trim();
  const rawInput = document.getElementById("participantUserId")?.value.trim();

  if (!conversationId) {
    log("❌ ID conversation requis", "error");
    updateStatus("participantStatus", "❌ ID conversation requis", "error");
    return;
  }

  if (!rawInput) {
    log("❌ ID participant(s) requis", "error");
    updateStatus("participantStatus", "❌ ID participant(s) requis", "error");
    return;
  }

  // ✅ Supporter un ID unique ou plusieurs séparés par virgule
  const ids = rawInput
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  const participantId = ids.length === 1 ? ids[0] : ids;

  const label = ids.length === 1 ? ids[0] : `${ids.length} participants`;
  if (!confirm(`Êtes-vous sûr de vouloir retirer ${label} ?`)) {
    return;
  }

  const data = { conversationId, participantId };
  log(`➖ Retrait de ${ids.length} participant(s)...`, "info", data);
  updateStatus(
    "participantStatus",
    `⏳ Retrait de ${ids.length} participant(s) en cours...`,
    "info",
  );
  socket.emit("removeParticipant", data);
}

// ========================================
// ✅ FONCTION QUITTER CONVERSATION DÉFINITIVEMENT
// ========================================

function leaveConversationPermanent() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    return;
  }

  const conversationId = document
    .getElementById("leaveConversationId")
    ?.value.trim();

  if (!conversationId) {
    log("❌ ID conversation requis", "error");
    updateStatus("leaveStatus", "❌ ID conversation requis", "error");
    return;
  }

  if (
    !confirm(
      `⚠️ Êtes-vous sûr de vouloir quitter définitivement la conversation ${conversationId} ? Cette action est irréversible !`,
    )
  ) {
    return;
  }

  const data = { conversationId };
  log("🚪 Quitter conversation définitivement...", "info", data);
  updateStatus("leaveStatus", "⏳ Sortie en cours...", "info");
  socket.emit("leaveConversationPermanent", data);
}

// ========================================
// ✅ FONCTION MODIFIER UN MESSAGE
// ========================================

function editMessage() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    return;
  }

  const messageId = document.getElementById("editMessageId")?.value.trim();
  const newContent = document
    .getElementById("editMessageContent")
    ?.value.trim();

  if (!messageId) {
    log("❌ ID message requis", "error");
    updateStatus("editMessageStatus", "❌ ID message requis", "error");
    return;
  }

  if (!newContent) {
    log("❌ Nouveau contenu requis", "error");
    updateStatus("editMessageStatus", "❌ Nouveau contenu requis", "error");
    return;
  }

  const data = { messageId, newContent };
  log("✏️ Modification du message...", "info", data);
  updateStatus("editMessageStatus", "⏳ Modification en cours...", "info");
  socket.emit("editMessage", data);
}

function fillEditMessageId() {
  const lastMessageId = getLastMessageId();
  if (lastMessageId) {
    document.getElementById("editMessageId").value = lastMessageId;
    log(`🔍 ID message rempli: ${lastMessageId}`, "info");
  }
}

// ========================================
// ✅ FONCTION SUPPRIMER UN MESSAGE
// ========================================

function deleteMessageAction() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    return;
  }

  const messageId = document.getElementById("deleteMessageId")?.value.trim();
  const deleteType = document.getElementById("deleteType")?.value || "FOR_ME";
  const conversationId = document
    .getElementById("deleteMessageConversationId")
    ?.value.trim();

  if (!messageId) {
    log("❌ ID message requis", "error");
    updateStatus("deleteMessageStatus", "❌ ID message requis", "error");
    return;
  }

  if (deleteType === "FOR_EVERYONE" && !conversationId) {
    log("❌ ID conversation requis pour supprimer pour tout le monde", "error");
    updateStatus(
      "deleteMessageStatus",
      "❌ ID conversation requis pour FOR_EVERYONE",
      "error",
    );
    return;
  }

  const confirmMsg =
    deleteType === "FOR_EVERYONE"
      ? "⚠️ Supprimer ce message pour TOUT LE MONDE ? (irréversible)"
      : "Supprimer ce message pour vous uniquement ?";

  if (!confirm(confirmMsg)) {
    return;
  }

  const data = { messageId, deleteType };
  if (conversationId) {
    data.conversationId = conversationId;
  }

  log(`🗑️ Suppression message (${deleteType})...`, "info", data);
  updateStatus("deleteMessageStatus", "⏳ Suppression en cours...", "info");
  socket.emit("deleteMessage", data);
}

function fillDeleteMessageId() {
  const lastMessageId = getLastMessageId();
  if (lastMessageId) {
    document.getElementById("deleteMessageId").value = lastMessageId;
    log(`🔍 ID message rempli: ${lastMessageId}`, "info");
  }
}

// ========================================
// ✅ FONCTION TRANSFÉRER UN MESSAGE
// ========================================

function forwardMessageAction() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    updateStatus(
      "forwardMessageStatus",
      "❌ Non connecté ou non authentifié",
      "error",
    );
    return;
  }

  const messageId = document.getElementById("forwardMessageId")?.value.trim();

  const rawTargets = document
    .getElementById("forwardTargetConversationIds")
    ?.value.trim();

  if (!messageId) {
    log("❌ ID message requis", "error");
    updateStatus("forwardMessageStatus", "❌ ID message requis", "error");
    return;
  }

  if (!rawTargets) {
    log("❌ Au moins un ID de conversation cible requis", "error");
    updateStatus(
      "forwardMessageStatus",
      "❌ Au moins un ID de conversation cible requis",
      "error",
    );
    return;
  }

  // Séparer par virgules ou retours à la ligne, filtrer les vides
  const targetConversationIds = rawTargets
    .split(/[,\n]+/)
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (targetConversationIds.length === 0) {
    log("❌ Aucun ID de conversation valide", "error");
    updateStatus(
      "forwardMessageStatus",
      "❌ Aucun ID de conversation valide",
      "error",
    );
    return;
  }

  if (targetConversationIds.length > 10) {
    log("❌ Maximum 10 conversations cibles", "error");
    updateStatus(
      "forwardMessageStatus",
      "❌ Maximum 10 conversations cibles",
      "error",
    );
    return;
  }

  const data = { messageId, targetConversationIds };
  log(
    `📤 Transfert du message vers ${targetConversationIds.length} conversation(s)...`,
    "info",
    data,
  );
  updateStatus(
    "forwardMessageStatus",
    `⏳ Transfert vers ${targetConversationIds.length} conversation(s) en cours...`,
    "info",
  );
  socket.emit("forwardMessage", data);
}

function fillForwardMessageId() {
  const lastMessageId = getLastMessageId();
  if (lastMessageId) {
    document.getElementById("forwardMessageId").value = lastMessageId;
    log(`🔍 ID message rempli: ${lastMessageId}`, "info");
  }
}

// ========================================
// ✅ FONCTION SUPPRIMER UN FICHIER (VIA WEBSOCKET)
// ========================================

function deleteFileAction() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    return;
  }

  const fileId = document.getElementById("deleteFileId")?.value.trim();
  const physicalDelete =
    document.getElementById("physicalDelete")?.checked !== false;

  if (!fileId) {
    log("❌ ID fichier requis", "error");
    updateStatus("deleteFileStatus", "❌ ID fichier requis", "error");
    return;
  }

  if (!confirm("⚠️ Êtes-vous sûr de vouloir supprimer ce fichier ?")) {
    return;
  }

  const data = { fileId, physicalDelete };
  log("🗑️ Suppression fichier...", "info", data);
  updateStatus("deleteFileStatus", "⏳ Suppression en cours...", "info");
  socket.emit("deleteFile", data);
}

// ========================================
// ✅ FONCTION TÉLÉCHARGER UN FICHIER
// ========================================

async function downloadFileById() {
  const fileId = document.getElementById("downloadFileId")?.value.trim();
  const statusDiv = document.getElementById("downloadFileStatus");

  if (!fileId) {
    log("❌ ID fichier requis", "error");
    if (statusDiv) {
      statusDiv.textContent = "❌ ID fichier requis";
      statusDiv.className = "status error";
    }
    return;
  }

  try {
    if (statusDiv) {
      statusDiv.textContent = "⏳ Téléchargement en cours...";
      statusDiv.className = "status info";
    }

    log(`📥 Téléchargement du fichier ${fileId}...`, "info");

    const res = await fetch(`/files/${fileId}/download`);

    if (!res.ok) {
      // ✅ RÉCUPÉRER LE MESSAGE D'ERREUR DU SERVEUR
      let errorMessage = `Erreur HTTP: ${res.status} ${res.statusText}`;
      try {
        const errorData = await res.json();
        if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (e) {
        // Si pas de JSON, garder le message par défaut
      }
      throw new Error(errorMessage);
    }

    // Récupérer le nom du fichier depuis les headers
    const contentDisposition = res.headers.get("content-disposition");
    let fileName = `file_${fileId}`;
    if (contentDisposition) {
      const match = contentDisposition.match(
        /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/,
      );
      if (match && match[1]) {
        fileName = match[1].replace(/['"]/g, "");
      }
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    if (statusDiv) {
      statusDiv.textContent = `✅ Fichier "${fileName}" téléchargé avec succès`;
      statusDiv.className = "status success";
    }
    log(`✅ Fichier ${fileId} téléchargé: ${fileName}`, "success");
  } catch (err) {
    if (statusDiv) {
      statusDiv.textContent = `❌ Erreur: ${err.message}`;
      statusDiv.className = "status error";
    }
    log(`❌ Erreur téléchargement fichier ${fileId}: ${err.message}`, "error");
  }
}

// ========================================
// ✅ FONCTION UTILITAIRE POUR METTRE À JOUR LES STATUS
// ========================================

function updateStatus(elementId, message, type) {
  const statusDiv = document.getElementById(elementId);
  if (statusDiv) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
  }
}

async function deleteFile(fileId) {
  if (!confirm("Êtes-vous sûr de vouloir supprimer ce fichier ?")) {
    return;
  }

  try {
    const token = getCookie("token");

    const headers = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`/files/${fileId}`, {
      method: "DELETE",
      headers: headers,
    });

    if (res.status === 401) {
      log("❌ Non autorisé pour supprimer le fichier", "error");
      return;
    }

    if (!res.ok) {
      throw new Error(`Erreur HTTP: ${res.status}`);
    }

    const data = await res.json();

    if (data.success) {
      log(`✅ Fichier ${fileId} supprimé`, "success");
      // ✅ RAFRAÎCHIR LA LISTE
      fetchMyFiles();
    } else {
      throw new Error(data.message || "Erreur suppression");
    }
  } catch (err) {
    log(`❌ Erreur suppression fichier ${fileId}`, "error", err);
  }
}

// ✅ MODIFIER handleFileUpload POUR UTILISER LES HEADERS
async function handleFileUpload(e) {
  e.preventDefault();
  const fileInput = document.getElementById("fileInput");
  const conversationIdInput = document.getElementById("fileConversationId");
  const statusDiv = document.getElementById("fileUploadStatus");

  if (!fileInput.files.length) {
    statusDiv.textContent = "❌ Aucun fichier sélectionné";
    statusDiv.className = "status error";
    return;
  }

  const file = fileInput.files[0];
  const conversationId = conversationIdInput.value.trim();
  const formData = new FormData();
  formData.append("file", file);
  if (conversationId) formData.append("conversationId", conversationId);

  statusDiv.textContent = "⏳ Upload en cours...";
  statusDiv.className = "status info";

  try {
    // ✅ AJOUTER LE TOKEN DANS LES HEADERS
    // const headers = {
    //   Authorization: `Bearer ${token}`,
    // };

    const res = await fetch("/files/upload", {
      method: "POST",
      body: formData,
      headers: { "user-id": "570479H" },
    });

    const data = await res.json();

    if (data.success) {
      statusDiv.textContent = "✅ Fichier envoyé avec succès";
      statusDiv.className = "status success";
      log("✅ Fichier uploadé", "success", data.data);

      setTimeout(() => {
        fetchMyFiles();
      }, 1000);

      fileInput.value = "";
      conversationIdInput.value = "";
    } else {
      statusDiv.textContent = "❌ " + (data.message || "Erreur upload");
      statusDiv.className = "status error";
      log("❌ Erreur upload fichier", "error", data);
    }
  } catch (err) {
    statusDiv.textContent = "❌ Erreur: " + err.message;
    statusDiv.className = "status error";
    log("❌ Erreur upload", "error", err);
  }
}

// ========================================
// ✅ FONCTION AFFICHER UTILISATEURS EN LIGNE PAR CONVERSATION
// ========================================

function displayConversationOnlineUsers(data) {
  const conversationId = data.conversationId;
  const users = data.users || [];
  const onlineUsers = data.onlineUsers || 0;
  const totalUsers = data.totalUsers || 0;

  log(
    `👥 Affichage ${onlineUsers}/${totalUsers} utilisateurs en ligne pour conversation ${conversationId}`,
    "info",
  );

  // Optionnel : afficher quelque part dans l'interface
  const message = {
    conversationId,
    onlineCount: onlineUsers,
    totalCount: totalUsers,
    usersList: users.map((u) => u.matricule || u.userId).join(", "),
  };

  console.log("👥 Utilisateurs en ligne:", message);
}

// ========================================
// ✅ FONCTIONS APPELS (CALL / VIDEO_CALL)
// ========================================

function initiateCall() {
  if (!socket || !isAuthenticated) {
    alert("Veuillez vous authentifier d'abord");
    return;
  }

  const conversationId = document
    .getElementById("callConversationId")
    .value.trim();
  const receiverId = document.getElementById("callReceiverId").value.trim();
  const callType = document.getElementById("callType").value;

  if (!conversationId && !receiverId) {
    updateStatus(
      "initiateCallStatus",
      "❌ conversationId ou receiverId requis",
      "error",
    );
    return;
  }

  const data = { callType };
  if (conversationId) data.conversationId = conversationId;
  if (receiverId) data.receiverId = receiverId;

  log(`📞 Initiation appel ${callType}...`, "info", data);
  updateStatus(
    "initiateCallStatus",
    "⏳ Initiation de l'appel en cours...",
    "info",
  );
  socket.emit("initiateCall", data);
}

function answerCall() {
  if (!socket || !isAuthenticated) {
    alert("Veuillez vous authentifier d'abord");
    return;
  }

  const callId = document.getElementById("activeCallId").value.trim();
  const messageId = document.getElementById("activeCallMessageId").value.trim();
  const conversationId = document
    .getElementById("activeCallConversationId")
    .value.trim();

  if (!callId || !messageId) {
    updateStatus("callActionStatus", "❌ callId et messageId requis", "error");
    return;
  }

  const data = { callId, messageId };
  if (conversationId) data.conversationId = conversationId;

  log("✅ Réponse à l'appel...", "info", data);
  updateStatus("callActionStatus", "⏳ Décrochage en cours...", "info");
  socket.emit("answerCall", data);
}

function declineCall() {
  if (!socket || !isAuthenticated) {
    alert("Veuillez vous authentifier d'abord");
    return;
  }

  const callId = document.getElementById("activeCallId").value.trim();
  const messageId = document.getElementById("activeCallMessageId").value.trim();
  const conversationId = document
    .getElementById("activeCallConversationId")
    .value.trim();

  if (!callId) {
    updateStatus("callActionStatus", "❌ callId requis", "error");
    return;
  }

  const data = { callId };
  if (messageId) data.messageId = messageId;
  if (conversationId) data.conversationId = conversationId;

  log("❌ Refus de l'appel...", "info", data);
  updateStatus("callActionStatus", "⏳ Refus en cours...", "info");
  socket.emit("declineCall", data);
}

function endCall() {
  if (!socket || !isAuthenticated) {
    alert("Veuillez vous authentifier d'abord");
    return;
  }

  const callId = document.getElementById("activeCallId").value.trim();
  const messageId = document.getElementById("activeCallMessageId").value.trim();
  const conversationId = document
    .getElementById("activeCallConversationId")
    .value.trim();

  if (!callId) {
    updateStatus("callActionStatus", "❌ callId requis", "error");
    return;
  }

  const data = { callId, reason: "user_hangup" };
  if (messageId) data.messageId = messageId;
  if (conversationId) data.conversationId = conversationId;

  log("📴 Fin de l'appel...", "info", data);
  updateStatus("callActionStatus", "⏳ Raccordage en cours...", "info");
  socket.emit("endCall", data);
}

function missedCall() {
  if (!socket || !isAuthenticated) {
    alert("Veuillez vous authentifier d'abord");
    return;
  }

  const callId = document.getElementById("activeCallId").value.trim();
  const messageId = document.getElementById("activeCallMessageId").value.trim();
  const conversationId = document
    .getElementById("activeCallConversationId")
    .value.trim();

  if (!callId) {
    updateStatus("callActionStatus", "❌ callId requis", "error");
    return;
  }

  const data = { callId };
  if (messageId) data.messageId = messageId;
  if (conversationId) data.conversationId = conversationId;

  log("📵 Signalement appel manqué...", "info", data);
  updateStatus("callActionStatus", "⏳ Signalement en cours...", "info");
  socket.emit("missedCall", data);
}

function addCallLogEntry(action, callType, callId, conversationId, extra = "") {
  const callLog = document.getElementById("callLog");
  if (!callLog) return;

  const now = new Date().toLocaleTimeString();
  const typeLabel = callType ? ` [${callType}]` : "";
  const convLabel = conversationId
    ? ` conv:${conversationId.substring(0, 8)}...`
    : "";
  const entry = document.createElement("div");
  entry.style.cssText =
    "padding: 4px 0; border-bottom: 1px solid #333; color: #ccc;";
  entry.innerHTML = `<span style="color:#888">${now}</span> <strong>${action}</strong>${typeLabel} <span style="color:#6cf">ID:${callId ? callId.substring(0, 8) + "..." : "N/A"}</span>${convLabel} ${extra}`;
  callLog.prepend(entry);
}

function clearCallLog() {
  const callLog = document.getElementById("callLog");
  if (callLog)
    callLog.innerHTML =
      '<div style="color:#888; text-align:center;">Journal vide</div>';
}

// ========================================
// FONCTIONS CHIFFREMENT E2EE
// ========================================

// Stockage de la paire de clés générée (en mémoire, côté test uniquement)
let e2eeKeyPair = null;

/**
 * Génère une paire de clés RSA-OAEP 4096 bits via SubtleCrypto (Web API)
 * et exporte la clé publique au format PEM SPKI.
 */
async function generateE2EEKeyPair() {
  updateStatus(
    "e2eeRegisterStatus",
    "⏳ Génération de la paire RSA-4096...",
    "info",
  );
  try {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"],
    );

    // Export clé publique → PEM SPKI
    const spki = await window.crypto.subtle.exportKey(
      "spki",
      keyPair.publicKey,
    );
    const b64 = btoa(String.fromCharCode(...new Uint8Array(spki)));
    const pem = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----`;

    // Export clé privée → PEM PKCS8 (stockée en mémoire uniquement)
    const pkcs8 = await window.crypto.subtle.exportKey(
      "pkcs8",
      keyPair.privateKey,
    );
    const b64priv = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
    const pemPriv = `-----BEGIN PRIVATE KEY-----\n${b64priv.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----`;

    e2eeKeyPair = {
      publicKey: pem,
      privateKey: pemPriv,
      cryptoKeyPair: keyPair,
    };

    document.getElementById("e2eePublicKeyDisplay").textContent = pem;
    updateStatus(
      "e2eeRegisterStatus",
      "✅ Paire RSA-4096 générée — prête à enregistrer",
      "success",
    );
    log("🔑 Paire RSA-4096 générée avec succès", "success");
  } catch (err) {
    updateStatus(
      "e2eeRegisterStatus",
      `❌ Erreur génération: ${err.message}`,
      "error",
    );
    log(`❌ Erreur génération RSA: ${err.message}`, "error");
  }
}

/**
 * Auto-enregistre la clé publique E2EE juste après l'authentification.
 * Génère une nouvelle paire si nécessaire.
 */
async function autoRegisterE2EEKey() {
  try {
    if (!socket || !isAuthenticated) {
      log(
        "⚠️ Impossible d'auto-enregistrer : socket ou auth non disponible",
        "warning",
      );
      return;
    }

    if (!e2eeKeyPair) {
      log("🔑 Génération automatique de la paire RSA-4096...", "info");
      // Génération silencieuse sans toucher les statuts de la section E2EE
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: "RSA-OAEP",
          modulusLength: 4096,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"],
      );
      const spki = await window.crypto.subtle.exportKey(
        "spki",
        keyPair.publicKey,
      );
      const b64 = btoa(String.fromCharCode(...new Uint8Array(spki)));
      const pem = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----`;
      const pkcs8 = await window.crypto.subtle.exportKey(
        "pkcs8",
        keyPair.privateKey,
      );
      const b64priv = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
      const pemPriv = `-----BEGIN PRIVATE KEY-----\n${b64priv.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----`;
      e2eeKeyPair = {
        publicKey: pem,
        privateKey: pemPriv,
        cryptoKeyPair: keyPair,
      };

      // Mise à jour UI si l'élément existe
      const displayEl = document.getElementById("e2eePublicKeyDisplay");
      if (displayEl) {
        displayEl.textContent = pem;
      }
      log("✅ Paire RSA-4096 générée automatiquement", "success");
    }

    log("📤 Émission encryption:registerKey (auto)...", "info");
    socket.emit("encryption:registerKey", {
      publicKey: e2eeKeyPair.publicKey,
      deviceInfo: { platform: "web-test-client", deviceName: "HTML Testeur" },
    });
    log("🔑 Auto-enregistrement clé E2EE après auth — émis", "info");
  } catch (err) {
    log(`⚠️ Auto-enregistrement E2EE échoué: ${err.message}`, "error");
    console.error("Erreur auto-register E2EE:", err);
  }
}

/**
 * Enregistre manuellement la clé publique générée auprès du serveur.
 */
function registerE2EEKey() {
  if (!socket || !isAuthenticated) {
    alert("Authentifiez-vous d'abord");
    return;
  }
  if (!e2eeKeyPair) {
    updateStatus(
      "e2eeRegisterStatus",
      "❌ Générez d'abord une paire de clés",
      "error",
    );
    return;
  }

  updateStatus("e2eeRegisterStatus", "⏳ Enregistrement...", "info");
  socket.emit("encryption:registerKey", {
    publicKey: e2eeKeyPair.publicKey,
    deviceInfo: { platform: "web-test-client", deviceName: "HTML Testeur" },
  });
  log("📤 Émission encryption:registerKey", "info");
}

/**
 * Récupère la clé publique d'un autre utilisateur.
 */
function getRecipientPublicKey() {
  if (!socket || !isAuthenticated) {
    alert("Authentifiez-vous d'abord");
    return;
  }
  const targetUserId = document.getElementById("e2eeTargetUserId").value.trim();
  if (!targetUserId) {
    updateStatus("e2eeGetKeyStatus", "❌ Entrez un userId cible", "error");
    return;
  }

  updateStatus(
    "e2eeGetKeyStatus",
    `⏳ Récupération clé de ${targetUserId}...`,
    "info",
  );
  socket.emit("encryption:getPublicKey", { targetUserId });
  log(`📤 Émission encryption:getPublicKey pour ${targetUserId}`, "info");
}

/**
 * Récupère la configuration de chiffrement active.
 */
function getEncryptionConfig() {
  if (!socket || !isAuthenticated) {
    alert("Authentifiez-vous d'abord");
    return;
  }
  updateStatus("e2eeConfigStatus", "⏳ Récupération config...", "info");
  socket.emit("encryption:getConfig");
  log("📤 Émission encryption:getConfig", "info");
}

/**
 * Change le mode de chiffrement (admin uniquement).
 */
function switchEncryptionMode() {
  if (!socket || !isAuthenticated) {
    alert("Authentifiez-vous d'abord");
    return;
  }
  const mode = document.getElementById("e2eeSwitchModeSelect").value;
  updateStatus(
    "e2eeSwitchStatus",
    `⏳ Changement vers mode: ${mode}...`,
    "info",
  );
  socket.emit("encryption:switchMode", { mode });
  log(`📤 Émission encryption:switchMode → ${mode}`, "info");
}

/**
 * Révoque la clé publique de l'utilisateur connecté.
 */
function revokeE2EEKey() {
  if (!socket || !isAuthenticated) {
    alert("Authentifiez-vous d'abord");
    return;
  }
  if (
    !confirm(
      "⚠️ Révoquer votre clé E2EE ? Les messages futurs ne pourront plus être chiffrés jusqu'à réenregistrement.",
    )
  )
    return;
  updateStatus("e2eeRevokeStatus", "⏳ Révocation en cours...", "info");
  socket.emit("encryption:revokeKey");
  e2eeKeyPair = null;
  document.getElementById("e2eePublicKeyDisplay").textContent = "(aucune clé)";
  log("📤 Émission encryption:revokeKey", "warning");
}

/**
 * Test de diagnostic E2EE complet
 */
function testE2EEConnection() {
  console.log("🔍 ═══════════════════════════════════════════════════════");
  console.log("🔍 DIAGNOSTIC E2EE COMPLET");
  console.log("🔍 ═══════════════════════════════════════════════════════");

  // 1. Vérifier l'état du socket
  console.log("\n1️⃣ État Socket.IO");
  console.log("   socket existe:", !!socket);
  console.log("   socket.connected:", socket?.connected);
  console.log("   socket.id:", socket?.id);

  // 2. Vérifier l'authentification
  console.log("\n2️⃣ État Authentification");
  console.log("   isAuthenticated:", isAuthenticated);
  console.log("   currentUser:", currentUser);
  console.log("   socket.userId:", socket?.userId);

  // 3. Vérifier la paire de clés
  console.log("\n3️⃣ Paire de clés E2EE");
  console.log("   e2eeKeyPair existe:", !!e2eeKeyPair);
  if (e2eeKeyPair) {
    console.log("   publicKey length:", e2eeKeyPair.publicKey?.length);
    console.log(
      "   publicKey preview:",
      e2eeKeyPair.publicKey?.substring(0, 50) + "...",
    );
  }

  // 4. Vérifier les éléments DOM
  console.log("\n4️⃣ Éléments DOM");
  const elements = [
    "e2eePublicKeyDisplay",
    "e2eeFingerprint",
    "e2eeKeyVersion",
    "e2eeCurrentMode",
  ];
  elements.forEach((id) => {
    const el = document.getElementById(id);
    console.log(
      `   ${id}:`,
      !!el,
      el ? `(${el.textContent?.substring(0, 20)}...)` : "",
    );
  });

  // 5. Test d'émission
  console.log("\n5️⃣ Test Émission Socket");
  if (!socket || !socket.connected) {
    console.error("   ❌ Socket non connecté");
  } else if (!isAuthenticated) {
    console.error("   ❌ Non authentifié");
  } else {
    console.log("   ✅ Prêt à émettre");

    // Test avec un événement factice
    console.log("   📤 Test avec encryption:getConfig...");
    socket.emit("encryption:getConfig");

    // Si paire existe, tester l'enregistrement
    if (e2eeKeyPair) {
      console.log("   📤 Test avec encryption:registerKey...");
      socket.emit("encryption:registerKey", {
        publicKey: e2eeKeyPair.publicKey,
        deviceInfo: { platform: "diagnostic-test", deviceName: "Test Manual" },
      });
    } else {
      console.log("   ⚠️  Pas de paire de clés, génération...");
      generateE2EEKeyPair().then(() => {
        console.log("   ✅ Génération terminée, réessayez le diagnostic");
      });
    }
  }

  console.log("\n🔍 ═══════════════════════════════════════════════════════");
  console.log("🔍 Vérifiez les logs du serveur pour voir si les événements");
  console.log("🔍 encryption:* sont bien reçus côté serveur.");
  console.log("🔍 ═══════════════════════════════════════════════════════\n");

  log("🔍 Diagnostic E2EE exécuté — voir console (F12)", "info");
}

// ========================================
// 💾 FONCTIONS CLIENT POUR LE BACKUP
// ========================================

function showBackupProgress(show) {
  const container = document.getElementById("backupProgressContainer");
  if (container) {
    container.style.display = show ? "block" : "none";
  }
}

function updateBackupProgressUI(step, percentage, message) {
  const stepEl = document.getElementById("backupProgressStep");
  const pctEl = document.getElementById("backupProgressPct");
  const barEl = document.getElementById("backupProgressBar");
  const msgEl = document.getElementById("backupProgressMessage");

  if (stepEl) stepEl.textContent = `Étape : ${step}`;
  if (pctEl) pctEl.textContent = `${percentage}%`;
  if (barEl) barEl.style.width = `${percentage}%`;
  if (msgEl) msgEl.textContent = message;
}

function showBackupHTTPStatus(text) {
  const statusEl = document.getElementById("backupStatus");
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.style.display = text ? "block" : "none";
  }
}

// --- Socket.IO backup operations ---

function startSocketBackup() {
  if (!socket || !socket.connected) {
    showBackupHTTPStatus("❌ Erreur : Socket non connecté.");
    return;
  }
  const label = document.getElementById("backupSocketLabel")?.value.trim() || "socket-backup";
  const conversationId = document.getElementById("backupSocketConvId")?.value.trim() || null;
  
  showBackupHTTPStatus("⏳ Lancement de la sauvegarde via Socket.IO...");
  socket.emit("backup:start", { label, conversationId });
}

function suspendSocketBackup() {
  if (!socket || !socket.connected) {
    showBackupHTTPStatus("❌ Erreur : Socket non connecté.");
    return;
  }
  socket.emit("backup:suspend");
}

function resumeSocketBackup() {
  if (!socket || !socket.connected) {
    showBackupHTTPStatus("❌ Erreur : Socket non connecté.");
    return;
  }
  socket.emit("backup:resume");
}

function cancelSocketBackup() {
  if (!socket || !socket.connected) {
    showBackupHTTPStatus("❌ Erreur : Socket non connecté.");
    return;
  }
  socket.emit("backup:cancel");
}

function statusSocketBackup() {
  if (!socket || !socket.connected) {
    showBackupHTTPStatus("❌ Erreur : Socket non connecté.");
    return;
  }
  socket.emit("backup:status");
}

// --- HTTP REST backup operations ---

function getAuthHeaders() {
  const token = getCookie("token");
  const userId = document.getElementById("userId")?.value.trim();
  const headers = {};
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (userId) {
    headers["user-id"] = userId;
  }
  return headers;
}

async function exportBackupHTTP() {
  const headers = getAuthHeaders();
  if (Object.keys(headers).length === 0) {
    showBackupHTTPStatus("❌ Erreur : Veuillez renseigner un ID utilisateur ou vous authentifier d'abord.");
    return;
  }
  
  showBackupHTTPStatus("⏳ Lancement de l'export HTTP...");
  try {
    const res = await fetch("/backups/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify({
        label: "http-backup"
      })
    });
    const data = await res.json();
    if (res.ok) {
      showBackupHTTPStatus(`✅ Export Réussi (202 Accepted) !\n` + JSON.stringify(data.data, null, 2));
      if (data.data.objectPath) {
        document.getElementById("backupObjectPath").value = data.data.objectPath;
      }
    } else {
      showBackupHTTPStatus(`❌ Erreur export HTTP : ${data.message || res.statusText}`);
    }
  } catch (error) {
    showBackupHTTPStatus(`❌ Erreur export HTTP : ${error.message}`);
  }
}

async function listBackupsHTTP() {
  const headers = getAuthHeaders();
  if (Object.keys(headers).length === 0) {
    showBackupHTTPStatus("❌ Erreur : Veuillez renseigner un ID utilisateur ou vous authentifier d'abord.");
    return;
  }
  
  showBackupHTTPStatus("⏳ Récupération de la liste des backups...");
  try {
    const res = await fetch("/backups", {
      method: "GET",
      headers: headers
    });
    const data = await res.json();
    if (res.ok) {
      const backups = data.data.backups || [];
      if (backups.length === 0) {
        showBackupHTTPStatus("Aucun backup trouvé pour cet utilisateur.");
      } else {
        const text = backups.map(b => `- ${b.name} (${formatFileSize(b.size)} | Modifié le : ${new Date(b.lastModified).toLocaleString()})`).join("\n");
        showBackupHTTPStatus(`📋 Liste des backups (${backups.length}) :\n${text}`);
      }
    } else {
      showBackupHTTPStatus(`❌ Erreur liste backups : ${data.message || res.statusText}`);
    }
  } catch (error) {
    showBackupHTTPStatus(`❌ Erreur liste backups : ${error.message}`);
  }
}

async function restoreBackupHTTP() {
  const headers = getAuthHeaders();
  if (Object.keys(headers).length === 0) {
    showBackupHTTPStatus("❌ Erreur : Veuillez renseigner un ID utilisateur ou vous authentifier d'abord.");
    return;
  }
  const objectPath = document.getElementById("backupObjectPath").value.trim();
  if (!objectPath) {
    showBackupHTTPStatus("❌ Erreur : Le chemin d'objet est requis.");
    return;
  }
  const dryRun = document.getElementById("backupDryRun").checked;

  showBackupHTTPStatus(`⏳ Restauration en cours (dryRun=${dryRun})...`);
  try {
    const res = await fetch("/backups/restore", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify({ objectPath, dryRun })
    });
    const data = await res.json();
    if (res.ok) {
      showBackupHTTPStatus(`✅ Restauration Réussie !\n` + JSON.stringify(data.data, null, 2));
    } else {
      showBackupHTTPStatus(`❌ Erreur Restauration : ${data.message || res.statusText}`);
    }
  } catch (error) {
    showBackupHTTPStatus(`❌ Erreur Restauration : ${error.message}`);
  }
}

async function downloadBackupHTTP() {
  const headers = getAuthHeaders();
  if (Object.keys(headers).length === 0) {
    showBackupHTTPStatus("❌ Erreur : Veuillez renseigner un ID utilisateur ou vous authentifier d'abord.");
    return;
  }
  const objectPath = document.getElementById("backupObjectPath").value.trim();
  if (!objectPath) {
    showBackupHTTPStatus("❌ Erreur : Le chemin d'objet est requis.");
    return;
  }

  showBackupHTTPStatus("⏳ Génération de l'URL de téléchargement...");
  try {
    const res = await fetch(`/backups/download?objectPath=${encodeURIComponent(objectPath)}`, {
      method: "GET",
      headers: headers
    });
    const data = await res.json();
    if (res.ok) {
      const url = data.data.downloadUrl;
      showBackupHTTPStatus(`✅ URL générée avec succès (valide 1h) :\n\n👉 Cliquez pour télécharger :\n${url}`);
    } else {
      showBackupHTTPStatus(`❌ Erreur URL de téléchargement : ${data.message || res.statusText}`);
    }
  } catch (error) {
    showBackupHTTPStatus(`❌ Erreur URL de téléchargement : ${error.message}`);
  }
}

async function deleteBackupHTTP() {
  const headers = getAuthHeaders();
  if (Object.keys(headers).length === 0) {
    showBackupHTTPStatus("❌ Erreur : Veuillez renseigner un ID utilisateur ou vous authentifier d'abord.");
    return;
  }
  const objectPath = document.getElementById("backupObjectPath").value.trim();
  if (!objectPath) {
    showBackupHTTPStatus("❌ Erreur : Le chemin d'objet est requis.");
    return;
  }

  if (!confirm(`Voulez-vous vraiment supprimer le backup :\n${objectPath} ?`)) {
    return;
  }

  showBackupHTTPStatus("⏳ Suppression en cours...");
  try {
    const res = await fetch("/backups", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify({ objectPath })
    });
    const data = await res.json();
    if (res.ok) {
      showBackupHTTPStatus(`🗑️ Backup supprimé avec succès !`);
      document.getElementById("backupObjectPath").value = "";
    } else {
      showBackupHTTPStatus(`❌ Erreur Suppression : ${data.message || res.statusText}`);
    }
  } catch (error) {
    showBackupHTTPStatus(`❌ Erreur Suppression : ${error.message}`);
  }
}
