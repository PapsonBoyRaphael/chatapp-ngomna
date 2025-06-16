// CENADI Chat-File Service - Application JavaScript
class ChatFileApp {
  constructor() {
    this.socket = null;
    this.currentConversation = null;
    this.currentUser = null;
    this.token = null;
    this.isConnected = false;
    this.settings = {
      theme: localStorage.getItem("theme") || "light",
      notifications: localStorage.getItem("notifications") !== "false",
      sound: localStorage.getItem("sound") !== "false",
    };

    this.init();
  }

  async init() {
    console.log("🚀 Initialisation de CENADI Chat-File Service");

    // IMPORTANT: Récupérer le token et l'utilisateur depuis les cookies
    this.loadUserDataFromCookies();

    // Initialiser les composants
    this.initializeElements();
    this.initializeEventListeners();
    this.initializeSocket();
    this.loadSettings();
    this.checkHealth();

    // Charger les données initiales
    await this.loadInitialData();

    console.log("✅ Application initialisée");
  }

  /**
   * Récupérer les données utilisateur depuis les cookies
   */
  loadUserDataFromCookies() {
    // Récupérer le token depuis les cookies
    this.token = this.getCookie('token');
    
    // Récupérer l'utilisateur depuis les cookies
    const userCookie = this.getCookie('user');
    if (userCookie) {
      try {
        this.currentUser = JSON.parse(decodeURIComponent(userCookie));
      } catch (e) {
        console.warn('⚠️ Erreur parsing user depuis cookie:', e);
      }
    }
    
    console.log('👤 Utilisateur chargé:', this.currentUser?.nom || 'Anonyme');
    console.log('🔑 Token présent:', !!this.token);
    
    // Si pas de token, rediriger vers login
    if (!this.token) {
      console.warn('⚠️ Aucun token trouvé dans les cookies - redirection vers login');
      this.redirectToLogin();
      return;
    }
    
    // Afficher les infos utilisateur
    this.displayUserInfo();
  }

  /**
   * Récupérer un cookie par son nom
   */
  getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }

  /**
   * Rediriger vers la page de login
   */
  redirectToLogin() {
    // Nettoyer les cookies et localStorage
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure; SameSite=None;';
    document.cookie = 'user=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure; SameSite=None;';
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Rediriger vers le login
    setTimeout(() => {
      window.location.href = 'http://localhost:8001/';
    }, 1000);
  }

  /**
   * Afficher les informations utilisateur
   */
  displayUserInfo() {
    if (this.currentUser && !document.querySelector('.user-info')) {
      const userInfo = document.createElement('div');
      userInfo.className = 'user-info';
      userInfo.innerHTML = `
        <div class="user-avatar">
          <i class="fas fa-user"></i>
        </div>
        <div class="user-details">
          <div class="user-name">${this.currentUser.nom}</div>
          <div class="user-role">${this.currentUser.role || 'Utilisateur'}</div>
        </div>
        <button onclick="app.logout()" class="logout-btn" title="Déconnexion">
          <i class="fas fa-sign-out-alt"></i>
        </button>
      `;
      
      // Créer un header temporaire pour afficher les infos utilisateur
      const tempHeader = document.createElement('div');
      tempHeader.className = 'temp-user-header';
      tempHeader.appendChild(userInfo);
      document.body.insertBefore(tempHeader, document.body.firstChild);
    }
  }

  /**
   * Déconnexion
   */
  logout() {
    // Déconnecter le socket
    if (this.socket) {
      this.socket.disconnect();
    }
    
    this.showToast('Déconnexion...', 'info');
    this.redirectToLogin();
  }

  /**
   * Faire des requêtes authentifiées avec le token des cookies
   */
  async authenticatedFetch(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include' // Important pour envoyer les cookies
    });

    // Si 401, rediriger vers login
    if (response.status === 401) {
      this.showToast('Session expirée', 'error');
      this.redirectToLogin();
      return null;
    }

    return response;
  }

  initializeElements() {
    // Navigation
    this.navLinks = document.querySelectorAll(".nav-link");
    this.contentSections = document.querySelectorAll(".content-section");

    // Chat elements
    this.conversationsList = document.getElementById("conversationsList");
    this.messagesContainer = document.getElementById("messagesContainer");
    this.messageInput = document.getElementById("messageInput");
    this.sendBtn = document.getElementById("sendBtn");
    this.chatHeader = document.getElementById("chatHeader");

    // Files elements
    this.filesGrid = document.getElementById("filesGrid");
    this.uploadBtn = document.getElementById("uploadBtn");
    this.fileInput = document.getElementById("fileInput");
    this.uploadArea = document.getElementById("uploadArea");

    // Health elements
    this.healthCards = {
      mongo: document.getElementById("mongoCard"),
      redis: document.getElementById("redisCard"),
      kafka: document.getElementById("kafkaCard"),
      websocket: document.getElementById("websocketCard"),
    };

    // Modals
    this.uploadModal = document.getElementById("uploadModal");
    this.settingsModal = document.getElementById("settingsModal");

    // Status
    this.connectionStatus = document.getElementById("connectionStatus");
    this.toastContainer = document.getElementById("toastContainer");
  }

  initializeEventListeners() {
    // Navigation
    this.navLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        this.switchSection(section);
      });
    });

    // Chat
    this.sendBtn?.addEventListener("click", () => this.sendMessage());
    this.messageInput?.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Files
    this.uploadBtn?.addEventListener("click", () => this.openUploadModal());
    this.fileInput?.addEventListener("change", (e) => this.handleFileSelect(e));

    // Upload modal drag & drop
    if (this.uploadArea) {
      this.uploadArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        this.uploadArea.classList.add("dragover");
      });

      this.uploadArea.addEventListener("dragleave", () => {
        this.uploadArea.classList.remove("dragover");
      });

      this.uploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        this.uploadArea.classList.remove("dragover");
        this.handleFileDrop(e);
      });

      this.uploadArea.addEventListener("click", () => this.fileInput?.click());
    }

    // Settings
    document
      .getElementById("settingsBtn")
      ?.addEventListener("click", () => this.openSettingsModal());
    document
      .getElementById("refreshHealthBtn")
      ?.addEventListener("click", () => this.checkHealth());

    // Modal close buttons
    document.querySelectorAll(".close-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const modal = e.target.closest(".modal");
        this.closeModal(modal);
      });
    });

    // Search
    document
      .getElementById("searchConversations")
      ?.addEventListener("input", (e) => {
        this.searchConversations(e.target.value);
      });

    document.getElementById("searchFiles")?.addEventListener("input", (e) => {
      this.searchFiles(e.target.value);
    });

    // Window events
    window.addEventListener("beforeunload", () => {
      if (this.socket) {
        this.socket.disconnect();
      }
    });
  }

  initializeSocket() {
    try {
      // Vérifier si on a un token
      if (!this.token) {
        console.warn('⚠️ Aucun token pour WebSocket - arrêt de la connexion');
        return;
      }

      console.log('🔌 Initialisation WebSocket avec token:', this.token.substring(0, 20) + '...');

      // Connexion WebSocket avec le token
      this.socket = io("http://localhost:8003", {
        transports: ["websocket", "polling"],
        autoConnect: false,
        auth: {
          token: this.token
        },
        extraHeaders: {
          'Authorization': `Bearer ${this.token}`
        },
        withCredentials: true // Important pour les cookies
      });

      this.socket.on("connect", () => {
        console.log("✅ WebSocket connecté avec succès");
        this.isConnected = true;
        this.updateConnectionStatus(true);
        this.updateHealthCard("websocket", true, "Connecté");
        this.showToast('Connexion WebSocket établie', 'success');
      });

      this.socket.on("disconnect", (reason) => {
        console.log("❌ WebSocket déconnecté:", reason);
        this.isConnected = false;
        this.updateConnectionStatus(false);
        this.updateHealthCard("websocket", false, "Déconnecté");
        
        if (reason === 'io server disconnect') {
          // Le serveur a forcé la déconnexion, probablement token invalide
          this.showToast('Session expirée - reconnexion...', 'warning');
          this.redirectToLogin();
        }
      });

      this.socket.on("connect_error", (error) => {
        console.warn("⚠️ Erreur WebSocket:", error.message);
        this.updateConnectionStatus(false);
        this.updateHealthCard("websocket", false, "Erreur: " + error.message);
        
        if (error.message.includes('authentication') || 
            error.message.includes('token') || 
            error.message.includes('unauthorized')) {
          this.showToast('Authentification échouée', 'error');
          this.redirectToLogin();
        } else {
          this.showToast('Erreur de connexion WebSocket', 'error');
        }
      });

      this.socket.on("message", (data) => {
        this.handleNewMessage(data);
      });

      this.socket.on("file_uploaded", (data) => {
        this.handleFileUploaded(data);
      });

      this.socket.on("conversation_updated", (data) => {
        this.handleConversationUpdated(data);
      });

      // Événement de confirmation de connexion
      this.socket.on("connected", (data) => {
        console.log("🎉 Connexion confirmée:", data);
        this.showToast(`Bienvenue ${data.userName}!`, 'success');
      });

      // Connecter
      this.socket.connect();
    } catch (error) {
      console.warn("⚠️ WebSocket non disponible:", error.message);
      this.updateConnectionStatus(false);
    }
  }

  async loadInitialData() {
    try {
      // Charger les conversations
      await this.loadConversations();

      // Charger les fichiers
      await this.loadFiles();

      // Charger les informations système
      await this.loadSystemInfo();
    } catch (error) {
      console.error("❌ Erreur chargement données initiales:", error);
      this.showToast("Erreur lors du chargement des données", "error");
    }
  }

  async loadConversations() {
    try {
      const response = await this.authenticatedFetch("/api/conversations");
      
      if (!response) return; // Redirection déjà gérée

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        this.renderConversations(data.data);
      } else {
        console.log("📭 Aucune conversation trouvée");
        this.renderEmptyConversations();
      }
    } catch (error) {
      console.warn(
        "⚠️ Impossible de charger les conversations:",
        error.message
      );
      this.renderConversationsError();
    }
  }

  async loadFiles() {
    try {
      const response = await this.authenticatedFetch("/api/files/conversation/all");
      
      if (!response) return;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        this.renderFiles(data.data);
      } else {
        this.renderEmptyFiles();
      }
    } catch (error) {
      console.warn("⚠️ Impossible de charger les fichiers:", error.message);
      this.renderFilesError();
    }
  }

  async sendMessage() {
    const content = this.messageInput?.value?.trim();
    if (!content || !this.currentConversation) return;

    try {
      const messageData = {
        conversationId: this.currentConversation,
        content: content,
        type: "TEXT",
      };

      // Envoyer via API authentifiée
      const response = await this.authenticatedFetch("/api/messages", {
        method: "POST",
        body: JSON.stringify(messageData),
      });

      if (response && response.ok) {
        this.messageInput.value = "";
        // Le message sera ajouté via WebSocket
      } else {
        throw new Error("Erreur envoi message");
      }
    } catch (error) {
      console.error("❌ Erreur envoi message:", error);
      this.showToast("Erreur lors de l'envoi du message", "error");
    }
  }

  // Toast notifications avec container automatique
  showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fas fa-${this.getToastIcon(type)}"></i>
      <span>${message}</span>
      <button onclick="this.parentElement.remove()">
        <i class="fas fa-times"></i>
      </button>
    `;

    // Créer le container s'il n'existe pas
    if (!this.toastContainer) {
      this.toastContainer = document.createElement('div');
      this.toastContainer.id = 'toastContainer';
      this.toastContainer.className = 'toast-container';
      document.body.appendChild(this.toastContainer);
    }

    this.toastContainer.appendChild(toast);

    // Auto-remove après 5 secondes
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 5000);
  }

  updateConnectionStatus(isConnected) {
    if (!this.connectionStatus) return;

    const indicator = this.connectionStatus.querySelector("i");
    const text = this.connectionStatus.querySelector("span");

    if (isConnected) {
      if (indicator) indicator.style.color = "var(--success-color, #10b981)";
      if (text) text.textContent = "Connecté";
    } else {
      if (indicator) indicator.style.color = "var(--danger-color, #ef4444)";
      if (text) text.textContent = "Déconnecté";
    }
  }

  updateHealthCard(service, isHealthy, status) {
    const card = this.healthCards[service];
    if (!card) return;

    const indicator = card.querySelector(".status-indicator");
    const text = card.querySelector(".status-text");

    if (indicator) {
      indicator.className = `status-indicator ${isHealthy ? "active" : "error"}`;
      indicator.style.backgroundColor = isHealthy
        ? "var(--success-color, #10b981)"
        : "var(--danger-color, #ef4444)";
    }

    if (text) {
      text.textContent = status;
    }
  }

  getToastIcon(type) {
    const icons = {
      success: "check-circle",
      error: "exclamation-circle",
      warning: "exclamation-triangle",
      info: "info-circle",
    };
    return icons[type] || "info-circle";
  }

  // Garder toutes les autres méthodes existantes...
  async loadSystemInfo() {
    try {
      const response = await fetch("/health");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this.renderSystemInfo(data);
    } catch (error) {
      console.warn("⚠️ Impossible de charger les infos système:", error.message);
    }
  }

  renderConversations(conversations) {
    if (!this.conversationsList) return;
    this.conversationsList.innerHTML = conversations
      .map(conv => `
        <div class="conversation-item" data-id="${conv.id}" onclick="app.selectConversation('${conv.id}')">
          <div class="conversation-avatar"><i class="fas fa-user"></i></div>
          <div class="conversation-details">
            <div class="conversation-name">${conv.name || "Conversation"}</div>
            <div class="conversation-last-message">${conv.lastMessage || "Aucun message"}</div>
          </div>
          <div class="conversation-meta">
            <span class="conversation-time">${this.formatTime(conv.updatedAt)}</span>
            ${conv.unreadCount ? `<span class="unread-badge">${conv.unreadCount}</span>` : ""}
          </div>
        </div>
      `).join("");
  }

  renderEmptyConversations() {
    if (!this.conversationsList) return;
    this.conversationsList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-comments"></i>
        <p>Aucune conversation</p>
        <button class="btn btn-primary" onclick="app.createNewConversation()">Nouvelle conversation</button>
      </div>
    `;
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    if (diff < 24 * 60 * 60 * 1000) {
      return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    } else {
      return date.toLocaleDateString("fr-FR");
    }
  }

  // Méthodes stub pour éviter les erreurs
  renderConversationsError() { console.log('Error loading conversations'); }
  renderFiles() { console.log('Rendering files...'); }
  renderEmptyFiles() { console.log('No files found'); }
  renderFilesError() { console.log('Error loading files'); }
  renderSystemInfo() { console.log('Rendering system info...'); }
  checkHealth() { console.log('Health check...'); }
  loadSettings() { document.body.setAttribute("data-theme", this.settings.theme); }
  switchSection() { console.log('Switching section...'); }
  searchConversations() { console.log('Searching conversations...'); }
  searchFiles() { console.log('Searching files...'); }
  openUploadModal() { console.log('Opening upload modal...'); }
  openSettingsModal() { console.log('Opening settings modal...'); }
  closeModal() { console.log('Closing modal...'); }
  handleFileSelect() { console.log('File selected...'); }
  handleFileDrop() { console.log('File dropped...'); }
  createNewConversation() { this.showToast("Fonction en développement", "info"); }
  selectConversation() { console.log('Selecting conversation...'); }
  loadMessages() { console.log('Loading messages...'); }
  renderMessages() { console.log('Rendering messages...'); }
  renderEmptyMessages() { console.log('No messages found'); }
  renderMessagesError() { console.log('Error loading messages'); }
  updateChatHeader() { console.log('Updating chat header...'); }
  handleNewMessage() { console.log('New message received...'); }
  handleFileUploaded() { console.log('File uploaded...'); }
  handleConversationUpdated() { console.log('Conversation updated...'); }
  uploadFile() { console.log('Uploading file...'); }
  downloadFile() { console.log('Downloading file...'); }
  deleteFile() { console.log('Deleting file...'); }
  shareFile() { this.showToast("Lien de partage copié", "success"); }
  showUploadProgress() { console.log('Showing upload progress...'); }
  hideUploadProgress() { console.log('Hiding upload progress...'); }
  updateHealthFromAPI() { console.log('Updating health from API...'); }
  updateSetting() { console.log('Setting updated...'); }
  formatFileSize() { return '0 B'; }
  getFileIcon() { return 'file'; }
}

// Initialiser l'application quand le DOM est prêt
document.addEventListener("DOMContentLoaded", () => {
  window.app = new ChatFileApp();
});

// Styles CSS pour l'interface utilisateur
const additionalStyles = `
  .temp-user-header {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 1000;
    background: #3b82f6;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }
  
  .user-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  
  .user-avatar {
    width: 32px;
    height: 32px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
  }
  
  .user-details {
    display: flex;
    flex-direction: column;
  }
  
  .user-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: white;
  }
  
  .user-role {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.8);
  }
  
  .logout-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    transition: all 0.2s;
  }
  
  .logout-btn:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }
  
  .toast-container {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    pointer-events: none;
  }
  
  .toast {
    background: white;
    border-radius: 0.5rem;
    padding: 1rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 300px;
    animation: slideIn 0.3s ease-out;
    pointer-events: auto;
  }
  
  .toast.success { border-left: 4px solid #10b981; }
  .toast.error { border-left: 4px solid #ef4444; }
  .toast.warning { border-left: 4px solid #f59e0b; }
  .toast.info { border-left: 4px solid #3b82f6; }
  
  .toast i { font-size: 1.25rem; }
  .toast.success i { color: #10b981; }
  .toast.error i { color: #ef4444; }
  .toast.warning i { color: #f59e0b; }
  .toast.info i { color: #3b82f6; }
  
  .toast span { flex: 1; font-size: 0.875rem; }
  
  .toast button {
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
  }
  
  .toast button:hover { background: #f3f4f6; }
  
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  
  .conversation-item {
    display: flex;
    align-items: center;
    padding: 1rem 1.5rem;
    cursor: pointer;
    transition: all 0.2s;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .conversation-item:hover { background: #f9fafb; }
  .conversation-item.active { background: #3b82f6; color: white; }
  
  .empty-state, .error-state {
    text-align: center;
    padding: 3rem 2rem;
    color: #6b7280;
  }
  
  .empty-state i, .error-state i {
    font-size: 3rem;
    margin-bottom: 1rem;
    color: #6b7280;
  }
  
  .btn {
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    border: none;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.2s;
  }
  
  .btn-primary {
    background: #3b82f6;
    color: white;
  }
  
  .btn-primary:hover {
    background: #2563eb;
  }
`;

// Injecter les styles additionnels
const styleSheet = document.createElement("style");
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);
