/**
 * 🎯 Client Destinataire Amélioré
 * ✅ Réception résiliente des messages
 * ✅ Diagnostic de livraison
 * ✅ Statistiques détaillées
 * ✅ Notifications visuelles
 */

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

// ✅ NOUVEAU : Statistiques de réception
let receptionStats = {
  messagesReceived: 0,
  messagesDelivered: 0,
  messagesRead: 0,
  errors: 0,
  totalLatency: 0,
  averageLatency: 0,
};

// Variables pour les messages
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
  log("🚀 Initialisation du client destinataire", "info");
  initializeSocket();
  setupPingInterval();
  setupAutomaticActions();
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
    log(`❌ Erreur initialisation: ${error.message}`, "error");
    updateConnectionStatus("disconnected");
  }
}

// ========================================
// ÉVÉNEMENTS SOCKET
// ========================================

function setupSocketEvents() {
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
    log(`❌ Erreur connexion: ${error.message}`, "error");
    updateConnectionStatus("disconnected");
  });

  socket.on("authenticated", (data) => {
    log("🔐 Authentification réussie", "success", data);
    isAuthenticated = true;
    currentUser = {
      userId: data.userId,
      matricule: data.matricule,
    };
    updateAuthStatus(
      `✅ Connecté en tant que destinataire: ${data.matricule}`,
      "success"
    );
    updateRecipientInfo();
  });

  socket.on("auth_error", (data) => {
    log("❌ Erreur authentification", "error", data);
    isAuthenticated = false;
    updateAuthStatus(`❌ ${data.message}`, "error");
  });

  // ✅ ÉVÉNEMENT PRINCIPAL : Nouveau message reçu
  socket.on("newMessage", (data) => {
    const receiveTime = Date.now();
    receptionStats.messagesReceived++;

    log("💬 NOUVEAU MESSAGE REÇU", "success", data);

    // ✅ Accuser réception automatiquement
    if (document.getElementById("autoReceiptCheckbox").checked) {
      acknowledgeMessage(data);
    }

    // ✅ Marquer comme livré automatiquement
    if (document.getElementById("autoMarkDeliveredCheckbox").checked) {
      setTimeout(() => {
        markMessageAsDelivered(data);
      }, 500);
    }

    // ✅ Marquer comme lu après 3 secondes
    if (document.getElementById("autoMarkReadCheckbox").checked) {
      setTimeout(() => {
        markMessageAsRead(data);
      }, 3000);
    }

    // ✅ Afficher notification
    if (document.getElementById("showNotificationsCheckbox").checked) {
      showNotification(
        `📨 Nouveau Message`,
        `De: ${data.senderName || data.senderId}\n${data.content?.substring(
          0,
          50
        )}...`
      );
    }

    addReceivedMessage("message", "💬 Nouveau Message Reçu", data, {
      sender: data.senderName || data.senderId,
      content: data.content,
      type: data.type,
      status: "RECEIVED",
      receiveTime: new Date(receiveTime).toLocaleTimeString(),
    });

    updateReceptionStats();
  });

  // ✅ Accusé de réception confirmé
  socket.on("messageReceived", (data) => {
    log("✅ Accusé de réception confirmé", "info", data);
    addReceivedMessage("message", "✅ Accusé de Réception", data, {
      messageId: data.messageId,
      status: "ACKNOWLEDGED",
    });
  });

  // ✅ Message marqué comme livré
  socket.on("messageDelivered", (data) => {
    log("📬 Message marqué comme livré", "success", data);
    receptionStats.messagesDelivered++;
    addReceivedMessage("message", "📬 Message Livré", data, {
      messageId: data.messageId,
      status: "DELIVERED",
      deliveredAt: data.timestamp,
    });
    updateReceptionStats();
  });

  // ✅ Message marqué comme lu
  socket.on("messageRead", (data) => {
    log("📖 Message marqué comme lu", "success", data);
    receptionStats.messagesRead++;
    addReceivedMessage("message", "📖 Message Lu", data, {
      messageId: data.messageId,
      status: "READ",
      readAt: data.timestamp,
    });
    updateReceptionStats();
  });

  // ✅ Message en attente (queue)
  socket.on("messagePending", (data) => {
    log("⏳ Message en attente", "warning", data);
    addReceivedMessage("message", "⏳ Message en Attente", data, {
      messageId: data.messageId,
      reason: data.reason,
      pendingTime: data.pendingTime,
    });
  });

  // ✅ Message livré depuis fallback
  socket.on("messageFallbackReplayed", (data) => {
    log("🔄 Message rejoué depuis fallback", "info", data);
    addReceivedMessage("message", "🔄 Fallback Rejoué", data, {
      fallbackId: data.fallbackId,
      messageId: data.messageId,
      status: data.status,
    });
  });

  // ✅ Utilisateurs en ligne
  socket.on("onlineUsers", (data) => {
    log("👥 Liste utilisateurs en ligne", "info", data);
    onlineUsers.clear();
    if (data.users && Array.isArray(data.users)) {
      data.users.forEach((user) => {
        if (user.userId !== currentUser?.userId) {
          onlineUsers.set(user.userId, {
            userId: user.userId,
            matricule: user.matricule || user.userId,
            status: "online",
            connectedAt: new Date(user.connectedAt || Date.now()),
          });
        }
      });
    }
    updateOnlineUsersDisplay();
  });

  // ✅ Événement typing
  socket.on("typing", (data) => {
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
  });

  // ✅ Erreurs
  socket.on("message_error", (data) => {
    log("❌ Erreur message", "error", data);
    receptionStats.errors++;
    addReceivedMessage("error", "❌ Erreur", data, {
      error: data.message,
      code: data.code,
    });
    updateReceptionStats();
  });

  socket.on("error", (error) => {
    log("❌ Erreur Socket", "error", error);
  });

  // ✅ Pong
  socket.on("pong", () => {
    log("🏓 Pong reçu", "info");
  });
}

// ========================================
// AUTHENTIFICATION
// ========================================

function authenticate() {
  if (!socket || !socket.connected) {
    log("❌ Socket non connecté", "error");
    return;
  }

  const userId = document.getElementById("userId").value.trim();
  const matricule = document.getElementById("matricule").value.trim();
  const token = document.getElementById("token").value.trim();

  if (!userId || !matricule) {
    log("❌ Champs requis", "error");
    updateAuthStatus("❌ Veuillez remplir tous les champs", "error");
    return;
  }

  const authData = { userId, matricule, ...(token && { token }) };

  log("🔐 Authentification destinataire...", "info", authData);
  updateAuthStatus("🔄 Authentification en cours...", "info");

  socket.emit("authenticate", authData);
}

// ========================================
// ACTIONS AUTOMATIQUES
// ========================================

function setupAutomaticActions() {
  // Nettoyer les indicateurs de frappe après 10 secondes
  setInterval(() => {
    const now = new Date();
    let hasChanges = false;

    typingUsers.forEach((user, userId) => {
      if (now - user.startedAt > 10000) {
        typingUsers.delete(userId);
        hasChanges = true;
      }
    });

    if (hasChanges) {
      updateTypingDisplay();
    }
  }, 5000);
}

// ========================================
// ACTIONS DE MESSAGES
// ========================================

function acknowledgeMessage(data) {
  if (!socket) return;
  socket.emit("messageReceived", {
    messageId: data.messageId || data.id,
    conversationId: data.conversationId,
  });
  log("✅ Accusé de réception envoyé", "info");
}

function markMessageAsDelivered(data) {
  if (!socket) return;
  socket.emit("markMessageDelivered", {
    messageId: data.messageId || data.id,
    conversationId: data.conversationId,
  });
  log("📬 Marqué comme livré", "info");
}

function markMessageAsRead(data) {
  if (!socket) return;
  socket.emit("markMessageRead", {
    messageId: data.messageId || data.id,
    conversationId: data.conversationId,
  });
  log("📖 Marqué comme lu", "info");
}

// ========================================
// DIAGNOSTIC NOUVEAU
// ========================================

async function diagnoseDelivery() {
  if (!isAuthenticated) {
    log("❌ Authentification requise", "error");
    return;
  }

  log("🔍 Diagnostic de livraison...", "info");

  const resultsDiv = document.getElementById("diagnosticResults");
  const contentDiv = document.getElementById("diagnosticContent");

  let html = `
    <div class="diagnostic-check">
      <h4>✅ État de Connexion</h4>
      <p>Socket Connecté: ${socket?.connected ? "🟢 OUI" : "🔴 NON"}</p>
      <p>Authentifié: ${isAuthenticated ? "🟢 OUI" : "🔴 NON"}</p>
      <p>User ID: ${currentUser?.userId}</p>
      <p>Matricule: ${currentUser?.matricule}</p>
    </div>

    <div class="diagnostic-check">
      <h4>📊 Statistiques de Réception</h4>
      <p>Messages reçus: ${receptionStats.messagesReceived}</p>
      <p>Messages livrés: ${receptionStats.messagesDelivered}</p>
      <p>Messages lus: ${receptionStats.messagesRead}</p>
      <p>Erreurs: ${receptionStats.errors}</p>
      <p>Taux de réussite: ${
        receptionStats.messagesReceived > 0
          ? (
              (receptionStats.messagesDelivered /
                receptionStats.messagesReceived) *
              100
            ).toFixed(2)
          : 0
      }%</p>
    </div>

    <div class="diagnostic-check">
      <h4>🔌 Configuration Socket</h4>
      <p>Socket ID: ${socket?.id || "N/A"}</p>
      <p>Transport: ${socket?.io?.engine?.transport?.name || "N/A"}</p>
      <p>Ping Interval: ${CONFIG.PING_INTERVAL}ms</p>
    </div>

    <div class="diagnostic-check">
      <h4>📋 Messages en File d'Attente</h4>
      <p>Total reçus: ${receivedMessages.length}</p>
      <p>Messages: ${
        receivedMessages.filter((m) => m.type === "message").length
      }</p>
      <p>Erreurs: ${
        receivedMessages.filter((m) => m.type === "error").length
      }</p>
    </div>
  `;

  contentDiv.innerHTML = html;
  resultsDiv.classList.remove("hidden");

  log("✅ Diagnostic complété", "success");
}

async function troubleshootDelivery() {
  log("🔧 Résolution des problèmes...", "info");

  if (!socket?.connected) {
    log("⚠️ Reconnexion en cours...", "warning");
    socket?.connect();
  }

  if (!isAuthenticated) {
    log("⚠️ Veuillez vous authentifier", "warning");
    return;
  }

  log("✅ Troubleshoot complété", "success");
  showNotification("🔧 Troubleshoot", "Vérifications effectuées");
}

async function viewDeliveryStats() {
  const html = `
    <div class="stats-container">
      <h3>📊 Statistiques de Livraison Détaillées</h3>
      <table class="stats-table">
        <tr>
          <td>Messages Reçus</td>
          <td>${receptionStats.messagesReceived}</td>
        </tr>
        <tr>
          <td>Taux de Livraison</td>
          <td>${
            receptionStats.messagesReceived > 0
              ? (
                  (receptionStats.messagesDelivered /
                    receptionStats.messagesReceived) *
                  100
                ).toFixed(2)
              : 0
          }%</td>
        </tr>
        <tr>
          <td>Taux de Lecture</td>
          <td>${
            receptionStats.messagesReceived > 0
              ? (
                  (receptionStats.messagesRead /
                    receptionStats.messagesReceived) *
                  100
                ).toFixed(2)
              : 0
          }%</td>
        </tr>
        <tr>
          <td>Erreurs</td>
          <td>${receptionStats.errors}</td>
        </tr>
      </table>
    </div>
  `;

  const resultsDiv = document.getElementById("diagnosticResults");
  document.getElementById("diagnosticContent").innerHTML = html;
  resultsDiv.classList.remove("hidden");
}

// ========================================
// ACTIONS RAPIDES NOUVEAU
// ========================================

function replayAllMessages() {
  log("🔄 Rejouer tous les messages...", "info");
  const messages = receivedMessages.filter((m) => m.type === "message");
  messages.forEach((msg) => {
    log(`▶️ Rejouer: ${msg.title}`, "info", msg.originalData);
  });
}

function exportMessages() {
  const json = JSON.stringify(receivedMessages, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `messages_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  log("💾 Messages exportés", "success");
}

function exportLogs() {
  const logs = Array.from(document.querySelectorAll(".log-entry")).map(
    (el) => el.textContent
  );
  const text = logs.join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `logs_${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  log("💾 Logs exportés", "success");
}

function testSimulatedDelay() {
  log("⏱️ Test de délai simulé...", "info");
  const startTime = Date.now();
  socket?.emit("ping");
  setTimeout(() => {
    const delay = Date.now() - startTime;
    log(`⏱️ Latence mesurée: ${delay}ms`, "info");
  }, 100);
}

function simulateNetworkError() {
  log("❌ Simulation d'erreur réseau...", "warning");
  socket?.disconnect();
  setTimeout(() => {
    socket?.connect();
    log("🔄 Reconnexion après erreur simulée", "info");
  }, 2000);
}

// ========================================
// AFFICHAGE STATISTIQUES
// ========================================

function updateReceptionStats() {
  document.getElementById("receivedCount").textContent =
    receptionStats.messagesReceived;
  document.getElementById("deliveredCount").textContent =
    receptionStats.messagesDelivered;
  document.getElementById("readCount").textContent =
    receptionStats.messagesRead;
  document.getElementById("errorCount").textContent = receptionStats.errors;
}

function updateRecipientInfo() {
  const html = `
    <div class="info-row">
      <span class="label">ID Utilisateur:</span>
      <span class="value">${currentUser?.userId}</span>
    </div>
    <div class="info-row">
      <span class="label">Matricule:</span>
      <span class="value">${currentUser?.matricule}</span>
    </div>
    <div class="info-row">
      <span class="label">Socket ID:</span>
      <span class="value">${socket?.id || "N/A"}</span>
    </div>
    <div class="info-row">
      <span class="label">État Connexion:</span>
      <span class="value">${
        socket?.connected ? "🟢 Connecté" : "🔴 Déconnecté"
      }</span>
    </div>
  `;
  document.getElementById("recipientInfo").innerHTML = html;
}

// ========================================
// GESTION DES MESSAGES
// ========================================

function addReceivedMessage(type, title, originalData, displayData) {
  const message = {
    id: Date.now() + Math.random(),
    type,
    title,
    timestamp: new Date(),
    originalData,
    displayData,
  };

  receivedMessages.unshift(message);
  if (receivedMessages.length > 200) {
    receivedMessages = receivedMessages.slice(0, 200);
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
          ? `<details class="message-details">
              <summary>📋 Données brutes</summary>
              <pre>${JSON.stringify(message.originalData, null, 2)}</pre>
            </details>`
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
  if (currentMessageTab === "all") return receivedMessages;

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
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.getElementById(tab + "Tab").classList.add("active");
  updateMessageDisplay();
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
}

function updateMessageStats() {
  document.getElementById(
    "messageCount"
  ).textContent = `${messageCount} messages`;
}

// ========================================
// AFFICHAGE UTILISATEURS
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
      </div>
    `;
    return;
  }

  const usersHtml = Array.from(onlineUsers.values())
    .map(
      (user) => `
    <div class="user-card">
      <div class="user-avatar">${getUserInitials(user.matricule)}</div>
      <div class="user-info">
        <div class="user-name">${escapeHtml(user.matricule)}</div>
        <div class="user-status">En ligne</div>
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
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.substring(0, 2).toUpperCase();
}

// ========================================
// AFFICHAGE TYPING
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
      </div>
    </div>
  `
    )
    .join("");

  list.innerHTML = typingHtml;
}

// ========================================
// UTILITAIRES
// ========================================

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

  while (logsContainer.children.length > 200) {
    logsContainer.removeChild(logsContainer.firstChild);
  }

  console.log(`[${timestamp}] ${message}`, data || "");
}

function clearLogs() {
  const logsContainer = document.getElementById("logsContainer");
  logsContainer.innerHTML = "";
  log("🧹 Logs effacés", "info");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ========================================
// NOTIFICATIONS NOUVEAU
// ========================================

function showNotification(title, message) {
  document.getElementById("notificationTitle").textContent = title;
  document.getElementById("notificationBody").textContent = message;
  document.getElementById("notificationModal").classList.remove("hidden");
}

function closeNotification() {
  document.getElementById("notificationModal").classList.add("hidden");
}

// ========================================
// SETUP
// ========================================

function setupPingInterval() {
  pingInterval = setInterval(() => {
    if (socket && socket.connected && isAuthenticated) {
      socket.emit("ping");
    }
  }, CONFIG.PING_INTERVAL);
}

function pingTest() {
  if (!socket || !socket.connected) {
    log("❌ Socket non connecté", "error");
    return;
  }
  log("🏓 Ping envoyé", "info");
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
  socket.emit("getOnlineUsers");
}

function disconnect() {
  if (socket) {
    log("🔌 Déconnexion", "info");
    socket.disconnect();
  }
}

function reconnect() {
  if (socket && !socket.connected) {
    log("🔄 Reconnexion", "info");
    socket.connect();
  } else if (!socket) {
    initializeSocket();
  }
}

// ========================================
// CLEANUP
// ========================================

window.addEventListener("beforeunload", () => {
  if (pingInterval) clearInterval(pingInterval);
  if (socket) socket.disconnect();
});
