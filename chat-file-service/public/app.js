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
    this.authToken = null;

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

      // 1. Charger les données utilisateur depuis les cookies
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

      // Rediriger vers la page de connexion si pas d'authentification
      if (error.message.includes("authentification")) {
        this.redirectToLogin();
      }
    }
  }

  async loadCurrentUser() {
    try {
      console.log(
        "🔐 Chargement des données utilisateur depuis les cookies..."
      );

      // Extraire le token et les données utilisateur des cookies
      const authData = this.getAuthDataFromCookies();

      if (!authData.token || !authData.user) {
        throw new Error("Aucune donnée d'authentification trouvée");
      }

      this.authToken = authData.token;
      this.currentUser = authData.user;

      console.log("✅ Utilisateur chargé:", {
        id: this.currentUser.id,
        matricule: this.currentUser.matricule,
        nom: this.currentUser.nom,
      });

      // Mettre à jour l'interface
      this.updateUserInfo();
    } catch (error) {
      console.error("❌ Erreur chargement utilisateur:", error);
      throw new Error("Erreur d'authentification: " + error.message);
    }
  }

  getAuthDataFromCookies() {
    const cookies = document.cookie.split(";").reduce((acc, cookie) => {
      const [name, value] = cookie.trim().split("=");
      if (name && value) {
        acc[name] = decodeURIComponent(value);
      }
      return acc;
    }, {});

    let token = cookies.token;
    let user = null;

    try {
      if (cookies.user) {
        user = JSON.parse(cookies.user);
      }
    } catch (error) {
      console.error("❌ Erreur parsing données utilisateur:", error);
    }

    return { token, user };
  }

  updateUserInfo() {
    const matriculeEl = document.getElementById("matricule");
    const userRoleEl = document.getElementById("userRole");

    if (matriculeEl)
      matriculeEl.textContent = this.currentUser.matricule || "N/A";
    if (userRoleEl)
      userRoleEl.textContent = this.currentUser.role || "Utilisateur";
  }

  redirectToLogin() {
    // Supprimer les cookies d'authentification
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    document.cookie = "user=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    // Rediriger vers la gateway (qui gère l'authentification)
    window.location.href = "http://localhost:8001/";
  }

  // ================================================================
  // UTILITAIRES HTTP
  // ================================================================

  async makeAuthenticatedRequest(url, options = {}) {
    const defaultOptions = {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
        ...options.headers,
      },
      ...options,
    };

    try {
      console.log("🌐 Requête HTTP:", {
        url: url,
        method: defaultOptions.method || "GET",
        hasAuth: !!this.authToken,
      });

      const response = await fetch(url, defaultOptions);

      console.log("📡 Réponse HTTP:", {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get("content-type"),
      });

      if (response.status === 401) {
        console.error("❌ Token expiré, redirection vers login");
        this.redirectToLogin();
        throw new Error("Session expirée");
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Erreur HTTP:", errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type");
      let responseData;

      if (contentType && contentType.includes("application/json")) {
        responseData = await response.json();
        console.log("📋 Données JSON reçues:", responseData);
      } else {
        responseData = await response.text();
        console.log("📋 Données texte reçues:", responseData.substring(0, 200));
      }

      return responseData;
    } catch (error) {
      console.error("❌ Erreur requête HTTP complète:", {
        url: url,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
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
        auth: {
          token: this.authToken,
        },
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
      token: this.authToken,
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
      this.redirectToLogin();
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

  async loadMessageHistory(conversationId) {
    try {
      const url = `${this.config.MESSAGE_SERVICE_URL}?conversationId=${conversationId}&limit=50`;
      const response = await this.makeAuthenticatedRequest(url);

      if (response.success && response.data) {
        return response.data;
      }

      return [];
    } catch (error) {
      console.error("❌ Erreur chargement historique messages:", error);
      return [];
    }
  }

  // ================================================================
  // GESTION DES CONVERSATIONS - CORRIGÉE
  // ================================================================

  async loadConversations() {
    try {
      this.showLoadingState("conversationsList");

      console.log("📥 Chargement des conversations...");
      const url = `${this.config.CONVERSATION_SERVICE_URL}`;

      console.log("🔗 URL appelée:", url);
      const response = await this.makeAuthenticatedRequest(url);

      console.log("📦 Réponse reçue:", response);

      // ✅ VALIDATION ROBUSTE DE LA RÉPONSE AVEC STRUCTURE IMBRIQUÉE
      let conversations = [];

      if (response) {
        // Cas 1: Structure API CENADI { success: true, data: { conversations: [...] } }
        if (
          response.success &&
          response.data &&
          Array.isArray(response.data.conversations)
        ) {
          conversations = response.data.conversations;
          console.log("✅ Format API CENADI détecté (data.conversations)");
        }
        // Cas 2: Structure API standard { success: true, data: [...] }
        else if (response.success && Array.isArray(response.data)) {
          conversations = response.data;
          console.log("✅ Format API standard détecté (data direct)");
        }
        // Cas 3: Réponse directe sous forme de tableau
        else if (Array.isArray(response)) {
          conversations = response;
          console.log("✅ Format tableau direct détecté");
        }
        // Cas 4: Réponse avec data direct (sans success)
        else if (response.data && Array.isArray(response.data)) {
          conversations = response.data;
          console.log("✅ Format data direct détecté");
        }
        // Cas 5: Réponse avec conversations dans un autre champ
        else if (
          response.conversations &&
          Array.isArray(response.conversations)
        ) {
          conversations = response.conversations;
          console.log("✅ Format conversations direct détecté");
        }
        // Cas 6: Réponse avec results
        else if (response.results && Array.isArray(response.results)) {
          conversations = response.results;
          console.log("✅ Format results détecté");
        }
        // Cas 7: Réponse avec items
        else if (response.items && Array.isArray(response.items)) {
          conversations = response.items;
          console.log("✅ Format items détecté");
        } else {
          // ✅ LOGGING DÉTAILLÉ POUR DEBUG
          console.warn("⚠️ Format de réponse non reconnu:", {
            type: typeof response,
            success: response.success,
            hasData: !!response.data,
            dataType: response.data ? typeof response.data : "undefined",
            hasConversations: response.data
              ? !!response.data.conversations
              : false,
            conversationsType:
              response.data && response.data.conversations
                ? typeof response.data.conversations
                : "undefined",
            isArray:
              response.data && response.data.conversations
                ? Array.isArray(response.data.conversations)
                : false,
            structure: Object.keys(response),
            dataStructure: response.data
              ? Object.keys(response.data)
              : "no data",
          });

          // ✅ ESSAYER D'EXTRAIRE LES CONVERSATIONS MÊME SI FORMAT INATTENDU
          if (response.data && response.data.conversations !== undefined) {
            conversations = Array.isArray(response.data.conversations)
              ? response.data.conversations
              : [];
            console.log("🔄 Tentative d'extraction forcée des conversations");
          } else {
            throw new Error(
              `Format de réponse non supporté. Structure: ${JSON.stringify(
                Object.keys(response)
              )}`
            );
          }
        }
      } else {
        throw new Error("Réponse vide du serveur");
      }

      // ✅ VALIDATION DU CONTENU
      if (!Array.isArray(conversations)) {
        console.error("❌ Conversations n'est pas un tableau:", {
          type: typeof conversations,
          value: conversations,
        });
        throw new Error(
          "Format de données invalide - conversations n'est pas un tableau"
        );
      }

      console.log(`📊 ${conversations.length} conversations trouvées`);

      // ✅ TRAITEMENT DES CONVERSATIONS
      if (conversations.length > 0) {
        // Stocker les conversations avec validation
        conversations.forEach((conv, index) => {
          try {
            // Validation de base
            if (!conv.id) {
              console.warn(`⚠️ Conversation ${index} sans ID:`, conv);
              conv.id = `conv_${Date.now()}_${index}`;
            }

            // Normalisation des données
            const normalizedConv = {
              id: conv.id,
              name:
                conv.name ||
                conv.title ||
                conv.nom ||
                `Conversation ${conv.id}`,
              type: conv.type || "group",
              participants: Array.isArray(conv.participants)
                ? conv.participants
                : [],
              lastMessage: conv.lastMessage || conv.dernierMessage || null,
              unreadCount: conv.unreadCount || conv.messagesNonLus || 0,
              createdAt: conv.createdAt || conv.dateCreation || new Date(),
              updatedAt: conv.updatedAt || conv.dateMiseAJour || new Date(),
            };

            this.conversations.set(normalizedConv.id, normalizedConv);
            console.log(
              `✅ Conversation ajoutée: ${normalizedConv.name} (${normalizedConv.id})`
            );
          } catch (convError) {
            console.warn(
              `⚠️ Erreur traitement conversation ${index}:`,
              convError,
              conv
            );
          }
        });

        // Afficher les conversations
        this.displayConversations();
        console.log(
          `✅ ${conversations.length} conversations chargées et ${this.conversations.size} stockées`
        );
      } else {
        console.log(
          "ℹ️ Aucune conversation trouvée - Affichage de l'état vide"
        );
        this.showEmptyState("conversationsList", "Aucune conversation");

        // ✅ AJOUTER QUELQUES CONVERSATIONS DE DÉMONSTRATION
        console.log("🔄 Ajout de conversations de démonstration...");
        this.loadMockConversations();
      }
    } catch (error) {
      console.error("❌ Erreur chargement conversations:", error);
      console.error("📋 Détails de l'erreur:", {
        message: error.message,
        stack: error.stack,
        url: this.config.CONVERSATION_SERVICE_URL,
      });

      this.showErrorState(
        "conversationsList",
        `Erreur chargement conversations: ${error.message}`
      );

      // Fallback: utiliser des données de démonstration
      console.log("🔄 Chargement des conversations de démonstration...");
      this.loadMockConversations();
    }
  }

  loadMockConversations() {
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
        name: "Support Technique",
        type: "group",
        participants: [this.currentUser.id, "user_2"],
        lastMessage: {
          content: "Parfait, merci !",
          timestamp: new Date(Date.now() - 1800000),
          senderId: "user_2",
        },
        unreadCount: 0,
      },
    ];

    mockConversations.forEach((conv) => {
      this.conversations.set(conv.id, conv);
    });

    this.displayConversations();
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

      // Charger l'historique des messages depuis l'API
      const messages = await this.loadMessageHistory(conversationId);

      // Stocker les messages dans la collection locale
      this.messages.set(conversationId, messages);

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
  // GESTION DES CONTACTS - MÊME LOGIQUE APPLIQUÉE
  // ================================================================

  async loadContacts() {
    try {
      this.showLoadingState("contactsGrid");

      console.log("👥 Chargement des contacts...");
      const url = `${this.config.USER_SERVICE_URL}/all`;

      console.log("🔗 URL appelée:", url);
      const response = await this.makeAuthenticatedRequest(url);

      console.log("📦 Réponse contacts reçue:", response);

      // ✅ VALIDATION ROBUSTE AVEC STRUCTURE IMBRIQUÉE
      let contacts = [];

      if (response) {
        // Cas 1: Structure API CENADI { success: true, data: { users: [...] } }
        if (
          response.success &&
          response.data &&
          Array.isArray(response.data.users)
        ) {
          contacts = response.data.users;
          console.log("✅ Format API CENADI détecté (data.users)");
        }
        // Cas 2: Structure API CENADI { success: true, data: { contacts: [...] } }
        else if (
          response.success &&
          response.data &&
          Array.isArray(response.data.contacts)
        ) {
          contacts = response.data.contacts;
          console.log("✅ Format API CENADI détecté (data.contacts)");
        }
        // Cas 3: Structure API standard { success: true, data: [...] }
        else if (response.success && Array.isArray(response.data)) {
          contacts = response.data;
          console.log("✅ Format API standard détecté");
        }
        // Cas 4: Réponse directe sous forme de tableau
        else if (Array.isArray(response)) {
          contacts = response;
          console.log("✅ Format tableau direct détecté");
        }
        // Cas 5: Réponse avec data direct
        else if (response.data && Array.isArray(response.data)) {
          contacts = response.data;
          console.log("✅ Format data direct détecté");
        }
        // Cas 6: Réponse avec users
        else if (response.users && Array.isArray(response.users)) {
          contacts = response.users;
          console.log("✅ Format users détecté");
        }
        // Cas 7: Réponse avec contacts
        else if (response.contacts && Array.isArray(response.contacts)) {
          contacts = response.contacts;
          console.log("✅ Format contacts détecté");
        } else {
          console.warn("⚠️ Format de réponse contacts non reconnu:", {
            type: typeof response,
            success: response.success,
            hasData: !!response.data,
            dataType: response.data ? typeof response.data : "undefined",
            structure: Object.keys(response),
            dataStructure: response.data
              ? Object.keys(response.data)
              : "no data",
          });

          // Essayer d'extraire quand même
          if (response.data) {
            const possibleArrays = Object.values(response.data).filter(
              Array.isArray
            );
            if (possibleArrays.length > 0) {
              contacts = possibleArrays[0];
              console.log("🔄 Extraction forcée du premier tableau trouvé");
            }
          }

          if (!Array.isArray(contacts) || contacts.length === 0) {
            throw new Error("Format de réponse contacts invalide");
          }
        }
      } else {
        throw new Error("Réponse vide du serveur pour les contacts");
      }

      // ✅ VALIDATION ET TRAITEMENT
      if (!Array.isArray(contacts)) {
        throw new Error("Les données contacts ne sont pas un tableau");
      }

      console.log(`📊 ${contacts.length} contacts trouvés`);

      if (contacts.length > 0) {
        // Stocker les contacts avec validation
        contacts.forEach((contact, index) => {
          try {
            // Validation de base
            if (!contact.id && !contact.agt_id) {
              console.warn(`⚠️ Contact ${index} sans ID:`, contact);
              contact.id = `user_${Date.now()}_${index}`;
            }

            // Normalisation des données
            const normalizedContact = {
              id: contact.id || contact.agt_id,
              matricule: contact.matricule || contact.agt_id || "N/A",
              nom: contact.nom || contact.name || "Nom inconnu",
              prenom: contact.prenom || contact.firstName || "",
              email: contact.email || "",
              role: contact.role || "Utilisateur",
              service: contact.service || contact.ministere || "",
              statut: contact.statut || "offline",
            };

            this.contacts.set(normalizedContact.id, normalizedContact);
          } catch (contactError) {
            console.warn(
              `⚠️ Erreur traitement contact ${index}:`,
              contactError,
              contact
            );
          }
        });

        // Afficher les contacts
        this.displayContacts();
        this.updateContactsStats();
        console.log(
          `✅ ${contacts.length} contacts chargés et ${this.contacts.size} stockés`
        );
      } else {
        console.log("ℹ️ Aucun contact trouvé");
        this.showEmptyState("contactsGrid", "Aucun contact trouvé");

        // Fallback avec données de démonstration
        this.loadMockContacts();
      }
    } catch (error) {
      console.error("❌ Erreur chargement contacts:", error);
      this.showErrorState(
        "contactsGrid",
        `Erreur chargement contacts: ${error.message}`
      );

      // Fallback: utiliser des données de démonstration
      console.log("🔄 Chargement des contacts de démonstration...");
      this.loadMockContacts();
    }
  }

  loadMockContacts() {
    const mockContacts = [
      {
        id: "user_1",
        matricule: "MAT001",
        nom: "Jean Martin",
        prenom: "Jean",
        email: "jean.martin@cenadi.com",
        role: "Développeur",
        service: "IT",
        statut: "online",
      },
      {
        id: "user_2",
        matricule: "MAT002",
        nom: "Marie Dupont",
        prenom: "Marie",
        email: "marie.dupont@cenadi.com",
        role: "Chef de projet",
        service: "IT",
        statut: "away",
      },
      {
        id: "user_3",
        matricule: "MAT003",
        nom: "Pierre Dubois",
        prenom: "Pierre",
        email: "pierre.dubois@cenadi.com",
        role: "Administrateur",
        service: "RH",
        statut: "offline",
      },
    ];

    mockContacts.forEach((contact) => {
      this.contacts.set(contact.id, contact);
    });

    this.displayContacts();
    this.updateContactsStats();
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

    const fullName = `${contact.prenom || ""} ${contact.nom || ""}`.trim();
    const initials = fullName
      .split(" ")
      .map((n) => n.charAt(0))
      .join("")
      .substring(0, 2);

    contactEl.innerHTML = `
      <div class="contact-avatar">
        <span>${initials}</span>
        <div class="status-indicator ${statusClass}"></div>
      </div>
      <div class="contact-info">
        <div class="contact-name">
          ${fullName}
          ${isSelf ? '<i class="fas fa-star" title="Vous"></i>' : ""}
        </div>
        <div class="contact-matricule">${contact.matricule}</div>
        <div class="contact-role">${contact.role || "N/A"}</div>
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
        <div class="contact-email">${contact.email || "N/A"}</div>
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
  // GESTION DES FICHIERS - MÊME LOGIQUE APPLIQUÉE
  // ================================================================

  async loadFiles() {
    try {
      this.showLoadingState("filesGrid");

      console.log("📁 Chargement des fichiers...");
      const url = `${this.config.FILE_SERVICE_URL}`;

      console.log("🔗 URL appelée:", url);
      const response = await this.makeAuthenticatedRequest(url);

      console.log("📦 Réponse fichiers reçue:", response);

      // ✅ VALIDATION ROBUSTE AVEC STRUCTURE IMBRIQUÉE
      let files = [];

      if (response) {
        // Cas 1: Structure API CENADI { success: true, data: { files: [...] } }
        if (
          response.success &&
          response.data &&
          Array.isArray(response.data.files)
        ) {
          files = response.data.files;
          console.log("✅ Format API CENADI détecté (data.files)");
        }
        // Cas 2: Structure API standard { success: true, data: [...] }
        else if (response.success && Array.isArray(response.data)) {
          files = response.data;
          console.log("✅ Format API standard détecté");
        }
        // Cas 3: Réponse directe sous forme de tableau
        else if (Array.isArray(response)) {
          files = response;
          console.log("✅ Format tableau direct détecté");
        }
        // Cas 4: Réponse avec data direct
        else if (response.data && Array.isArray(response.data)) {
          files = response.data;
          console.log("✅ Format data direct détecté");
        }
        // Cas 5: Réponse avec files
        else if (response.files && Array.isArray(response.files)) {
          files = response.files;
          console.log("✅ Format files détecté");
        } else {
          console.warn("⚠️ Format de réponse fichiers non reconnu:", {
            type: typeof response,
            structure: Object.keys(response),
            dataStructure: response.data
              ? Object.keys(response.data)
              : "no data",
          });

          // Essayer d'extraire quand même
          if (response.data) {
            const possibleArrays = Object.values(response.data).filter(
              Array.isArray
            );
            if (possibleArrays.length > 0) {
              files = possibleArrays[0];
              console.log("🔄 Extraction forcée du premier tableau trouvé");
            }
          }

          if (!Array.isArray(files)) {
            throw new Error("Format de réponse fichiers invalide");
          }
        }
      } else {
        throw new Error("Réponse vide du serveur pour les fichiers");
      }

      if (!Array.isArray(files)) {
        throw new Error("Les données fichiers ne sont pas un tableau");
      }

      console.log(`📊 ${files.length} fichiers trouvés`);

      if (files.length > 0) {
        // Stocker les fichiers avec validation
        files.forEach((file, index) => {
          try {
            const normalizedFile = {
              id: file.id || `file_${Date.now()}_${index}`,
              nom: file.nom || file.name || file.filename || "Fichier sans nom",
              taille: file.taille || file.size || 0,
              type: file.type || file.mimeType || "unknown",
              dateCreation: file.dateCreation || file.createdAt || new Date(),
              uploaderMatricule:
                file.uploaderMatricule || file.uploader || "N/A",
            };

            this.files.set(normalizedFile.id, normalizedFile);
          } catch (fileError) {
            console.warn(
              `⚠️ Erreur traitement fichier ${index}:`,
              fileError,
              file
            );
          }
        });

        this.displayFiles();
        console.log(
          `✅ ${files.length} fichiers chargés et ${this.files.size} stockés`
        );
      } else {
        console.log("ℹ️ Aucun fichier trouvé");
        this.showEmptyState("filesGrid", "Aucun fichier trouvé");

        // Fallback avec données de démonstration
        this.loadMockFiles();
      }
    } catch (error) {
      console.error("❌ Erreur chargement fichiers:", error);
      this.showErrorState(
        "filesGrid",
        `Erreur chargement fichiers: ${error.message}`
      );

      // Fallback: utiliser des données de démonstration
      console.log("🔄 Chargement des fichiers de démonstration...");
      this.loadMockFiles();
    }
  }

  loadMockFiles() {
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

    mockFiles.forEach((file) => {
      this.files.set(file.id, file);
    });

    this.displayFiles();
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
    const date = new Date(file.dateCreation).toLocaleDateString("fr-FR");

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

  async downloadFile(fileId) {
    try {
      this.showToast("Téléchargement du fichier...", "info");

      const url = `${this.config.FILE_SERVICE_URL}/${fileId}/download`;
      const response = await this.makeAuthenticatedRequest(url, {
        method: "GET",
      });

      // Si c'est une URL de téléchargement, ouvrir dans un nouvel onglet
      if (typeof response === "string" && response.startsWith("http")) {
        window.open(response, "_blank");
      } else {
        console.log("Fichier téléchargé:", response);
      }

      this.showToast("Fichier téléchargé avec succès", "success");
    } catch (error) {
      console.error("❌ Erreur téléchargement:", error);
      this.showToast("Erreur téléchargement: " + error.message, "error");
    }
  }

  async deleteFile(fileId) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce fichier ?")) return;

    try {
      this.showToast("Suppression du fichier...", "info");

      const url = `${this.config.FILE_SERVICE_URL}/${fileId}`;
      await this.makeAuthenticatedRequest(url, {
        method: "DELETE",
      });

      // Supprimer de la collection locale
      this.files.delete(fileId);

      // Mettre à jour l'affichage
      this.displayFiles();

      this.showToast("Fichier supprimé avec succès", "success");
    } catch (error) {
      console.error("❌ Erreur suppression:", error);
      this.showToast("Erreur suppression: " + error.message, "error");
    }
  }

  // ================================================================
  // HEALTH CHECK
  // ================================================================

  async loadHealthStatus() {
    try {
      this.showLoadingState("healthCards");

      console.log("🏥 Chargement du statut de santé...");
      const url = this.config.HEALTH_CHECK_URL;
      const response = await this.makeAuthenticatedRequest(url);

      this.displayHealthStatus(response);
    } catch (error) {
      console.error("❌ Erreur chargement santé:", error);
      this.showErrorState("healthCards", "Erreur chargement statut");
    }
  }

  displayHealthStatus(healthData) {
    const container = document.getElementById("healthCards");
    if (!container) return;

    container.innerHTML = `
      <div class="health-card">
        <div class="health-icon ${healthData.status}">
          <i class="fas fa-heartbeat"></i>
        </div>
        <div class="health-info">
          <h3>Service Principal</h3>
          <span class="health-status ${healthData.status}">${
      healthData.status
    }</span>
          <small>Dernière vérification: ${new Date(
            healthData.timestamp
          ).toLocaleString("fr-FR")}</small>
        </div>
      </div>
    `;

    if (healthData.services) {
      Object.entries(healthData.services).forEach(
        ([serviceName, serviceData]) => {
          const serviceCard = document.createElement("div");
          serviceCard.className = "health-card";
          serviceCard.innerHTML = `
          <div class="health-icon ${serviceData.status}">
            <i class="fas fa-server"></i>
          </div>
          <div class="health-info">
            <h3>${serviceName}</h3>
            <span class="health-status ${serviceData.status}">${
            serviceData.status
          }</span>
            <small>${serviceData.message || "N/A"}</small>
          </div>
        `;
          container.appendChild(serviceCard);
        }
      );
    }
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
  // MÉTHODES DE STUB POUR FONCTIONNALITÉS AVANCÉES
  // ================================================================

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
