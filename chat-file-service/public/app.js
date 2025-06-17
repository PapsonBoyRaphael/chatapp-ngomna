class ChatFileApp {
  constructor() {
    // ✅ CONFIGURATION MISE À JOUR
    this.apiBaseUrl = "http://localhost:8003/api";
    this.wsUrl = "http://localhost:8003";
    this.userServiceUrl = "http://localhost:8000/api/users";

    // États de l'application
    this.socket = null;
    this.currentUser = null;
    this.currentView = "chat";
    this.conversations = [];
    this.contacts = [];
    this.files = [];
    this.connectionAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.currentConversationId = "general";

    // Initialiser l'application
    this.init();
  }

  async init() {
    try {
      console.log("🚀 Initialisation ChatFileApp...");

      // Initialiser l'interface
      this.initializeUI();

      // ✅ CHARGER LES DONNÉES UTILISATEUR DEPUIS LES COOKIES
      this.loadUserFromCookies();

      if (this.currentUser && this.currentUser.token) {
        // Connecter WebSocket
        await this.connectWebSocket();

        // Charger les données initiales
        await this.loadInitialData();
      } else {
        this.showLoginRedirect();
      }

      console.log("✅ ChatFileApp initialisé");
    } catch (error) {
      console.error("❌ Erreur initialisation:", error);
      this.showToast("Erreur d'initialisation de l'application", "error");
    }
  }

  // ✅ NOUVELLE MÉTHODE : LIRE DEPUIS LES COOKIES
  loadUserFromCookies() {
    try {
      console.log("🍪 Lecture des cookies...");

      // Lire le token depuis les cookies
      const token = this.getCookie("token");
      const userCookie = this.getCookie("user");

      console.log("🔍 Cookies trouvés:", {
        hasToken: !!token,
        hasUser: !!userCookie,
        tokenStart: token ? token.substring(0, 20) + "..." : "null",
      });

      if (token && userCookie) {
        try {
          // Décoder les données utilisateur
          const userData = JSON.parse(decodeURIComponent(userCookie));

          this.currentUser = {
            id: userData.id || userData.userId || `user_${Date.now()}`,
            userId: userData.id || userData.userId,
            nom: userData.nom || userData.name || userData.userName,
            userName: userData.nom || userData.name || userData.userName,
            email: userData.email,
            poste: userData.poste || userData.role,
            matricule: userData.matricule,
            token: token, // ✅ TOKEN RÉEL DEPUIS LE COOKIE
          };

          // ✅ AUSSI SAUVEGARDER DANS localStorage POUR COMPATIBILITÉ
          localStorage.setItem("chatuser", JSON.stringify(this.currentUser));

          this.updateUserUI();
          console.log("✅ Utilisateur chargé depuis les cookies:", {
            id: this.currentUser.id,
            nom: this.currentUser.nom,
            hasToken: !!this.currentUser.token,
          });
        } catch (parseError) {
          console.error("❌ Erreur parsing données utilisateur:", parseError);
          this.clearAuthData();
        }
      } else {
        console.log("⚠️ Pas de données d'authentification dans les cookies");
        // ✅ FALLBACK : essayer localStorage pour le développement
        this.loadUserFromStorage();
      }
    } catch (error) {
      console.error("❌ Erreur lecture cookies:", error);
      this.clearAuthData();
    }
  }

  // ✅ MÉTHODE HELPER POUR LIRE LES COOKIES
  getCookie(name) {
    try {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) {
        const cookieValue = parts.pop().split(";").shift();
        return cookieValue || null;
      }
      return null;
    } catch (error) {
      console.error(`❌ Erreur lecture cookie ${name}:`, error);
      return null;
    }
  }

  // ✅ NETTOYER LES DONNÉES D'AUTHENTIFICATION
  clearAuthData() {
    // Supprimer les cookies
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "user=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

    // Supprimer localStorage
    localStorage.removeItem("chatuser");

    this.currentUser = null;
  }

  // ✅ FALLBACK POUR LE DÉVELOPPEMENT
  loadUserFromStorage() {
    try {
      const userData = localStorage.getItem("chatuser");
      if (userData) {
        const parsed = JSON.parse(userData);

        // Vérifier si on a un token valide
        if (parsed.token && parsed.token !== "undefined") {
          this.currentUser = parsed;
          this.updateUserUI();
          console.log(
            "✅ Utilisateur chargé depuis localStorage (fallback):",
            this.currentUser.nom
          );
        } else {
          console.log("⚠️ Token invalide dans localStorage");
          localStorage.removeItem("chatuser");
        }
      }
    } catch (error) {
      console.error("❌ Erreur chargement localStorage:", error);
      localStorage.removeItem("chatuser");
    }
  }

  // ✅ REDIRECTION VERS LA PAGE DE LOGIN
  showLoginRedirect() {
    const shouldRedirect = confirm(
      "Vous devez être connecté pour utiliser le chat.\n\nVoulez-vous être redirigé vers la page de connexion ?"
    );

    if (shouldRedirect) {
      window.location.href = "http://localhost:8000/auth/login";
    } else {
      // Mode développement : créer un utilisateur temporaire
      this.createDevUser();
    }
  }

  // ✅ MODE DÉVELOPPEMENT : CRÉER UN UTILISATEUR TEMPORAIRE
  createDevUser() {
    console.log("🔧 Mode développement : création d'un utilisateur temporaire");

    const userName = prompt("Mode développement - Nom d'utilisateur:");
    if (userName && userName.trim()) {
      const userId = `dev_user_${Date.now()}`;

      this.currentUser = {
        id: userId,
        userId: userId,
        nom: userName.trim().toUpperCase(),
        userName: userName.trim().toUpperCase(),
        token: this.generateDevToken(userName.trim()),
        email: `${userName.toLowerCase()}@dev.cenadi.com`,
        poste: "Développeur",
        matricule: `DEV${Date.now().toString().slice(-4)}`,
      };

      localStorage.setItem("chatuser", JSON.stringify(this.currentUser));
      this.updateUserUI();
      this.connectWebSocket();
      this.loadInitialData();

      console.log("✅ Utilisateur développement créé:", this.currentUser);
      this.showToast(`Mode développement : ${this.currentUser.nom}`, "info");
    }
  }

  // ✅ GÉNÉRER UN TOKEN POUR LE DÉVELOPPEMENT
  generateDevToken(username) {
    try {
      const header = {
        alg: "HS256",
        typ: "JWT",
      };

      const currentTime = Math.floor(Date.now() / 1000);
      const userId = `dev_user_${Date.now()}`;

      const payload = {
        id: userId,
        userId: userId,
        nom: username.toUpperCase(),
        userName: username.toUpperCase(),
        email: `${username.toLowerCase()}@dev.cenadi.com`,
        iat: currentTime,
        exp: currentTime + 24 * 60 * 60,
        iss: "chat-file-service-dev",
        aud: "chat-users",
      };

      const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
      const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
      const signature = this.base64UrlEncode(
        `dev-signature-${userId}-${currentTime}`
      );

      return `${encodedHeader}.${encodedPayload}.${signature}`;
    } catch (error) {
      console.error("❌ Erreur génération token dev:", error);
      return `dev-token-${username}-${Date.now()}`;
    }
  }

  base64UrlEncode(str) {
    try {
      return btoa(unescape(encodeURIComponent(str)))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    } catch (error) {
      console.error("❌ Erreur encoding base64:", error);
      return btoa(str);
    }
  }

  // ✅ AMÉLIORER LA CONNEXION WEBSOCKET AVEC LE VRAI TOKEN
  async connectWebSocket() {
    try {
      if (this.socket) {
        this.socket.disconnect();
      }

      if (!this.currentUser || !this.currentUser.token) {
        throw new Error("Aucun token d'authentification disponible");
      }

      console.log("🔌 Connexion WebSocket avec token authentique...");

      this.socket = io(this.wsUrl, {
        transports: ["websocket", "polling"],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 2000,
        autoConnect: true,
        forceNew: false,
        // ✅ ENVOYER LE TOKEN DANS L'AUTH
        auth: {
          token: this.currentUser.token,
        },
        query: {
          userId: this.currentUser.id,
          userName: this.currentUser.nom,
        },
      });

      // ✅ ÉVÉNEMENTS WEBSOCKET AMÉLIORÉS
      this.socket.on("connect", () => {
        console.log("✅ WebSocket connecté");
        this.updateConnectionStatus(true);
        this.connectionAttempts = 0;

        // ✅ AUTHENTIFICATION AVEC LE VRAI TOKEN
        const authData = {
          userId: this.currentUser.id || this.currentUser.userId,
          userName: this.currentUser.nom || this.currentUser.userName,
          token: this.currentUser.token,
        };

        console.log("🔐 Authentification WebSocket:", {
          userId: authData.userId,
          userName: authData.userName,
          hasToken: !!authData.token,
          tokenStart: authData.token
            ? authData.token.substring(0, 20) + "..."
            : "null",
        });

        this.socket.emit("authenticate", authData);
      });

      this.socket.on("authenticated", (data) => {
        console.log("✅ Authentification WebSocket réussie:", data);
        this.showToast(
          `Connecté en tant que ${data.userName || data.nom}`,
          "success"
        );

        // Rejoindre la conversation générale
        this.socket.emit("joinConversation", {
          conversationId: this.currentConversationId,
        });
      });

      this.socket.on("auth_error", (error) => {
        console.error("❌ Erreur authentification WebSocket:", error);
        this.showToast(
          `Erreur d'authentification: ${error.message || "Token invalide"}`,
          "error"
        );

        // ✅ EN CAS D'ERREUR DE TOKEN, REDIRIGER VERS LOGIN
        if (error.message && error.message.includes("token")) {
          setTimeout(() => {
            this.clearAuthData();
            this.showLoginRedirect();
          }, 2000);
        }
      });

      this.socket.on("error", (error) => {
        console.error("❌ Erreur WebSocket:", error);
        this.showToast(
          `Erreur de connexion: ${error.message || "Erreur inconnue"}`,
          "error"
        );
      });

      this.socket.on("disconnect", (reason) => {
        console.log("🔌 WebSocket déconnecté:", reason);
        this.updateConnectionStatus(false);

        if (reason === "io server disconnect") {
          setTimeout(() => this.connectWebSocket(), 3000);
        }
      });

      this.socket.on("reconnect_failed", () => {
        console.error("❌ Impossible de se reconnecter au WebSocket");
        this.showToast(
          "Connexion perdue - Veuillez rafraîchir la page",
          "error"
        );
      });

      // ✅ ÉVÉNEMENTS DE CHAT
      this.socket.on("newMessage", (message) => this.handleNewMessage(message));
      this.socket.on("messageStatus", (status) =>
        this.updateMessageStatus(status)
      );
      this.socket.on("userTyping", (data) => this.showTypingIndicator(data));
      this.socket.on("userStoppedTyping", (data) =>
        this.hideTypingIndicator(data)
      );

      this.socket.on("user_connected", (data) => {
        console.log("👤 Utilisateur connecté:", data);
        this.showToast(`${data.userName} s'est connecté`, "info");
      });

      this.socket.on("user_disconnected", (data) => {
        console.log("👤 Utilisateur déconnecté:", data);
        this.showToast(`${data.userName} s'est déconnecté`, "info");
      });

      this.socket.on("conversation_joined", (data) => {
        console.log("💬 Conversation rejointe:", data);
      });
    } catch (error) {
      console.error("❌ Erreur connexion WebSocket:", error);
      this.showToast("Erreur de connexion WebSocket", "error");
    }
  }

  // ✅ AMÉLIORER LES REQUÊTES API AVEC LE VRAI TOKEN
  async makeAuthenticatedRequest(url, options = {}) {
    if (!this.currentUser || !this.currentUser.token) {
      throw new Error("Utilisateur non authentifié");
    }

    const defaultHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.currentUser.token}`,
      "user-id": this.currentUser.id || this.currentUser.userId,
      "user-name": this.currentUser.nom || this.currentUser.userName,
    };

    const mergedOptions = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    console.log(`🌐 Requête API: ${options.method || "GET"} ${url}`);
    return fetch(url, mergedOptions);
  }

  // ✅ ADAPTER TOUTES LES MÉTHODES DE CHARGEMENT
  async loadConversations() {
    try {
      console.log("📋 Chargement des conversations...");

      const response = await this.makeAuthenticatedRequest(
        `${this.apiBaseUrl}/conversations`
      );

      if (!response.ok) {
        if (response.status === 401) {
          this.handleAuthError("Session expirée");
          return;
        }
        if (response.status === 404) {
          this.conversations = [];
          this.renderConversations();
          console.log("📋 Aucune conversation trouvée");
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        this.conversations = Array.isArray(data.data.conversations)
          ? data.data.conversations
          : Array.isArray(data.data)
          ? data.data
          : [];

        this.renderConversations();
        console.log(`✅ ${this.conversations.length} conversations chargées`);
      } else {
        this.conversations = [];
        this.renderConversations();
      }
    } catch (error) {
      console.error("❌ Erreur chargement conversations:", error);
      this.conversations = [];
      this.renderConversations();
      this.showToast(
        `Impossible de charger les conversations: ${error.message}`,
        "error"
      );
    }
  }

  async loadFiles() {
    try {
      console.log("📁 Chargement des fichiers...");

      const response = await this.makeAuthenticatedRequest(
        `${this.apiBaseUrl}/files`
      );

      if (!response.ok) {
        if (response.status === 401) {
          this.handleAuthError("Session expirée");
          return;
        }
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
      } else {
        this.files = [];
      }

      this.renderFiles();
      console.log(`✅ ${this.files.length} fichiers chargés`);
    } catch (error) {
      console.error("❌ Erreur chargement fichiers:", error);
      this.files = [];
      this.renderFiles();
      this.showToast("Service de fichiers indisponible", "warning");
    }
  }

  // ✅ GESTION DES ERREURS D'AUTHENTIFICATION
  handleAuthError(message) {
    console.error("🔒 Erreur d'authentification:", message);
    this.showToast(message, "error");

    setTimeout(() => {
      this.clearAuthData();
      this.showLoginRedirect();
    }, 2000);
  }

  // ✅ AMÉLIORER L'ENVOI DE MESSAGES
  async sendMessage() {
    const input = document.getElementById("messageInput");
    const content = input?.value?.trim();

    if (!content || !this.currentUser) {
      return;
    }

    try {
      // Envoyer via WebSocket si disponible
      if (this.socket && this.socket.connected) {
        this.socket.emit("sendMessage", {
          content: content,
          senderId: this.currentUser.id || this.currentUser.userId,
          senderName: this.currentUser.nom || this.currentUser.userName,
          conversationId: this.currentConversationId,
          type: "TEXT",
        });

        input.value = "";
        console.log("📤 Message envoyé via WebSocket");

        // Ajouter le message à l'interface immédiatement
        this.addMessageToUI({
          id: `temp_${Date.now()}`,
          content: content,
          senderId: this.currentUser.id,
          senderName: this.currentUser.nom,
          timestamp: new Date(),
          conversationId: this.currentConversationId,
        });
      } else {
        // Fallback API REST
        const response = await this.makeAuthenticatedRequest(
          `${this.apiBaseUrl}/messages`,
          {
            method: "POST",
            body: JSON.stringify({
              content: content,
              conversationId: this.currentConversationId,
              type: "TEXT",
            }),
          }
        );

        if (response.ok) {
          input.value = "";
          console.log("📤 Message envoyé via API REST");
          this.showToast("Message envoyé", "success");
        } else if (response.status === 401) {
          this.handleAuthError("Session expirée");
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      }
    } catch (error) {
      console.error("❌ Erreur envoi message:", error);
      this.showToast("Erreur lors de l'envoi du message", "error");
    }
  }

  // ✅ GESTION DES ÉVÉNEMENTS WEBSOCKET
  handleNewMessage(message) {
    console.log("💬 Nouveau message reçu:", message);
    this.showToast(
      `Nouveau message de ${message.senderName || "Utilisateur"}`,
      "info"
    );

    // Mettre à jour l'interface si on est dans la bonne conversation
    if (message.conversationId === this.currentConversationId) {
      this.addMessageToUI(message);
    }
  }

  updateMessageStatus(status) {
    console.log("📝 Statut message mis à jour:", status);
    // Mettre à jour l'interface selon le statut
  }

  showTypingIndicator(data) {
    console.log("⌨️ Indicateur de frappe:", data);
    // Afficher l'indicateur de frappe
  }

  // Navigation
  initializeUI() {
    const navLinks = document.querySelectorAll(".nav-link");
    navLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const view = e.currentTarget.dataset.view;
        this.switchView(view);
      });
    });

    // Boutons d'action
    this.bindEventListeners();

    // Interface par défaut
    this.updateConnectionStatus(false);
  }

  bindEventListeners() {
    // Bouton de paramètres
    const settingsBtn = document.getElementById("settingsBtn");
    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => this.showSettings());
    }

    // Bouton nouveau chat
    const newChatBtn = document.getElementById("newChatBtn");
    if (newChatBtn) {
      newChatBtn.addEventListener("click", () => this.showNewChatModal());
    }

    // Bouton upload fichier
    const uploadBtn = document.getElementById("uploadBtn");
    if (uploadBtn) {
      uploadBtn.addEventListener("click", () => this.showUploadModal());
    }

    // Envoi de message
    const sendBtn = document.getElementById("sendBtn");
    const messageInput = document.getElementById("messageInput");

    if (sendBtn && messageInput) {
      sendBtn.addEventListener("click", () => this.sendMessage());
      messageInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }

    // Recherche contacts
    const contactSearch = document.getElementById("contactSearch");
    if (contactSearch) {
      contactSearch.addEventListener("input", (e) => {
        this.filterContacts(e.target.value);
      });
    }

    // Recherche fichiers
    const fileSearch = document.getElementById("fileSearch");
    if (fileSearch) {
      fileSearch.addEventListener("input", (e) => {
        this.filterFiles(e.target.value);
      });
    }

    // Rafraîchir données
    const refreshButtons = document.querySelectorAll('[data-action="refresh"]');
    refreshButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const section = btn.dataset.section;
        this.refreshSection(section);
      });
    });
  }

  switchView(view) {
    // Masquer toutes les sections
    const sections = document.querySelectorAll(".content-section");
    sections.forEach((section) => section.classList.remove("active"));

    // Afficher la section demandée
    const targetSection = document.getElementById(`${view}Section`);
    if (targetSection) {
      targetSection.classList.add("active");
    }

    // Mettre à jour la navigation
    const navLinks = document.querySelectorAll(".nav-link");
    navLinks.forEach((link) => {
      link.classList.remove("active");
      if (link.dataset.view === view) {
        link.classList.add("active");
      }
    });

    this.currentView = view;

    // Charger les données spécifiques à la vue
    this.loadViewData(view);
  }

  async loadViewData(view) {
    try {
      switch (view) {
        case "chat":
          await this.loadConversations();
          break;
        case "contacts":
          await this.loadContacts();
          break;
        case "files":
          await this.loadFiles();
          break;
        case "api":
          this.loadApiDocumentation();
          break;
        case "health":
          await this.loadHealthData();
          break;
      }
    } catch (error) {
      console.error(`❌ Erreur chargement vue ${view}:`, error);
      this.showToast(`Erreur de chargement des données ${view}`, "error");
    }
  }

  async loadInitialData() {
    try {
      console.log("📊 Chargement des données initiales...");

      // Charger les conversations
      await this.loadConversations();

      // Charger les contacts
      await this.loadContacts();

      console.log("✅ Données initiales chargées");
    } catch (error) {
      console.error("❌ Erreur chargement données initiales:", error);
      this.showToast("Erreur de chargement des données", "error");
    }
  }

  renderConversations() {
    const container = document.getElementById("conversationsList");
    if (!container) return;

    if (this.conversations.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-comments"></i>
          <h3>Aucune conversation</h3>
          <p>Commencez une nouvelle conversation</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.conversations
      .map(
        (conv) => `
      <div class="conversation-item" data-id="${conv.id}">
        <div class="conversation-avatar">
          <i class="fas fa-user"></i>
        </div>
        <div class="conversation-info">
          <div class="conversation-name">${conv.name || "Conversation"}</div>
          <div class="last-message">${conv.lastMessage || "Aucun message"}</div>
        </div>
        <div class="conversation-meta">
          <div class="timestamp">${this.formatTime(conv.updatedAt)}</div>
          ${
            conv.unreadCount
              ? `<div class="unread-badge">${conv.unreadCount}</div>`
              : ""
          }
        </div>
      </div>
    `
      )
      .join("");
  }

  renderContacts() {
    const container = document.getElementById("contactsGrid");
    if (!container) return;

    if (this.contacts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-address-book"></i>
          <h3>Aucun contact</h3>
          <p>Les contacts s'afficheront ici</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.contacts
      .map(
        (contact) => `
      <div class="contact-card" data-id="${contact.id}">
        <div class="contact-avatar">
          <span>${contact.nom.charAt(0)}</span>
          <div class="status-indicator ${contact.statut}"></div>
        </div>
        <div class="contact-info">
          <div class="contact-name">${contact.nom}</div>
          <div class="contact-matricule">${contact.matricule}</div>
          <div class="contact-role">${contact.poste}</div>
          <div class="contact-status ${contact.statut}">
            <i class="fas fa-circle"></i>
            <span>${
              contact.statut === "online" ? "En ligne" : "Hors ligne"
            }</span>
          </div>
        </div>
        <div class="contact-actions">
          <button class="action-btn" onclick="app.startChat('${
            contact.id
          }')" title="Démarrer une conversation">
            <i class="fas fa-comment"></i>
          </button>
          <button class="action-btn" onclick="app.showContactDetails('${
            contact.id
          }')" title="Voir les détails">
            <i class="fas fa-info"></i>
          </button>
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

  updateContactsStats() {
    const total = this.contacts.length;
    const online = this.contacts.filter((c) => c.statut === "online").length;
    const offline = total - online;

    document.getElementById("totalContacts").textContent = total;
    document.getElementById("onlineContacts").textContent = online;
    document.getElementById("offlineContacts").textContent = offline;
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
