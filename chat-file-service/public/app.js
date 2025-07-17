// Configuration
const CONFIG = {
  SERVER_URL: "http://localhost:8003",
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 2000,
  PING_INTERVAL: 30000,
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
        "info"
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
      "success"
    );
  });

  socket.on("auth_error", (data) => {
    log("❌ Erreur d'authentification", "error", data);
    isAuthenticated = false;
    currentUser = null;
    updateAuthStatus(
      `❌ Erreur: ${data.message} (Code: ${data.code})`,
      "error"
    );
  });

  // ========================================
  // ÉVÉNEMENTS DE MESSAGES AMÉLIORÉS
  // ========================================

  socket.on("newMessage", (data) => {
    log("💬 Nouveau message reçu", "info", data);
    addReceivedMessage("message", "💬 Nouveau Message", data, {
      sender: data.senderName || data.senderId,
      content: data.content,
      conversation: data.conversationId,
    });
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
          args.length > 0 ? args[0] : null
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

    // Traitement existant...
    addReceivedMessage("message", "💬 Nouveau Message", data, {
      sender: data.senderName || data.senderId,
      content: data.content,
      conversation: data.conversationId,
      requiresReceipt: data.requiresDeliveryReceipt,
    });
  });

  socket.on("messagesLoaded", (data) => {
    log("📥 Messages récupérés", "info", data);
    const list = document.getElementById("allMessagesList");
    if (Array.isArray(data.messages)) {
      list.innerHTML = data.messages
        .map(
          (msg) =>
            `<div class="message-item">
            <strong>${escapeHtml(msg.senderId)}</strong> :
            ${escapeHtml(msg.content)}
            <span class="msg-status">${msg.status}</span>
            <span class="msg-date">${new Date(
              msg.timestamp
            ).toLocaleString()}</span>
          </div>`
        )
        .join("");
    } else {
      list.innerHTML = "<div>Aucun message reçu</div>";
    }
  });

  socket.on("userTyping", (data) => {
    log("⌨️ Frappe dans la conversation", "info", data);
    typingUsers.set(data.userId, {
      userId: data.userId,
      userName: data.matricule || data.userId,
      conversationId: data.conversationId,
      startedAt: new Date(),
    });
    updateTypingDisplay();
  });

  socket.on("userStoppedTyping", (data) => {
    typingUsers.delete(data.userId);
    updateTypingDisplay();
  });
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
    conversationId: "60f7b3b3b3b3b3b3b3b3b3b4",
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
      2
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

  // Vérification ObjectId MongoDB
  if (conversationId && !/^[0-9a-fA-F]{24}$/.test(conversationId)) {
    messages.push(
      "❌ L'ID de conversation doit être un ObjectId MongoDB valide (24 caractères hexa)"
    );
    isValid = false;
  }

  // receiverId requis si conversationId est un ObjectId (nouvelle conversation)
  if (conversationId && conversationId.length === 24 && !receiverId) {
    messages.push(
      "❌ Pour une nouvelle conversation, l'ID destinataire est requis"
    );
    isValid = false;
  }

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
      "❌ Pour une nouvelle conversation, l'ID destinataire est requis"
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
      defaultReceiverId
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
      randomUserId2
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

function generateGroupId() {
  document.getElementById("groupId").value = generateMongoObjectId();
  log("🔧 ID Groupe généré automatiquement", "info");
}

function generateBroadcastId() {
  document.getElementById("broadcastId").value = generateMongoObjectId();
  log("🔧 ID Diffusion généré automatiquement", "info");
}

function sendGroupMessage() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    return;
  }
  const groupId = document.getElementById("groupId").value.trim();
  const groupName = document.getElementById("groupName")?.value.trim();
  const content = document.getElementById("groupMessageContent").value.trim();
  const receiverIdsRaw = document
    .getElementById("groupReceiverIds")
    .value.trim();
  const receiverIds = receiverIdsRaw
    ? receiverIdsRaw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    : [];

  if (!groupId || !content || receiverIds.length === 0) {
    log("❌ ID groupe, contenu et utilisateurs requis", "error");
    return;
  }
  socket.emit("sendMessage", {
    conversationId: groupId,
    content,
    type: "TEXT",
    receiverId: receiverIds,
    conversationName: groupName || undefined,
    broadcast: false,
  });
}

function sendBroadcastMessage() {
  if (!socket || !socket.connected || !isAuthenticated) {
    log("❌ Socket non connecté ou non authentifié", "error");
    return;
  }
  const broadcastId = document.getElementById("broadcastId").value.trim();
  const broadcastName = document.getElementById("broadcastName")?.value.trim();
  const content = document
    .getElementById("broadcastMessageContent")
    .value.trim();
  const receiverIdsRaw = document
    .getElementById("groupReceiverIds")
    .value.trim();
  const receiverIds = receiverIdsRaw
    ? receiverIdsRaw
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    : [];

  if (!broadcastId || !content || receiverIds.length === 0) {
    log("❌ ID diffusion, contenu et utilisateurs requis", "error");
    return;
  }
  socket.emit("sendMessage", {
    conversationId: broadcastId,
    content,
    type: "TEXT",
    receiverId: receiverIds,
    conversationName: broadcastName || undefined,
    broadcast: true,
  });
}

// Section réception complète des messages
socket.on("messagesLoaded", (data) => {
  log("📥 Messages récupérés", "info", data);
  const list = document.getElementById("allMessagesList");
  if (Array.isArray(data.messages)) {
    list.innerHTML = data.messages
      .map(
        (msg) =>
          `<div class="message-item">
            <strong>${escapeHtml(msg.senderId)}</strong> :
            ${escapeHtml(msg.content)}
            <span class="msg-status">${msg.status}</span>
            <span class="msg-date">${new Date(
              msg.timestamp
            ).toLocaleString()}</span>
          </div>`
      )
      .join("");
  } else {
    list.innerHTML = "<div>Aucun message reçu</div>";
  }
});
