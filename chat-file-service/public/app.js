/**
 * CENADI Chat-File Service - Application Frontend
 * Version: 1.0.0
 * Description: Interface utilisateur pour le service de chat et partage de fichiers
 */

class ChatApp {
  constructor() {
    // Configuration
    this.config = window.CHAT_CONFIG;
    this.socket = null;
    this.currentUser = null;
    this.currentConversation = null;
    this.isConnected = false;
    this.typingTimer = null;
    this.isTyping = false;

    // Collections de données
    this.conversations = new Map();
    this.messages = new Map();
    this.contacts = new Map();
    this.files = new Map();
    this.onlineUsers = new Set();

    // États de l'interface
    this.currentView = "chat";
    this.isLoading = false;
    this.settings = this.loadSettings();

    // Initialisation
    this.initializeApp();
  }

  // ================================================================
  // INITIALISATION
  // ================================================================

  async initializeApp() {
    try {
      console.log("🚀 Initialisation de CENADI Chat App...");

      // 1. Charger les données utilisateur
      await this.loadCurrentUser();

      // 2. Initialiser l'interface
      this.initializeUI();

      // 3. Connecter WebSocket
      await this.initializeSocket();

      // 4. Charger les données initiales
      await this.loadInitialData();

      // 5. Configurer les événements
      this.setupEventListeners();

      // 6. Démarrer les services
      this.startServices();

      console.log("✅ Application initialisée avec succès");
      this.showToast("Application démarrée", "success");
    } catch (error) {
      console.error("❌ Erreur initialisation:", error);
      this.showToast("Erreur de démarrage: " + error.message, "error");
    }
  }

  async loadCurrentUser() {
    try {
      // Simuler un utilisateur pour la démo (en production, récupérer depuis l'API)
      this.currentUser = {
        id: `user_${Date.now()}`,
        matricule: `MAT${Math.floor(Math.random() * 1000)
          .toString()
          .padStart(3, "0")}`,
        nom: "Utilisateur Test",
        email: "test@cenadi.com",
        role: "Utilisateur",
        service: "IT",
        statut: "online",
      };

      // Mettre à jour l'interface
      this.updateUserInfo();
    } catch (error) {
      console.error("❌ Erreur chargement utilisateur:", error);
      throw error;
    }
  }

  updateUserInfo() {
    const matriculeEl = document.getElementById("matricule");
    const userRoleEl = document.getElementById("userRole");

    if (matriculeEl) matriculeEl.textContent = this.currentUser.matricule;
    if (userRoleEl) userRoleEl.textContent = this.currentUser.role;
  }

  // ================================================================
  // WEBSOCKET
  // ================================================================

  async initializeSocket() {
    try {
      console.log("🔌 Connexion WebSocket...");

      this.socket = io(this.config.WS_URL, {
        transports: ["websocket", "polling"],
        timeout: 20000,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.setupSocketEvents();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Timeout de connexion WebSocket"));
        }, 10000);

        this.socket.on("connect", () => {
          clearTimeout(timeout);
          console.log("✅ WebSocket connecté");
          this.authenticateSocket();
          resolve();
        });

        this.socket.on("connect_error", (error) => {
          clearTimeout(timeout);
          console.error("❌ Erreur connexion WebSocket:", error);
          reject(error);
        });
      });
    } catch (error) {
      console.error("❌ Erreur initialisation WebSocket:", error);
      throw error;
    }
  }

  authenticateSocket() {
    if (!this.socket || !this.currentUser) return;

    console.log("🔐 Authentification WebSocket...");

    this.socket.emit("authenticate", {
      userId: this.currentUser.id,
      matricule: this.currentUser.matricule,
      token: "demo-token", // En production, utiliser un vrai token JWT
    });
  }

  setupSocketEvents() {
    if (!this.socket) return;

    // Événements de connexion
    this.socket.on("authenticated", (data) => {
      console.log("✅ Authentifié:", data);
      this.isConnected = true;
      this.updateConnectionStatus(true);
    });

    this.socket.on("auth_error", (data) => {
      console.error("❌ Erreur authentification:", data);
      this.showToast("Erreur d'authentification: " + data.message, "error");
    });

    // Événements de messages
    this.socket.on("newMessage", (message) => {
      this.handleNewMessage(message);
    });

    this.socket.on("message_sent", (data) => {
      console.log("✅ Message envoyé:", data);
    });

    // Événements de frappe
    this.socket.on("userTyping", (data) => {
      this.handleUserTyping(data);
    });

    this.socket.on("userStoppedTyping", (data) => {
      this.handleUserStoppedTyping(data);
    });

    // Événements de présence
    this.socket.on("user_connected", (data) => {
      console.log("👤 Utilisateur connecté:", data.matricule);
      this.onlineUsers.add(data.userId);
      this.updateContactStatus(data.userId, "online");
    });

    this.socket.on("user_disconnected", (data) => {
      console.log("👤 Utilisateur déconnecté:", data.matricule);
      this.onlineUsers.delete(data.userId);
      this.updateContactStatus(data.userId, "offline");
    });

    this.socket.on("onlineUsers", (data) => {
      console.log("👥 Utilisateurs en ligne:", data);
      this.onlineUsers.clear();
      data.users.forEach((user) => {
        this.onlineUsers.add(user.userId);
      });
      this.updateContactsDisplay();
    });

    // Événements de conversation
    this.socket.on("user_joined_conversation", (data) => {
      console.log("👥 Utilisateur rejoint conversation:", data);
    });

    this.socket.on("user_left_conversation", (data) => {
      console.log("👋 Utilisateur quitté conversation:", data);
    });

    // Événements de déconnexion
    this.socket.on("disconnect", (reason) => {
      console.log("🔌 WebSocket déconnecté:", reason);
      this.isConnected = false;
      this.updateConnectionStatus(false);
    });

    this.socket.on("reconnect", () => {
      console.log("🔌 WebSocket reconnecté");
      this.authenticateSocket();
    });
  }

  // ================================================================
  // GESTION DES MESSAGES
  // ================================================================

  handleNewMessage(message) {
    console.log("📩 Nouveau message:", message);

    // Ajouter le message à la collection
    if (!this.messages.has(message.conversationId)) {
      this.messages.set(message.conversationId, []);
    }
    this.messages.get(message.conversationId).push(message);

    // Mettre à jour l'affichage si c'est la conversation active
    if (
      this.currentConversation &&
      this.currentConversation.id === message.conversationId
    ) {
      this.displayMessage(message);
      this.scrollToBottom();
    }

    // Mettre à jour la liste des conversations
    this.updateConversationLastMessage(message.conversationId, message);

    // Notification sonore/visuelle
    if (message.senderId !== this.currentUser.id) {
      this.showNotification(message);
      this.playNotificationSound();
    }
  }

  displayMessage(message) {
    const container = document.getElementById("messagesContainer");
    if (!container) return;

    // Supprimer le message de bienvenue s'il existe
    const welcomeMsg = container.querySelector(".welcome-message");
    if (welcomeMsg) welcomeMsg.remove();

    const messageEl = this.createMessageElement(message);
    container.appendChild(messageEl);
  }

  createMessageElement(message) {
    const isOwn = message.senderId === this.currentUser.id;
    const time = new Date(message.timestamp).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const messageEl = document.createElement("div");
    messageEl.className = `message ${isOwn ? "sent" : "received"}`;
    messageEl.innerHTML = `
      <div class="message-content">
        <div class="message-text">${this.escapeHtml(message.content)}</div>
        <div class="message-info">
          <span class="message-time">${time}</span>
          ${
            isOwn
              ? '<span class="message-status delivered"><i class="fas fa-check"></i></span>'
              : ""
          }
        </div>
      </div>
    `;

    return messageEl;
  }

  sendMessage() {
    const input = document.getElementById("messageInput");
    if (!input || !this.socket || !this.currentConversation) return;

    const content = input.value.trim();
    if (!content) return;

    // Arrêter l'indicateur de frappe
    this.stopTyping();

    // Envoyer via WebSocket
    this.socket.emit("sendMessage", {
      content: content,
      conversationId: this.currentConversation.id,
      type: "TEXT",
    });

    // Vider le champ de saisie
    input.value = "";
    this.adjustTextareaHeight(input);
  }

  // ================================================================
  // GESTION DES CONVERSATIONS
  // ================================================================

  async loadConversations() {
    try {
      this.showLoadingState("conversationsList");

      // Simuler des conversations pour la démo
      const mockConversations = [
        {
          id: "conv_1",
          name: "Équipe IT",
          type: "group",
          participants: ["user_1", "user_2", "user_3"],
          lastMessage: {
            content: "Dernière mise à jour terminée",
            timestamp: new Date(Date.now() - 300000),
            senderId: "user_2",
          },
          unreadCount: 2,
        },
        {
          id: "conv_2",
          name: "Marie Dupont",
          type: "private",
          participants: [this.currentUser.id, "user_2"],
          lastMessage: {
            content: "Parfait, merci !",
            timestamp: new Date(Date.now() - 1800000),
            senderId: "user_2",
          },
          unreadCount: 0,
        },
      ];

      // Stocker les conversations
      mockConversations.forEach((conv) => {
        this.conversations.set(conv.id, conv);
      });

      // Afficher les conversations
      this.displayConversations();
    } catch (error) {
      console.error("❌ Erreur chargement conversations:", error);
      this.showErrorState(
        "conversationsList",
        "Erreur chargement conversations"
      );
    }
  }

  displayConversations() {
    const container = document.getElementById("conversationsList");
    if (!container) return;

    container.innerHTML = "";

    if (this.conversations.size === 0) {
      this.showEmptyState("conversationsList", "Aucune conversation");
      return;
    }

    Array.from(this.conversations.values()).forEach((conversation) => {
      const convEl = this.createConversationElement(conversation);
      container.appendChild(convEl);
    });
  }

  createConversationElement(conversation) {
    const lastMessageTime = conversation.lastMessage
      ? new Date(conversation.lastMessage.timestamp).toLocaleTimeString(
          "fr-FR",
          {
            hour: "2-digit",
            minute: "2-digit",
          }
        )
      : "";

    const isActive =
      this.currentConversation &&
      this.currentConversation.id === conversation.id;

    const convEl = document.createElement("div");
    convEl.className = `conversation-item ${isActive ? "active" : ""}`;
    convEl.dataset.conversationId = conversation.id;

    convEl.innerHTML = `
      <div class="conversation-avatar">
        <span>${conversation.name.charAt(0).toUpperCase()}</span>
        <div class="status-indicator online"></div>
      </div>
      <div class="conversation-info">
        <div class="conversation-name">${conversation.name}</div>
        <div class="last-message">${
          conversation.lastMessage
            ? conversation.lastMessage.content
            : "Aucun message"
        }</div>
        <div class="conversation-time">${lastMessageTime}</div>
      </div>
      ${
        conversation.unreadCount > 0
          ? `<div class="unread-badge">${conversation.unreadCount}</div>`
          : ""
      }
    `;

    convEl.addEventListener("click", () => {
      this.selectConversation(conversation.id);
    });

    return convEl;
  }

  selectConversation(conversationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    // Quitter l'ancienne conversation
    if (this.currentConversation && this.socket) {
      this.socket.emit("leaveConversation", {
        conversationId: this.currentConversation.id,
      });
    }

    // Sélectionner la nouvelle conversation
    this.currentConversation = conversation;

    // Rejoindre la nouvelle conversation
    if (this.socket) {
      this.socket.emit("joinConversation", {
        conversationId: conversationId,
      });
    }

    // Mettre à jour l'interface
    this.updateConversationSelection();
    this.updateChatHeader();
    this.loadConversationMessages(conversationId);
    this.showMessageInput();
  }

  updateConversationSelection() {
    document.querySelectorAll(".conversation-item").forEach((item) => {
      item.classList.remove("active");
    });

    if (this.currentConversation) {
      const activeItem = document.querySelector(
        `[data-conversation-id="${this.currentConversation.id}"]`
      );
      if (activeItem) activeItem.classList.add("active");
    }
  }

  updateChatHeader() {
    const chatHeader = document.getElementById("chatHeader");
    if (!chatHeader || !this.currentConversation) return;

    const chatInfo = chatHeader.querySelector(".chat-info");
    if (chatInfo) {
      chatInfo.innerHTML = `
        <div class="avatar">
          <span>${this.currentConversation.name.charAt(0).toUpperCase()}</span>
        </div>
        <div class="chat-details">
          <h3>${this.currentConversation.name}</h3>
          <span class="status">En ligne</span>
        </div>
      `;
    }
  }

  async loadConversationMessages(conversationId) {
    try {
      const container = document.getElementById("messagesContainer");
      if (!container) return;

      container.innerHTML =
        '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i><p>Chargement des messages...</p></div>';

      // Simuler un délai de chargement
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Récupérer les messages de la conversation
      const messages = this.messages.get(conversationId) || [];

      container.innerHTML = "";

      if (messages.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-comments"></i>
            <h3>Aucun message</h3>
            <p>Commencez la conversation en envoyant le premier message</p>
          </div>
        `;
      } else {
        messages.forEach((message) => {
          this.displayMessage(message);
        });
        this.scrollToBottom();
      }
    } catch (error) {
      console.error("❌ Erreur chargement messages:", error);
      this.showErrorState("messagesContainer", "Erreur chargement messages");
    }
  }

  // ================================================================
  // GESTION DES CONTACTS
  // ================================================================

  async loadContacts() {
    try {
      this.showLoadingState("contactsGrid");

      // Simuler des contacts pour la démo
      const mockContacts = [
        {
          id: "user_1",
          matricule: "MAT001",
          nom: "Jean Martin",
          email: "jean.martin@cenadi.com",
          role: "Développeur",
          service: "IT",
          statut: "online",
        },
        {
          id: "user_2",
          matricule: "MAT002",
          nom: "Marie Dupont",
          email: "marie.dupont@cenadi.com",
          role: "Chef de projet",
          service: "IT",
          statut: "away",
        },
        {
          id: "user_3",
          matricule: "MAT003",
          nom: "Pierre Dubois",
          email: "pierre.dubois@cenadi.com",
          role: "Administrateur",
          service: "RH",
          statut: "offline",
        },
      ];

      // Stocker les contacts
      mockContacts.forEach((contact) => {
        this.contacts.set(contact.id, contact);
      });

      // Afficher les contacts
      this.displayContacts();
      this.updateContactsStats();
    } catch (error) {
      console.error("❌ Erreur chargement contacts:", error);
      this.showErrorState("contactsGrid", "Erreur chargement contacts");
    }
  }

  displayContacts() {
    const container = document.getElementById("contactsGrid");
    if (!container) return;

    container.innerHTML = "";

    const contacts = Array.from(this.contacts.values());

    if (contacts.length === 0) {
      this.showEmptyState("contactsGrid", "Aucun contact trouvé");
      return;
    }

    contacts.forEach((contact) => {
      const contactEl = this.createContactElement(contact);
      container.appendChild(contactEl);
    });
  }

  createContactElement(contact) {
    const isOnline = this.onlineUsers.has(contact.id);
    const statusClass = isOnline ? "online" : contact.statut;
    const isSelf = contact.id === this.currentUser.id;

    const contactEl = document.createElement("div");
    contactEl.className = `contact-card ${isSelf ? "self-contact" : ""}`;
    contactEl.dataset.contactId = contact.id;

    contactEl.innerHTML = `
      <div class="contact-avatar">
        <span>${contact.nom
          .split(" ")
          .map((n) => n.charAt(0))
          .join("")}</span>
        <div class="status-indicator ${statusClass}"></div>
      </div>
      <div class="contact-info">
        <div class="contact-name">
          ${contact.nom}
          ${isSelf ? '<i class="fas fa-star" title="Vous"></i>' : ""}
        </div>
        <div class="contact-matricule">${contact.matricule}</div>
        <div class="contact-role">${contact.role}</div>
        <div class="contact-status ${statusClass}">
          <i class="fas fa-circle"></i>
          ${
            isOnline
              ? "En ligne"
              : contact.statut === "away"
              ? "Absent"
              : "Hors ligne"
          }
        </div>
        <div class="contact-email">${contact.email}</div>
      </div>
    `;

    if (!isSelf) {
      contactEl.addEventListener("click", () => {
        this.startConversationWith(contact);
      });
    }

    return contactEl;
  }

  updateContactsStats() {
    const total = this.contacts.size;
    const online = Array.from(this.contacts.values()).filter((c) =>
      this.onlineUsers.has(c.id)
    ).length;
    const away = Array.from(this.contacts.values()).filter(
      (c) => c.statut === "away"
    ).length;

    const totalEl = document.getElementById("totalContacts");
    const onlineEl = document.getElementById("onlineContacts");
    const awayEl = document.getElementById("awayContacts");

    if (totalEl) totalEl.textContent = total;
    if (onlineEl) onlineEl.textContent = online;
    if (awayEl) awayEl.textContent = away;
  }

  // ================================================================
  // GESTION DES FICHIERS
  // ================================================================

  async loadFiles() {
    try {
      this.showLoadingState("filesGrid");

      // Simuler des fichiers pour la démo
      const mockFiles = [
        {
          id: "file_1",
          nom: "Document_projet.pdf",
          taille: 2048576,
          type: "document",
          dateCreation: new Date(Date.now() - 86400000),
          uploaderMatricule: "MAT001",
        },
        {
          id: "file_2",
          nom: "Image_schema.png",
          taille: 1024768,
          type: "image",
          dateCreation: new Date(Date.now() - 3600000),
          uploaderMatricule: "MAT002",
        },
      ];

      // Stocker les fichiers
      mockFiles.forEach((file) => {
        this.files.set(file.id, file);
      });

      // Afficher les fichiers
      this.displayFiles();
    } catch (error) {
      console.error("❌ Erreur chargement fichiers:", error);
      this.showErrorState("filesGrid", "Erreur chargement fichiers");
    }
  }

  displayFiles() {
    const container = document.getElementById("filesGrid");
    if (!container) return;

    container.innerHTML = "";

    const files = Array.from(this.files.values());

    if (files.length === 0) {
      this.showEmptyState("filesGrid", "Aucun fichier trouvé");
      return;
    }

    files.forEach((file) => {
      const fileEl = this.createFileElement(file);
      container.appendChild(fileEl);
    });
  }

  createFileElement(file) {
    const fileEl = document.createElement("div");
    fileEl.className = "file-card";
    fileEl.dataset.fileId = file.id;

    const icon = this.getFileIcon(file.type);
    const size = this.formatFileSize(file.taille);
    const date = file.dateCreation.toLocaleDateString("fr-FR");

    fileEl.innerHTML = `
      <div class="file-icon">
        <i class="${icon}"></i>
      </div>
      <div class="file-info">
        <div class="file-name" title="${file.nom}">${file.nom}</div>
        <div class="file-size">${size}</div>
        <div class="file-date">${date}</div>
      </div>
      <div class="file-actions">
        <button class="btn btn-secondary btn-sm" onclick="chatApp.downloadFile('${file.id}')">
          <i class="fas fa-download"></i>
        </button>
        <button class="btn btn-danger btn-sm" onclick="chatApp.deleteFile('${file.id}')">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;

    return fileEl;
  }

  // ================================================================
  // INTERFACE UTILISATEUR
  // ================================================================

  initializeUI() {
    // Appliquer le thème
    this.applyTheme();

    // Initialiser la vue active
    this.switchView(this.currentView);

    // Configurer les éléments interactifs
    this.setupAutoResize();
  }

  setupEventListeners() {
    // Navigation
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const view = link.dataset.view;
        this.switchView(view);
      });
    });

    // Messages
    const messageInput = document.getElementById("messageInput");
    const sendBtn = document.getElementById("sendBtn");

    if (messageInput) {
      messageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        } else {
          this.handleTyping();
        }
      });

      messageInput.addEventListener("input", () => {
        this.adjustTextareaHeight(messageInput);
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener("click", () => {
        this.sendMessage();
      });
    }

    // Recherche conversations
    const searchConversations = document.getElementById("searchConversations");
    if (searchConversations) {
      searchConversations.addEventListener("input", (e) => {
        this.filterConversations(e.target.value);
      });
    }

    // Recherche contacts
    const searchContacts = document.getElementById("searchContacts");
    if (searchContacts) {
      searchContacts.addEventListener("input", (e) => {
        this.filterContacts(e.target.value);
      });
    }

    // Boutons d'action
    this.setupActionButtons();

    // Modales
    this.setupModals();
  }

  setupActionButtons() {
    // Actualisation
    const refreshContactsBtn = document.getElementById("refreshContactsBtn");
    if (refreshContactsBtn) {
      refreshContactsBtn.addEventListener("click", () => {
        this.loadContacts();
      });
    }

    const refreshFilesBtn = document.getElementById("refreshFilesBtn");
    if (refreshFilesBtn) {
      refreshFilesBtn.addEventListener("click", () => {
        this.loadFiles();
      });
    }

    const refreshHealthBtn = document.getElementById("refreshHealthBtn");
    if (refreshHealthBtn) {
      refreshHealthBtn.addEventListener("click", () => {
        this.loadHealthStatus();
      });
    }

    // Upload
    const uploadBtn = document.getElementById("uploadBtn");
    if (uploadBtn) {
      uploadBtn.addEventListener("click", () => {
        this.openUploadModal();
      });
    }

    // Paramètres
    const settingsBtn = document.getElementById("settingsBtn");
    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => {
        this.openSettingsModal();
      });
    }
  }

  switchView(viewName) {
    // Mettre à jour la navigation
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.classList.remove("active");
    });

    const activeLink = document.querySelector(`[data-view="${viewName}"]`);
    if (activeLink) {
      activeLink.classList.add("active");
    }

    // Masquer toutes les sections
    document.querySelectorAll(".content-section").forEach((section) => {
      section.classList.remove("active");
    });

    // Afficher la section active
    const activeSection = document.getElementById(`${viewName}Section`);
    if (activeSection) {
      activeSection.classList.add("active");
    }

    this.currentView = viewName;

    // Charger les données selon la vue
    this.loadViewData(viewName);
  }

  async loadViewData(viewName) {
    switch (viewName) {
      case "chat":
        if (this.conversations.size === 0) {
          await this.loadConversations();
        }
        break;
      case "contacts":
        if (this.contacts.size === 0) {
          await this.loadContacts();
        }
        break;
      case "files":
        await this.loadFiles();
        break;
      case "api":
        this.loadApiDocumentation();
        break;
      case "health":
        await this.loadHealthStatus();
        break;
    }
  }

  // ================================================================
  // ÉTATS D'AFFICHAGE
  // ================================================================

  showLoadingState(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <h3>Chargement...</h3>
        <p>Veuillez patienter</p>
      </div>
    `;
  }

  showEmptyState(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <h3>${message}</h3>
        <p>Aucun élément à afficher</p>
      </div>
    `;
  }

  showErrorState(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="error-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Erreur</h3>
        <p>${message}</p>
        <button class="btn btn-primary" onclick="location.reload()">
          <i class="fas fa-refresh"></i>
          Actualiser
        </button>
      </div>
    `;
  }

  // ================================================================
  // UTILITAIRES
  // ================================================================

  updateConnectionStatus(connected) {
    const statusEl = document.getElementById("connectionStatus");
    if (!statusEl) return;

    statusEl.className = `connection-status ${
      connected ? "connected" : "disconnected"
    }`;
    statusEl.innerHTML = `
      <i class="fas fa-circle"></i>
      <span>${connected ? "Connecté" : "Déconnecté"}</span>
    `;
  }

  showMessageInput() {
    const container = document.getElementById("messageInputContainer");
    if (container) {
      container.style.display = "flex";
    }
  }

  scrollToBottom() {
    const container = document.getElementById("messagesContainer");
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  adjustTextareaHeight(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  formatFileSize(bytes) {
    const sizes = ["Bytes", "KB", "MB", "GB"];
    if (bytes === 0) return "0 Bytes";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
  }

  getFileIcon(type) {
    const icons = {
      image: "fas fa-image",
      document: "fas fa-file-alt",
      video: "fas fa-video",
      audio: "fas fa-music",
      default: "fas fa-file",
    };
    return icons[type] || icons.default;
  }

  showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    const icon =
      {
        success: "fa-check-circle",
        error: "fa-exclamation-circle",
        warning: "fa-exclamation-triangle",
        info: "fa-info-circle",
      }[type] || "fa-info-circle";

    toast.innerHTML = `
      <i class="fas ${icon} toast-icon"></i>
      <span>${message}</span>
      <button onclick="this.parentElement.remove()">
        <i class="fas fa-times"></i>
      </button>
    `;

    container.appendChild(toast);

    // Auto-suppression après 5 secondes
    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 5000);
  }

  // ================================================================
  // SERVICES SUPPLÉMENTAIRES
  // ================================================================

  async loadInitialData() {
    await this.loadConversations();
  }

  startServices() {
    // Service de vérification de la connexion
    setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit("ping");
      }
    }, 30000);

    // Service d'actualisation automatique
    if (this.settings.autoRefresh) {
      setInterval(() => {
        if (this.currentView === "health") {
          this.loadHealthStatus();
        }
      }, 60000);
    }
  }

  loadSettings() {
    const defaults = {
      theme: "light",
      notifications: true,
      sound: true,
      autoRefresh: true,
    };

    try {
      const saved = localStorage.getItem("cenadi-chat-settings");
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  }

  saveSettings() {
    localStorage.setItem("cenadi-chat-settings", JSON.stringify(this.settings));
  }

  applyTheme() {
    document.documentElement.setAttribute("data-theme", this.settings.theme);
  }

  // ================================================================
  // MÉTHODES PUBLIQUES POUR LES ÉVÉNEMENTS
  // ================================================================

  async downloadFile(fileId) {
    try {
      this.showToast("Téléchargement du fichier...", "info");
      // Implémenter le téléchargement
      console.log("Téléchargement fichier:", fileId);
    } catch (error) {
      this.showToast("Erreur téléchargement: " + error.message, "error");
    }
  }

  async deleteFile(fileId) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce fichier ?")) return;

    try {
      this.showToast("Suppression du fichier...", "info");
      // Implémenter la suppression
      console.log("Suppression fichier:", fileId);
    } catch (error) {
      this.showToast("Erreur suppression: " + error.message, "error");
    }
  }

  // Méthodes de stub pour les fonctionnalités avancées
  setupAutoResize() {
    /* Implémentation future */
  }
  setupModals() {
    /* Implémentation future */
  }
  openUploadModal() {
    this.showToast("Fonctionnalité à implémenter", "info");
  }
  openSettingsModal() {
    this.showToast("Fonctionnalité à implémenter", "info");
  }
  filterConversations(query) {
    /* Implémentation future */
  }
  filterContacts(query) {
    /* Implémentation future */
  }
  handleTyping() {
    /* Implémentation future */
  }
  stopTyping() {
    /* Implémentation future */
  }
  handleUserTyping(data) {
    /* Implémentation future */
  }
  handleUserStoppedTyping(data) {
    /* Implémentation future */
  }
  updateContactStatus(userId, status) {
    /* Implémentation future */
  }
  updateContactsDisplay() {
    this.updateContactsStats();
  }
  updateConversationLastMessage(conversationId, message) {
    /* Implémentation future */
  }
  startConversationWith(contact) {
    this.showToast(`Démarrer conversation avec ${contact.nom}`, "info");
  }
  showNotification(message) {
    /* Implémentation future */
  }
  playNotificationSound() {
    /* Implémentation future */
  }
  loadApiDocumentation() {
    /* Implémentation future */
  }
  async loadHealthStatus() {
    /* Implémentation future */
  }
}

// ================================================================
// INITIALISATION GLOBALE
// ================================================================

// Attendre le chargement complet de la page
document.addEventListener("DOMContentLoaded", () => {
  console.log("🌐 DOM chargé, initialisation de l'application...");

  // Créer l'instance globale de l'application
  window.chatApp = new ChatApp();
});

// Gestion des erreurs globales
window.addEventListener("error", (e) => {
  console.error("❌ Erreur globale:", e.error);
  if (window.chatApp) {
    window.chatApp.showToast("Une erreur est survenue", "error");
  }
});

// Gestion de la déconnexion
window.addEventListener("beforeunload", () => {
  if (window.chatApp && window.chatApp.socket) {
    window.chatApp.socket.disconnect();
  }
});
