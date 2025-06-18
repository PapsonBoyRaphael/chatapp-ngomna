class ChatFileApp {
  constructor() {
    // ✅ CONFIGURATION ALIGNÉE AVEC LE BACKEND
    this.apiBaseUrl =
      window.CHAT_CONFIG?.API_BASE_URL || "http://localhost:8003/api";
    this.wsUrl = window.CHAT_CONFIG?.WS_URL || "http://localhost:8003";
    this.userServiceUrl =
      window.CHAT_CONFIG?.USER_SERVICE_URL || "http://localhost:8000/api/users";

    // ✅ ÉTAT ALIGNÉ AVEC LES ENTITÉS BACKEND
    this.currentUser = null;
    this.conversations = [];
    this.contacts = [];
    this.files = [];
    this.socket = null;
    this.currentView = "chat";
    this.currentConversation = null;
    this.onlineUsers = new Set();

    // ✅ CONFIGURATION DES NOTIFICATIONS ALIGNÉE AVEC KAFKA
    this.notificationConfig = {
      enabled: true,
      sound: true,
      desktop: false,
    };

    this.init();
  }

  async init() {
    console.log("🚀 Initialisation ChatFileApp...");

    // ✅ CHARGER L'UTILISATEUR DEPUIS LES COOKIES (ALIGNÉ AVEC AUTH-SERVICE)
    this.loadUserFromCookies();

    if (!this.currentUser) {
      this.showLoginRedirect();
      return;
    }

    // ✅ INITIALISER L'INTERFACE
    this.initializeUI();

    // ✅ CONNECTER WEBSOCKET AVEC TOKEN
    await this.connectWebSocket();

    // ✅ CHARGER LES DONNÉES INITIALES
    await this.loadInitialData();

    console.log("✅ ChatFileApp initialisé");
  }

  // ✅ MÉTHODE ALIGNÉE AVEC AuthMiddleware DU BACKEND
  loadUserFromCookies() {
    try {
      const token = this.getCookie("token");
      const userData = this.getCookie("user");

      if (token && userData) {
        const parsedUserData = JSON.parse(decodeURIComponent(userData));

        this.currentUser = {
          id: parsedUserData.id || parsedUserData._id,
          nom: parsedUserData.nom || parsedUserData.name,
          prenom: parsedUserData.prenom || "",
          email: parsedUserData.email,
          poste: parsedUserData.poste || parsedUserData.role,
          matricule: parsedUserData.matricule,
          token: token,
          permissions: parsedUserData.permissions || [],
        };

        localStorage.setItem("chatuser", JSON.stringify(this.currentUser));
        this.updateUserUI();

        console.log("✅ Utilisateur chargé depuis les cookies:", {
          id: this.currentUser.id,
          nom: this.currentUser.nom,
          hasToken: !!this.currentUser.token,
        });
      } else {
        this.loadUserFromStorage();
      }
    } catch (error) {
      console.error("❌ Erreur chargement cookies:", error);
      this.clearAuthData();
    }
  }

  // ✅ WEBSOCKET ALIGNÉ AVEC ChatHandler DU BACKEND
  async connectWebSocket() {
    try {
      if (this.socket) {
        this.socket.disconnect();
      }

      console.log("🔌 Connexion WebSocket...");

      this.socket = io(this.wsUrl, {
        transports: ["websocket", "polling"],
        timeout: 20000,
        auth: {
          token: this.currentUser?.token,
          userId: this.currentUser?.id,
          user: this.currentUser,
        },
      });

      // ✅ ÉVÉNEMENTS ALIGNÉS AVEC LE BACKEND
      this.socket.on("connect", () => {
        console.log("✅ WebSocket connecté");
        this.updateConnectionStatus(true);

        // ✅ REJOINDRE LES SALLES UTILISATEUR
        this.socket.emit("joinUserRooms", {
          userId: this.currentUser.id,
        });
      });

      this.socket.on("disconnect", () => {
        console.log("🔌 WebSocket déconnecté");
        this.updateConnectionStatus(false);
      });

      // ✅ ÉVÉNEMENTS DE MESSAGES ALIGNÉS AVEC MessageController
      this.socket.on("newMessage", (message) => {
        console.log("💬 Nouveau message reçu:", message);
        this.handleNewMessage(message);
      });

      this.socket.on("messageStatusUpdate", (update) => {
        console.log("📝 Statut message mis à jour:", update);
        this.updateMessageStatus(update);
      });

      // ✅ ÉVÉNEMENTS DE CONVERSATIONS ALIGNÉS AVEC ConversationController
      this.socket.on("conversationUpdate", (conversation) => {
        console.log("🗣️ Conversation mise à jour:", conversation);
        this.handleConversationUpdate(conversation);
      });

      // ✅ ÉVÉNEMENTS DE FICHIERS ALIGNÉS AVEC FileController
      this.socket.on("fileUploaded", (file) => {
        console.log("📁 Fichier uploadé:", file);
        this.handleFileUploaded(file);
      });

      // ✅ ÉVÉNEMENTS D'UTILISATEURS EN LIGNE ALIGNÉS AVEC OnlineUserManager
      this.socket.on("userOnline", (user) => {
        console.log("👤 Utilisateur en ligne:", user);
        this.onlineUsers.add(user.id);
        this.updateUserStatus(user.id, "online");
      });

      this.socket.on("userOffline", (user) => {
        console.log("👋 Utilisateur hors ligne:", user);
        this.onlineUsers.delete(user.id);
        this.updateUserStatus(user.id, "offline");
      });

      // ✅ ÉVÉNEMENTS DE NOTIFICATIONS KAFKA
      this.socket.on("notification", (notification) => {
        console.log("🔔 Notification reçue:", notification);
        this.handleNotification(notification);
      });
    } catch (error) {
      console.error("❌ Erreur connexion WebSocket:", error);
      this.updateConnectionStatus(false);
    }
  }

  // ✅ REQUÊTES API ALIGNÉES AVEC LES ROUTES BACKEND
  async makeAuthenticatedRequest(url, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.currentUser?.token}`,
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include",
      });

      if (response.status === 401) {
        this.handleAuthError("Session expirée");
        throw new Error("Non autorisé");
      }

      return response;
    } catch (error) {
      console.error("❌ Erreur requête API:", error);
      throw error;
    }
  }

  // ✅ CHARGEMENT CONVERSATIONS ALIGNÉ AVEC GetConversations USE CASE
  async loadConversations() {
    try {
      console.log("🗣️ Chargement des conversations...");

      const response = await this.makeAuthenticatedRequest(
        `${this.apiBaseUrl}/conversations?page=1&limit=50`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        this.conversations = data.data.conversations || [];

        // ✅ ENRICHIR AVEC LES DONNÉES UTILISATEUR
        this.conversations = this.conversations.map((conv) => ({
          ...conv,
          otherParticipant: conv.participants?.find(
            (p) => p.id !== this.currentUser.id
          ),
          unreadCount: conv.unreadCount || 0,
          lastMessage: conv.lastMessage || null,
          isOnline: conv.participants?.some(
            (p) => p.id !== this.currentUser.id && this.onlineUsers.has(p.id)
          ),
        }));

        this.renderConversations();
        console.log(`✅ ${this.conversations.length} conversations chargées`);
      }
    } catch (error) {
      console.error("❌ Erreur chargement conversations:", error);
      this.showToast(
        `Erreur chargement conversations: ${error.message}`,
        "error"
      );
    }
  }

  // ✅ CHARGEMENT FICHIERS ALIGNÉ AVEC GetFile USE CASE
  async loadFiles() {
    try {
      console.log("📁 Chargement des fichiers...");

      const response = await this.makeAuthenticatedRequest(
        `${this.apiBaseUrl}/files?page=1&limit=50&sort=-uploadedAt`
      );

      if (!response.ok) {
        if (response.status === 404) {
          this.files = [];
          this.renderFiles();
          console.log("📁 Aucun fichier trouvé");
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        this.files = Array.isArray(data.data.files)
          ? data.data.files
          : Array.isArray(data.data)
          ? data.data
          : [];

        // ✅ ENRICHIR AVEC LES MÉTADONNÉES
        this.files = this.files.map((file) => ({
          ...file,
          canPreview: this.canPreviewFile(file.mimeType),
          icon: this.getFileIcon(file.mimeType),
          formattedSize: this.formatFileSize(file.size),
          uploadedByName: file.uploadedBy?.nom || "Inconnu",
        }));

        this.renderFiles();
        console.log(`✅ ${this.files.length} fichiers chargés`);
      }
    } catch (error) {
      console.error("❌ Erreur chargement fichiers:", error);
      this.showToast(`Erreur chargement fichiers: ${error.message}`, "error");
    }
  }

  // ✅ ENVOI MESSAGE ALIGNÉ AVEC SendMessage USE CASE
  async sendMessage() {
    const messageInput = document.getElementById("messageInput");
    const message = messageInput?.value?.trim();

    if (!message || !this.currentConversation) {
      return;
    }

    try {
      const messageData = {
        content: message,
        conversationId: this.currentConversation.id,
        type: "text",
        metadata: {
          platform: "web",
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        },
      };

      // ✅ ENVOYER VIA WEBSOCKET (ALIGNÉ AVEC ChatHandler)
      this.socket.emit("sendMessage", messageData);

      // ✅ AJOUTER À L'INTERFACE IMMÉDIATEMENT
      const tempMessage = {
        id: `temp_${Date.now()}`,
        content: message,
        senderId: this.currentUser.id,
        senderName: this.currentUser.nom,
        createdAt: new Date().toISOString(),
        status: "SENDING",
        type: "text",
      };

      this.addMessageToUI(tempMessage);
      messageInput.value = "";

      console.log("💬 Message envoyé:", messageData);
    } catch (error) {
      console.error("❌ Erreur envoi message:", error);
      this.showToast(`Erreur envoi message: ${error.message}`, "error");
    }
  }

  // ✅ UPLOAD FICHIER ALIGNÉ AVEC UploadFile USE CASE
  async uploadFile(file) {
    try {
      const formData = new FormData();
      formData.append("file", file);

      if (this.currentConversation) {
        formData.append("conversationId", this.currentConversation.id);
      }

      formData.append(
        "metadata",
        JSON.stringify({
          uploadedBy: this.currentUser.id,
          platform: "web",
          timestamp: new Date().toISOString(),
        })
      );

      console.log("📤 Upload fichier:", file.name);

      const response = await fetch(`${this.apiBaseUrl}/files/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.currentUser.token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        console.log("✅ Fichier uploadé:", data.data);

        // ✅ NOTIFIER VIA WEBSOCKET
        this.socket.emit("fileShared", {
          fileId: data.data.id,
          conversationId: this.currentConversation?.id,
          fileName: file.name,
        });

        this.showToast("Fichier uploadé avec succès", "success");
        await this.loadFiles();
      }
    } catch (error) {
      console.error("❌ Erreur upload fichier:", error);
      this.showToast(`Erreur upload: ${error.message}`, "error");
    }
  }

  // ✅ GESTION DES ÉVÉNEMENTS WEBSOCKET ALIGNÉS AVEC LE BACKEND
  handleNewMessage(message) {
    // ✅ METTRE À JOUR LA CONVERSATION COURANTE
    if (message.conversationId === this.currentConversation?.id) {
      this.addMessageToUI(message);
    }

    // ✅ METTRE À JOUR LA LISTE DES CONVERSATIONS
    this.updateConversationLastMessage(message);

    // ✅ NOTIFICATION SONORE
    if (
      this.notificationConfig.sound &&
      message.senderId !== this.currentUser.id
    ) {
      this.playNotificationSound();
    }

    // ✅ MARQUER COMME LU SI CONVERSATION ACTIVE
    if (message.conversationId === this.currentConversation?.id) {
      this.socket.emit("markMessageAsRead", {
        messageId: message.id,
        conversationId: message.conversationId,
      });
    }
  }

  handleNotification(notification) {
    console.log("🔔 Traitement notification:", notification);

    switch (notification.type) {
      case "NEW_MESSAGE":
        if (notification.data?.message) {
          this.handleNewMessage(notification.data.message);
        }
        break;

      case "FILE_UPLOADED":
        if (notification.data?.file) {
          this.handleFileUploaded(notification.data.file);
        }
        break;

      case "USER_ONLINE":
        if (notification.data?.userId) {
          this.onlineUsers.add(notification.data.userId);
          this.updateUserStatus(notification.data.userId, "online");
        }
        break;

      case "CONVERSATION_CREATED":
        if (notification.data?.conversation) {
          this.conversations.unshift(notification.data.conversation);
          this.renderConversations();
        }
        break;

      default:
        console.log("🔔 Notification non gérée:", notification.type);
    }

    // ✅ AFFICHER TOAST POUR NOTIFICATIONS IMPORTANTES
    if (notification.showToast) {
      this.showToast(notification.message, notification.level || "info");
    }
  }

  // ✅ MÉTHODES D'INTERFACE ALIGNÉES AVEC LES ENTITÉS BACKEND
  renderConversations() {
    const container = document.getElementById("conversationsList");
    if (!container) return;

    if (this.conversations.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-comments"></i>
          <h3>Aucune conversation</h3>
          <p>Commencez une nouvelle conversation</p>
          <button class="btn btn-primary" onclick="app.showNewChatModal()">
            <i class="fas fa-plus"></i>
            Nouveau chat
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.conversations
      .map((conv) => {
        const otherParticipant = conv.otherParticipant;
        const isOnline = conv.isOnline;

        return `
          <div class="conversation-item ${
            conv.id === this.currentConversation?.id ? "active" : ""
          }" 
               data-id="${conv.id}" onclick="app.selectConversation('${
          conv.id
        }')">
            <div class="conversation-avatar">
              <span>${otherParticipant?.nom?.charAt(0) || "?"}</span>
              ${isOnline ? '<div class="status-indicator online"></div>' : ""}
            </div>
            <div class="conversation-info">
              <div class="conversation-name">
                ${otherParticipant?.nom || "Conversation"} ${
          otherParticipant?.prenom || ""
        }
              </div>
              ${
                conv.lastMessage
                  ? `
                <div class="last-message">
                  ${conv.lastMessage.type === "file" ? "📎 " : ""}
                  ${this.escapeHtml(
                    conv.lastMessage.content || "Fichier partagé"
                  )}
                </div>
              `
                  : ""
              }
              <div class="conversation-time">
                ${
                  conv.lastMessage
                    ? this.formatTime(conv.lastMessage.createdAt)
                    : ""
                }
              </div>
            </div>
            ${
              conv.unreadCount > 0
                ? `
              <div class="unread-badge">${conv.unreadCount}</div>
            `
                : ""
            }
          </div>
        `;
      })
      .join("");
  }

  // ✅ REMPLACER LA MÉTHODE renderContacts EXISTANTE (autour de la ligne 850)
  renderContacts() {
    const container = document.getElementById("contactsGrid");
    if (!container) return;

    if (this.contacts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-address-book"></i>
          <h3>Aucun contact</h3>
          <p>Les contacts s'afficheront ici</p>
          <button class="btn btn-secondary" onclick="app.loadContacts()">
            <i class="fas fa-sync-alt"></i>
            Réessayer
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.contacts
      .map(
        (contact) => `
    <div class="contact-card ${
      contact.isSelf ? "self-contact" : ""
    }" data-id="${contact.id}">
      <div class="contact-avatar">
        <span>${contact.nom.charAt(0)}</span>
        <div class="status-indicator ${contact.statut}"></div>
      </div>
      <div class="contact-info">
        <div class="contact-name">
          ${contact.nom}
          ${
            contact.isSelf
              ? '<i class="fas fa-user-check" title="Vous"></i>'
              : ""
          }
        </div>
        <div class="contact-matricule">${contact.matricule || "N/A"}</div>
        <div class="contact-role">${contact.poste || "Utilisateur"}</div>
        <div class="contact-status ${contact.statut}">
          <i class="fas fa-circle"></i>
          <span>${this.getStatusText(contact.statut)}</span>
        </div>
        ${
          contact.email
            ? `<div class="contact-email">${contact.email}</div>`
            : ""
        }
      </div>
      <div class="contact-actions">
        ${
          !contact.isSelf
            ? `
          <button class="action-btn" onclick="app.startChat('${contact.id}')" title="Démarrer une conversation">
            <i class="fas fa-comment"></i>
          </button>
          <button class="action-btn" onclick="app.showContactDetails('${contact.id}')" title="Voir les détails">
            <i class="fas fa-info"></i>
          </button>
        `
            : `
          <button class="action-btn" disabled title="Votre profil">
            <i class="fas fa-user"></i>
          </button>
        `
        }
      </div>
    </div>
  `
      )
      .join("");
  }

  renderFiles() {
    const container = document.getElementById("filesGrid");
    if (!container) return;

    if (this.files.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-folder-open"></i>
          <h3>Aucun fichier</h3>
          <p>Vos fichiers partagés apparaîtront ici</p>
          <button class="btn btn-primary" onclick="app.showUploadModal()">
            <i class="fas fa-upload"></i>
            Uploader un fichier
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.files
      .map(
        (file) => `
      <div class="file-card" data-id="${file.id}">
        <div class="file-icon">
          <i class="fas ${this.getFileIcon(file.type)}"></i>
        </div>
        <div class="file-info">
          <div class="file-name">${file.name}</div>
          <div class="file-size">${this.formatFileSize(file.size)}</div>
          <div class="file-date">${this.formatTime(file.uploadedAt)}</div>
        </div>
        <div class="file-actions">
          <button class="action-btn" onclick="app.downloadFile('${
            file.id
          }')" title="Télécharger">
            <i class="fas fa-download"></i>
          </button>
          <button class="action-btn" onclick="app.shareFile('${
            file.id
          }')" title="Partager">
            <i class="fas fa-share"></i>
          </button>
        </div>
      </div>
    `
      )
      .join("");
  }

  // ✅ REMPLACER LA MÉTHODE updateContactsStats EXISTANTE (autour de la ligne 950)
  updateContactsStats() {
    const total = this.contacts.length;
    const online = this.contacts.filter((c) => c.statut === "online").length;
    const away = this.contacts.filter((c) => c.statut === "away").length;
    const offline = this.contacts.filter((c) => c.statut === "offline").length;

    // ✅ METTRE À JOUR LES ÉLÉMENTS S'ILS EXISTENT
    const totalEl = document.getElementById("totalContacts");
    const onlineEl = document.getElementById("onlineContacts");
    const awayEl = document.getElementById("awayContacts");

    if (totalEl) totalEl.textContent = total;
    if (onlineEl) onlineEl.textContent = online;
    if (awayEl) awayEl.textContent = away;

    console.log(
      `📊 Stats contacts: ${total} total, ${online} en ligne, ${away} absents, ${offline} hors ligne`
    );
  }

  updateConnectionStatus(connected) {
    const indicator = document.getElementById("connectionStatus");
    if (indicator) {
      indicator.innerHTML = connected
        ? '<i class="fas fa-circle"></i> Connecté'
        : '<i class="fas fa-circle"></i> Déconnecté';
      indicator.className = `connection-status ${
        connected ? "connected" : "disconnected"
      }`;
    }
  }

  updateUserUI() {
    if (this.currentUser) {
      const userNameEl = document.getElementById("userName");
      const userRoleEl = document.getElementById("userRole");
      const userAvatarEl = document.getElementById("userAvatar");

      if (userNameEl) userNameEl.textContent = this.currentUser.nom;
      if (userRoleEl)
        userRoleEl.textContent = this.currentUser.poste || "Utilisateur";
      if (userAvatarEl)
        userAvatarEl.textContent = this.currentUser.nom.charAt(0);
    }
  }

  // Utilitaires
  formatTime(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return "À l'instant";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return date.toLocaleDateString();
  }

  formatFileSize(bytes) {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  getFileIcon(type) {
    const icons = {
      image: "fa-image",
      video: "fa-video",
      audio: "fa-music",
      pdf: "fa-file-pdf",
      doc: "fa-file-word",
      xls: "fa-file-excel",
      zip: "fa-file-archive",
    };
    return icons[type] || "fa-file";
  }

  getServiceIcon(service) {
    const icons = {
      mongodb: "fa-database",
      redis: "fa-memory",
      kafka: "fa-stream",
      websocket: "fa-plug",
    };
    return icons[service.toLowerCase()] || "fa-cog";
  }

  showToast(message, type = "info") {
    const container =
      document.getElementById("toastContainer") || this.createToastContainer();

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fas ${this.getToastIcon(type)}"></i>
      <span>${message}</span>
      <button onclick="this.parentElement.remove()">
        <i class="fas fa-times"></i>
      </button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 5000);
  }

  createToastContainer() {
    const container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
    return container;
  }

  getToastIcon(type) {
    const icons = {
      success: "fa-check-circle",
      error: "fa-exclamation-circle",
      warning: "fa-exclamation-triangle",
      info: "fa-info-circle",
    };
    return icons[type] || "fa-info-circle";
  }

  // Méthodes pour les actions utilisateur
  startChat(contactId) {
    console.log("💬 Démarrer chat avec:", contactId);
    this.switchView("chat");
    // TODO: Implémenter la création de conversation
    this.showToast("Fonctionnalité en cours de développement", "info");
  }

  showContactDetails(contactId) {
    const contact = this.contacts.find((c) => c.id == contactId);
    if (contact) {
      console.log("👤 Détails contact:", contact);
      // TODO: Afficher modal avec détails
      this.showToast(`Détails de ${contact.nom}`, "info");
    }
  }

  downloadFile(fileId) {
    console.log("📥 Télécharger fichier:", fileId);
    // TODO: Implémenter le téléchargement
    this.showToast("Fonctionnalité en cours de développement", "info");
  }

  shareFile(fileId) {
    console.log("📤 Partager fichier:", fileId);
    // TODO: Implémenter le partage
    this.showToast("Fonctionnalité en cours de développement", "info");
  }

  showSettings() {
    console.log("⚙️ Afficher paramètres");
    this.showToast("Paramètres en cours de développement", "info");
  }

  showNewChatModal() {
    console.log("💬 Nouveau chat");
    this.showToast("Fonctionnalité en cours de développement", "info");
  }

  showUploadModal() {
    console.log("📤 Upload fichier");
    this.showToast("Fonctionnalité en cours de développement", "info");
  }

  loadApiDocumentation() {
    const container = document.getElementById("apiEndpoints");
    if (!container) return;

    const endpoints = [
      {
        group: "Messages",
        endpoints: [
          {
            method: "GET",
            url: "/api/messages",
            description: "Récupérer les messages",
          },
          {
            method: "POST",
            url: "/api/messages",
            description: "Envoyer un message",
          },
          {
            method: "PUT",
            url: "/api/messages/:id/status",
            description: "Marquer comme lu",
          },
        ],
      },
      {
        group: "Conversations",
        endpoints: [
          {
            method: "GET",
            url: "/api/conversations",
            description: "Lister les conversations",
          },
          {
            method: "GET",
            url: "/api/conversations/:id",
            description: "Détails conversation",
          },
          {
            method: "POST",
            url: "/api/conversations",
            description: "Créer conversation",
          },
        ],
      },
      {
        group: "Fichiers",
        endpoints: [
          {
            method: "GET",
            url: "/api/files",
            description: "Lister les fichiers",
          },
          {
            method: "POST",
            url: "/api/files/upload",
            description: "Uploader un fichier",
          },
          {
            method: "GET",
            url: "/api/files/:id",
            description: "Télécharger fichier",
          },
        ],
      },
    ];

    container.innerHTML = endpoints
      .map(
        (group) => `
      <div class="endpoint-group">
        <h3>${group.group}</h3>
        ${group.endpoints
          .map(
            (ep) => `
          <div class="endpoint">
            <span class="method ${ep.method.toLowerCase()}">${ep.method}</span>
            <span class="url">${ep.url}</span>
            <span class="description">${ep.description}</span>
          </div>
        `
          )
          .join("")}
      </div>
    `
      )
      .join("");
  }

  // ✅ AJOUTER CETTE MÉTHODE APRÈS loadFiles() (autour de la ligne 500)
  async loadContacts() {
    try {
      console.log("👥 Chargement des contacts...");

      // ✅ CHARGER DEPUIS LE SERVICE UTILISATEURS
      const response = await this.makeAuthenticatedRequest(
        `${this.userServiceUrl}/all`,
        {
          method: "GET",
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          this.handleAuthError("Session expirée");
          return;
        }
        if (response.status === 404 || response.status === 503) {
          console.warn("⚠️ Service utilisateurs indisponible");
          this.contacts = this.getMockContacts();
          this.renderContacts();
          this.updateContactsStats();
          this.showToast(
            "Service utilisateurs indisponible - Données de test",
            "warning"
          );
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && Array.isArray(data.data)) {
        // ✅ ADAPTER LES DONNÉES DU SERVICE UTILISATEURS
        this.contacts = data.data.map((user) => ({
          id: user.id || user._id,
          nom: user.nom || user.name || user.userName || "Utilisateur",
          email: user.email || "",
          matricule: user.matricule || user.id || "",
          poste: user.poste || user.role || "Utilisateur",
          statut: this.getRandomStatus(), // Status aléatoire pour la démo
          telephone: user.telephone || "",
          service: user.service || "",
          lastActive: new Date().toISOString(),
          avatar: user.avatar || null,
          isOnline: Math.random() > 0.5, // Statut aléatoire pour la démo
        }));

        console.log(
          `✅ ${this.contacts.length} contacts chargés depuis le service`
        );
      } else if (Array.isArray(data)) {
        // ✅ SI LA RÉPONSE EST DIRECTEMENT UN ARRAY
        this.contacts = data.map((user) => ({
          id: user.id || user._id,
          nom: user.nom || user.name || user.userName || "Utilisateur",
          email: user.email || "",
          matricule: user.matricule || user.id || "",
          poste: user.poste || user.role || "Utilisateur",
          statut: this.getRandomStatus(),
          telephone: user.telephone || "",
          service: user.service || "",
          lastActive: new Date().toISOString(),
          avatar: user.avatar || null,
          isOnline: Math.random() > 0.5,
        }));

        console.log(
          `✅ ${this.contacts.length} contacts chargés (format direct)`
        );
      } else {
        console.warn("⚠️ Format de réponse inattendu:", data);
        this.contacts = this.getMockContacts();
      }

      // ✅ AJOUTER L'UTILISATEUR ACTUEL S'IL N'EST PAS DANS LA LISTE
      if (
        this.currentUser &&
        !this.contacts.find((c) => c.id === this.currentUser.id)
      ) {
        this.contacts.unshift({
          id: this.currentUser.id,
          nom: this.currentUser.nom,
          email: this.currentUser.email || "",
          matricule: this.currentUser.matricule || "",
          poste: this.currentUser.poste || "Utilisateur",
          statut: "online",
          telephone: "",
          service: "",
          lastActive: new Date().toISOString(),
          avatar: null,
          isOnline: true,
          isSelf: true,
        });
      }

      this.renderContacts();
      this.updateContactsStats();
    } catch (error) {
      console.error("❌ Erreur chargement contacts:", error);

      // ✅ FALLBACK : DONNÉES DE TEST
      this.contacts = this.getMockContacts();
      this.renderContacts();
      this.updateContactsStats();

      this.showToast(
        `Service utilisateurs indisponible: ${error.message}`,
        "warning"
      );
    }
  }

  // ✅ AJOUTER MÉTHODE HELPER POUR DONNÉES DE TEST
  getMockContacts() {
    const mockContacts = [
      {
        id: "user_1",
        nom: "DUPONT",
        email: "dupont@cenadi.com",
        matricule: "MAT001",
        poste: "Développeur",
        statut: "online",
        telephone: "0123456789",
        service: "Informatique",
        lastActive: new Date().toISOString(),
        isOnline: true,
      },
      {
        id: "user_2",
        nom: "MARTIN",
        email: "martin@cenadi.com",
        matricule: "MAT002",
        poste: "Designer",
        statut: "away",
        telephone: "0123456790",
        service: "Design",
        lastActive: new Date(Date.now() - 300000).toISOString(),
        isOnline: false,
      },
      {
        id: "user_3",
        nom: "BERNARD",
        email: "bernard@cenadi.com",
        matricule: "MAT003",
        poste: "Chef de projet",
        statut: "offline",
        telephone: "0123456791",
        service: "Management",
        lastActive: new Date(Date.now() - 3600000).toISOString(),
        isOnline: false,
      },
      {
        id: "user_4",
        nom: "THOMAS",
        email: "thomas@cenadi.com",
        matricule: "MAT004",
        poste: "Analyste",
        statut: "online",
        telephone: "0123456792",
        service: "Analyse",
        lastActive: new Date().toISOString(),
        isOnline: true,
      },
    ];

    // ✅ AJOUTER L'UTILISATEUR ACTUEL S'IL EXISTE
    if (this.currentUser) {
      mockContacts.unshift({
        id: this.currentUser.id,
        nom: this.currentUser.nom,
        email: this.currentUser.email || "",
        matricule: this.currentUser.matricule || "",
        poste: this.currentUser.poste || "Utilisateur",
        statut: "online",
        telephone: "",
        service: "",
        lastActive: new Date().toISOString(),
        isOnline: true,
        isSelf: true,
      });
    }

    return mockContacts;
  }

  // ✅ AJOUTER MÉTHODE HELPER POUR STATUS ALÉATOIRE
  getRandomStatus() {
    const statuses = ["online", "away", "offline"];
    return statuses[Math.floor(Math.random() * statuses.length)];
  }

  // ✅ AJOUTER MÉTHODE HELPER POUR TEXTE STATUS
  getStatusText(status) {
    const statusTexts = {
      online: "En ligne",
      away: "Absent",
      offline: "Hors ligne",
      busy: "Occupé",
    };
    return statusTexts[status] || "Inconnu";
  }

  // ✅ AJOUTER APRÈS updateContactsStats
  filterContacts(searchTerm) {
    const cards = document.querySelectorAll(".contact-card");
    const term = searchTerm.toLowerCase().trim();

    if (!term) {
      // ✅ AFFICHER TOUS LES CONTACTS
      cards.forEach((card) => {
        card.style.display = "flex";
      });
      return;
    }

    cards.forEach((card) => {
      const contactName =
        card.querySelector(".contact-name")?.textContent?.toLowerCase() || "";
      const contactMatricule =
        card.querySelector(".contact-matricule")?.textContent?.toLowerCase() ||
        "";
      const contactRole =
        card.querySelector(".contact-role")?.textContent?.toLowerCase() || "";
      const contactEmail =
        card.querySelector(".contact-email")?.textContent?.toLowerCase() || "";

      const matches =
        contactName.includes(term) ||
        contactMatricule.includes(term) ||
        contactRole.includes(term) ||
        contactEmail.includes(term);

      card.style.display = matches ? "flex" : "none";
    });

    console.log(`🔍 Filtrage contacts avec: "${searchTerm}"`);
  }

  // ✅ AJOUTER MÉTHODE filterFiles MANQUANTE
  filterFiles(searchTerm) {
    const cards = document.querySelectorAll(".file-card");
    const term = searchTerm.toLowerCase().trim();

    if (!term) {
      cards.forEach((card) => {
        card.style.display = "block";
      });
      return;
    }

    cards.forEach((card) => {
      const fileName =
        card.querySelector(".file-name")?.textContent?.toLowerCase() || "";
      const matches = fileName.includes(term);
      card.style.display = matches ? "block" : "none";
      style.display = matches;
    });

    console.log(`🔍 Filtrage fichiers avec: "${searchTerm}"`);
  }

  // ✅ AJOUTER APRÈS filterFiles
  async refreshSection(section) {
    try {
      console.log(`🔄 Actualisation section: ${section}`);

      switch (section) {
        case "contacts":
          this.showToast("Actualisation des contacts...", "info");
          await this.loadContacts();
          this.showToast("Contacts actualisés", "success");
          break;

        case "conversations":
          this.showToast("Actualisation des conversations...", "info");
          await this.loadConversations();
          this.showToast("Conversations actualisées", "success");
          break;

        case "files":
          this.showToast("Actualisation des fichiers...", "info");
          await this.loadFiles();
          this.showToast("Fichiers actualisés", "success");
          break;

        case "health":
          this.showToast("Actualisation de l'état du service...", "info");
          await this.loadHealthData();
          this.showToast("État du service actualisé", "success");
          break;

        default:
          console.warn(`Section inconnue: ${section}`);
          this.showToast(`Section "${section}" inconnue`, "warning");
      }
    } catch (error) {
      console.error(`❌ Erreur actualisation ${section}:`, error);
      this.showToast(
        `Erreur actualisation ${section}: ${error.message}`,
        "error"
      );
    }
  }

  // ✅ AJOUTER APRÈS refreshSection
  async loadHealthData() {
    try {
      console.log("❤️ Chargement données de santé...");

      // ✅ CHARGER LES DONNÉES DE SANTÉ DEPUIS L'API
      const response = await fetch(
        `${this.apiBaseUrl.replace("/api", "")}/health`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const healthData = await response.json();
      console.log("✅ Données de santé chargées:", healthData);

      this.updateHealthCards(healthData);
      this.updateSystemInfo(healthData);
    } catch (error) {
      console.error("❌ Erreur chargement données santé:", error);

      // ✅ AFFICHER DES DONNÉES DE FALLBACK
      const fallbackData = {
        services: {
          mongodb: { status: "unknown", message: "Connexion impossible" },
          redis: { status: "unknown", message: "Connexion impossible" },
          kafka: { status: "unknown", message: "Connexion impossible" },
          websocket: {
            status: this.socket?.connected ? "healthy" : "error",
            message: this.socket?.connected ? "Connecté" : "Déconnecté",
          },
          userService: { status: "unknown", message: "Service indisponible" },
        },
        version: "1.0.0",
        uptime: "Inconnu",
        timestamp: new Date().toISOString(),
      };

      this.updateHealthCards(fallbackData);
      this.showToast("Impossible de charger l'état du service", "warning");
    }
  }

  // ✅ AJOUTER MÉTHODE updateHealthCards
  updateHealthCards(healthData) {
    const services = healthData.services || {};

    // ✅ METTRE À JOUR CHAQUE CARTE DE SERVICE
    const serviceCards = [
      { id: "mongoCard", key: "mongodb", name: "MongoDB" },
      { id: "redisCard", key: "redis", name: "Redis" },
      { id: "kafkaCard", key: "kafka", name: "Kafka" },
      { id: "websocketCard", key: "websocket", name: "WebSocket" },
      { id: "userServiceCard", key: "userService", name: "User Service" },
    ];

    serviceCards.forEach(({ id, key, name }) => {
      const card = document.getElementById(id);
      if (!card) return;

      const service = services[key] || {};
      const status = this.normalizeHealthStatus(service.status || service);
      const message = service.message || service.details || "État inconnu";

      const indicator = card.querySelector(".status-indicator");
      const statusText = card.querySelector(".status-text");

      if (indicator) {
        indicator.className = `status-indicator ${status}`;
      }

      if (statusText) {
        statusText.textContent = message;
      }

      // ✅ AJOUTER CLASSE CSS POUR LE STATUT
      card.className = `health-card ${status}`;
    });
  }

  // ✅ AJOUTER MÉTHODE normalizeHealthStatus
  normalizeHealthStatus(status) {
    if (typeof status === "string") {
      const statusLower = status.toLowerCase();
      if (
        statusLower.includes("connecté") ||
        statusLower === "healthy" ||
        statusLower === "ok"
      ) {
        return "active";
      }
      if (
        statusLower.includes("erreur") ||
        statusLower === "error" ||
        statusLower === "down"
      ) {
        return "error";
      }
      if (
        statusLower.includes("dégradé") ||
        statusLower === "degraded" ||
        statusLower === "warning"
      ) {
        return "warning";
      }
    }
    return "unknown";
  }

  // ✅ AJOUTER MÉTHODE updateSystemInfo
  updateSystemInfo(healthData) {
    const uptimeEl = document.getElementById("uptime");
    if (uptimeEl && healthData.uptime) {
      uptimeEl.textContent =
        typeof healthData.uptime === "number"
          ? this.formatUptime(healthData.uptime)
          : healthData.uptime;
    }

    console.log("📊 Informations système mises à jour");
  }

  // ✅ AJOUTER MÉTHODE formatUptime
  formatUptime(seconds) {
    if (!seconds || seconds < 0) return "Inconnu";

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}j ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  // ✅ AJOUTER APRÈS formatUptime
  addMessageToUI(message) {
    const container = document.getElementById("messagesContainer");
    if (!container) return;

    // ✅ SUPPRIMER LE MESSAGE DE BIENVENUE S'IL EXISTE
    const welcomeMessage = container.querySelector(".welcome-message");
    if (welcomeMessage) {
      welcomeMessage.remove();
    }

    const messageEl = document.createElement("div");
    const isSent =
      message.senderId === (this.currentUser?.id || this.currentUser?.userId);

    messageEl.className = `message ${isSent ? "sent" : "received"}`;
    messageEl.innerHTML = `
      <div class="message-content">
        <div class="message-text">${this.escapeHtml(message.content)}</div>
        <div class="message-info">
          <span class="message-time">${this.formatTime(
            message.timestamp
          )}</span>
          <span class="message-sender">${
            message.senderName || "Utilisateur"
          }</span>
          ${
            isSent
              ? '<span class="message-status"><i class="fas fa-check"></i></span>'
              : ""
          }
        </div>
      </div>
    `;

    container.appendChild(messageEl);
    container.scrollTop = container.scrollHeight;

    console.log("💬 Message ajouté à l'interface:", {
      from: message.senderName,
      content: message.content.substring(0, 50) + "...",
      isSent: isSent,
    });
  }

  // ✅ AJOUTER MÉTHODE escapeHtml
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialisation globale
let app;
document.addEventListener("DOMContentLoaded", () => {
  app = new ChatFileApp();
});

// Export pour utilisation externe
if (typeof module !== "undefined" && module.exports) {
  module.exports = ChatFileApp;
}
