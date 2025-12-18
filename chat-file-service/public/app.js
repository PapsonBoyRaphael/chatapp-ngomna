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
              2
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
  document.getElementById(
    "messageCount"
  ).textContent = `${messageCount} messages`;
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
          user.connectedAt
        )}</div>
      </div>
    </div>
  `
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
  `
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
// AJOUTER UNE FONCTION POUR RÉCUPÉRER UN MESSAGE ID RÉEL DANS app.js
function getLastMessageId() {
  // Récupérer le dernier message envoyé pour avoir un ID réel
  const lastMessage = receivedMessages.find(
    (msg) =>
      msg.type === "message" &&
      msg.title === "✅ Message Envoyé" &&
      msg.originalData &&
      msg.originalData.messageId
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

    // ✅ AFFICHER LE STATUT DE CHARGEMENT
    statusDiv.innerHTML =
      '<div class="loading">⏳ Chargement des fichiers...</div>';

    // ✅ AJOUTER LE TOKEN DANS LES HEADERS
    const headers = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch("http://localhost:8003/files", {
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
        data.data.files
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
    const token = getCookie("token");

    const headers = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`/files/${fileId}`, {
      method: "GET",
      headers: headers,
    });

    if (res.status === 401) {
      log("❌ Non autorisé pour télécharger le fichier", "error");
      return;
    }

    if (!res.ok) {
      throw new Error(`Erreur HTTP: ${res.status}`);
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
    log(`❌ Erreur téléchargement fichier ${fileId}`, "error", err);
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

// ✅ AMÉLIORER LA FONCTION handleFileUpload POUR RAFRAÎCHIR AUTOMATIQUEMENT
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

  const token = getCookie("token");

  try {
    const res = await fetch("/files/upload", {
      method: "POST",
      body: formData,
      headers: currentUser?.userId ? { "user-id": currentUser.userId } : {},
    });

    const data = await res.json();

    if (data.success) {
      statusDiv.textContent = "✅ Fichier envoyé avec succès";
      statusDiv.className = "status success";
      log("✅ Fichier uploadé", "success", data.data);

      // ✅ RAFRAÎCHIR AUTOMATIQUEMENT LA LISTE DES FICHIERS
      setTimeout(() => {
        fetchMyFiles();
      }, 1000);

      // ✅ RÉINITIALISER LE FORMULAIRE
      fileInput.value = "";
      conversationIdInput.value = "";
    } else {
      statusDiv.textContent = "❌ " + (data.message || "Erreur upload");
      statusDiv.className = "status error";
      log("❌ Erreur upload fichier", "error", data);
    }
  } catch (err) {
    statusDiv.textContent = "❌ Erreur réseau";
    statusDiv.className = "status error";
    log("❌ Erreur réseau upload fichier", "error", err);
  }
}
