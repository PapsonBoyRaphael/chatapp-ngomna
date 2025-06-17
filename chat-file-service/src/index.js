const express = require("express");
const { createServer } = require("http");
const cors = require("cors");
const path = require("path");
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");

// Configuration
require("dotenv").config();

// ✅ AJOUTER VALIDATION ENVIRONNEMENT
const EnvironmentValidator = require("./config/envValidator");
const envValidator = new EnvironmentValidator();

if (!envValidator.validate()) {
  console.error("❌ Configuration environnement invalide. Arrêt du service.");
  process.exit(1);
}

// Connexions infrastructure - TOUTES CORRIGÉES
const connectDB = require("./infrastructure/mongodb/connection");
const redisConfig = require("./infrastructure/redis/redisConfig"); // ✅ CORRIGÉ
const kafkaConfig = require("./infrastructure/kafka/config/kafkaConfig"); // ✅ CORRIGÉ

// Gestionnaires Redis optionnels
const OnlineUserManager = require("./infrastructure/redis/OnlineUserManager");
const RoomManager = require("./infrastructure/redis/RoomManager");

// Repositories
const MongoMessageRepository = require("./infrastructure/repositories/MongoMessageRepository");
const MongoConversationRepository = require("./infrastructure/repositories/MongoConversationRepository");
const MongoFileRepository = require("./infrastructure/repositories/MongoFileRepository");

// Use Cases
const SendMessage = require("./application/use-cases/SendMessage");
const GetMessages = require("./application/use-cases/GetMessages");
const UpdateMessageStatus = require("./application/use-cases/UpdateMessageStatus");
const GetConversations = require("./application/use-cases/GetConversations");
const GetConversation = require("./application/use-cases/GetConversation");
const UploadFile = require("./application/use-cases/UploadFile");
const GetFile = require("./application/use-cases/GetFile");

// Controllers
const ConversationController = require("./application/controllers/ConversationController");
const MessageController = require("./application/controllers/MessageController");
const FileController = require("./application/controllers/FileController");
const HealthController = require("./application/controllers/HealthController");

// Routes
const createConversationRoutes = require("./interfaces/http/routes/conversationRoutes");
const createMessageRoutes = require("./interfaces/http/routes/messageRoutes");
const createFileRoutes = require("./interfaces/http/routes/fileRoutes");
const createHealthRoutes = require("./interfaces/http/routes/healthRoutes");

// Kafka Producers - Utilisation des vrais fichiers
const MessageProducer = require("./infrastructure/kafka/producers/MessageProducer");
const FileProducer = require("./infrastructure/kafka/producers/FileProducer");

// Kafka Consumer
const NotificationConsumer = require("./infrastructure/kafka/consumers/NotificationConsumer");

// WebSocket Handler
const ChatHandler = require("./application/websocket/chatHandler");

// Middleware - CORRECTION
const { rateLimitMiddleware } = require("./interfaces/http/middleware");

const startServer = async () => {
  try {
    console.log("🚀 Démarrage du Chat-File Service...");

    // ===============================
    // 1. CRÉATION EXPRESS APP ET SERVEUR
    // ===============================
    const app = express();
    const server = createServer(app);

    // ===============================
    // 2. CONNEXIONS INFRASTRUCTURE
    // ===============================

    // MongoDB
    await connectDB();
    console.log("✅ MongoDB connecté");

    // Redis - Utilisation du bon fichier
    let redisClient = null;
    let redisStatus = "disconnected";
    let onlineUserManager = null;
    let roomManager = null;

    try {
      const redisConnected = await redisConfig.connect();
      if (redisConnected) {
        redisClient = redisConfig.getClient();
        redisStatus = "connected";

        // Initialiser les gestionnaires Redis
        onlineUserManager = new OnlineUserManager(redisClient);
        roomManager = new RoomManager(redisClient);

        console.log("✅ Redis connecté avec gestionnaires");
      }
    } catch (error) {
      console.log("⚠️ Redis non disponible, mode développement activé");
    }

    // Kafka - Configuration complète avec votre structure
    let kafkaProducers = null;
    let kafkaConsumers = null;
    let kafkaStatus = "disconnected";

    try {
      console.log("🔄 Tentative de connexion Kafka...");
      const kafkaConnected = await kafkaConfig.connect();

      if (kafkaConnected) {
        // Initialiser les producers
        kafkaProducers = {
          messageProducer: new MessageProducer(kafkaConfig.getProducer()),
          fileProducer: new FileProducer(kafkaConfig.getProducer()),
        };

        kafkaStatus = "connected";
        console.log("✅ Kafka connecté avec producers");

        // Lister les topics disponibles en mode dev
        if (process.env.NODE_ENV === "development") {
          await kafkaConfig.listTopics();
        }
      }
    } catch (error) {
      console.log("⚠️ Kafka non disponible, mode développement activé");
      console.log("🔍 Détail erreur Kafka:", error.message);
    }

    // ===============================
    // 3. CONFIGURATION EXPRESS
    // ===============================
    app.use(
      cors({
        origin: [
          "http://localhost:3000",
          "http://localhost:8000",
          "http://localhost:8001",
          "http://localhost:8002",
          "http://localhost:8003",
        ],
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      })
    );

    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Configuration Redis pour les middleware
    app.locals.redisClient = redisClient;
    app.locals.onlineUserManager = onlineUserManager;
    app.locals.roomManager = roomManager;

    // Middleware globaux - CORRECTION
    if (rateLimitMiddleware && rateLimitMiddleware.apiLimit) {
      app.use(rateLimitMiddleware.apiLimit);
    }

    // Servir les fichiers statiques
    app.use(express.static(path.join(__dirname, "../public")));
    app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

    // ===============================
    // 4. CONFIGURATION SOCKET.IO
    // ===============================
    const io = new Server(server, {
      cors: {
        origin: [
          "http://localhost:3000",
          "http://localhost:8000",
          "http://localhost:8001",
          "http://localhost:8002",
          "http://localhost:8003",
        ],
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
      allowEIO3: true,
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Redis adapter si disponible
    if (redisClient) {
      try {
        io.adapter(
          createAdapter(
            redisConfig.createPubClient(),
            redisConfig.createSubClient()
          )
        );
        console.log("✅ Redis adapter configuré");
      } catch (error) {
        console.warn("⚠️ Erreur configuration Redis adapter:", error.message);
      }
    }

    // ===============================
    // 5. CONFIGURATION KAFKA CONSUMER (APRÈS SOCKET.IO)
    // ===============================
    if (kafkaProducers) {
      try {
        // Initialiser le consumer de notifications avec Socket.IO
        kafkaConsumers = {
          notificationConsumer: new NotificationConsumer(
            kafkaConfig.getConsumer(),
            io
          ),
        };

        // Démarrer le consumer
        await kafkaConsumers.notificationConsumer.start();
        console.log("✅ Kafka consumer notifications démarré");
      } catch (error) {
        console.warn("⚠️ Erreur démarrage consumer Kafka:", error.message);
      }
    }

    // ===============================
    // 6. INITIALISATION REPOSITORIES
    // ===============================
    // ✅ S'ASSURER QUE LES REPOSITORIES SONT BIEN INITIALISÉS
    const messageRepository = new MongoMessageRepository(redisClient);
    const conversationRepository = new MongoConversationRepository(
      redisClient,
      kafkaProducers?.messageProducer || null // ✅ Passer le producer Kafka
    );
    const fileRepository = new MongoFileRepository(redisClient);

    // ===============================
    // 7. INITIALISATION USE CASES AVEC BONNES DÉPENDANCES
    // ===============================
    const sendMessageUseCase = new SendMessage(
      messageRepository,
      conversationRepository,
      kafkaProducers?.messageProducer || null,
      redisClient // ✅ AJOUTER
    );

    const getMessagesUseCase = new GetMessages(
      messageRepository,
      redisClient,
      kafkaProducers?.messageProducer || null // ✅ AJOUTER
    );

    const updateMessageStatusUseCase = new UpdateMessageStatus(
      messageRepository,
      conversationRepository,
      kafkaProducers?.messageProducer || null,
      redisClient // ✅ AJOUTER
    );

    const getConversationsUseCase = new GetConversations(
      conversationRepository, // ✅ Repository avec findByUserId
      messageRepository,
      redisClient
    );

    const getConversationUseCase = new GetConversation(
      conversationRepository,
      messageRepository,
      redisClient // ✅ AJOUTER
    );

    const uploadFileUseCase = new UploadFile(
      fileRepository,
      messageRepository,
      conversationRepository,
      kafkaProducers?.fileProducer || null,
      redisClient // ✅ AJOUTER
    );

    const getFileUseCase = new GetFile(
      fileRepository,
      kafkaProducers?.fileProducer || null,
      redisClient // ✅ AJOUTER
    );

    // ===============================
    // 8. INITIALISATION CONTRÔLEURS
    // ===============================
    const fileController = new FileController(
      uploadFileUseCase,
      getFileUseCase,
      redisClient,
      kafkaProducers?.fileProducer || null
    );

    const messageController = new MessageController(
      sendMessageUseCase,
      getMessagesUseCase,
      updateMessageStatusUseCase,
      redisClient,
      kafkaProducers?.messageProducer || null
    );

    const conversationController = new ConversationController(
      getConversationsUseCase,
      getConversationUseCase,
      redisClient,
      kafkaProducers?.messageProducer || null
    );

    const healthController = new HealthController(redisClient, kafkaConfig);

    // ✅ AJOUTER VALIDATION DES CONTRÔLEURS
    console.log("✅ Contrôleurs initialisés:", {
      fileController: !!fileController,
      messageController: !!messageController,
      conversationController: !!conversationController,
      healthController: !!healthController,
    });

    // Validation des méthodes critiques
    const validateController = (controller, name, requiredMethods) => {
      const missingMethods = requiredMethods.filter(
        (method) => typeof controller[method] !== "function"
      );

      if (missingMethods.length > 0) {
        console.error(`❌ ${name} méthodes manquantes:`, missingMethods);
        return false;
      }

      console.log(`✅ ${name} validé`);
      return true;
    };

    validateController(messageController, "MessageController", [
      "sendMessage",
      "getMessages",
      "getMessage",
      "updateMessageStatus",
      "deleteMessage",
      "addReaction",
    ]);

    validateController(conversationController, "ConversationController", [
      "getConversations",
      "getConversation",
      "createConversation",
    ]);

    // ✅ CORRIGER LES MÉTHODES ATTENDUES POUR FileController
    validateController(fileController, "FileController", [
      "uploadFile",
      "getFile",
      "getFiles",
      "deleteFile",
      "getFileMetadata",
      "getConversationFiles",
    ]);

    // ===============================
    // 9. CONFIGURATION ROUTES
    // ===============================
    app.use("/api/files", createFileRoutes(fileController));
    app.use("/api/messages", createMessageRoutes(messageController));
    app.use(
      "/api/conversations",
      createConversationRoutes(conversationController)
    );
    app.use("/api/health", createHealthRoutes(healthController));

    // ===============================
    // 10. CONFIGURATION WEBSOCKET AVEC CHATHANDLER
    // ===============================
    console.log("🔌 Configuration du gestionnaire WebSocket...");

    // ✅ CORRIGER : S'assurer que ChatHandler accepte tous les paramètres
    const chatHandler = new ChatHandler(
      io,
      sendMessageUseCase,
      kafkaProducers?.messageProducer || null, // ✅ MessageProducer avec publishMessage
      redisClient,
      onlineUserManager,
      roomManager
    );

    console.log("✅ ChatHandler configuré avec succès");

    // ✅ AJOUTER VALIDATION APRÈS INITIALISATION
    if (
      chatHandler &&
      typeof chatHandler.getConnectedUserCount === "function"
    ) {
      console.log("✅ ChatHandler méthodes validées");
    } else {
      console.warn("⚠️ ChatHandler peut avoir des méthodes manquantes");
    }

    // ===============================
    // 11. ROUTES DE SANTÉ AMÉLIORÉES
    // ===============================
    app.get("/health", async (req, res) => {
      try {
        // ✅ AJOUTER PROTECTION CONTRE LES ERREURS
        let redisHealthStatus = "Non connecté";
        let kafkaHealthStatus = "Non connecté";
        let connectedUsersCount = 0;
        let onlineUsersCount = 0;
        let activeRoomsCount = 0;

        // Health check Redis sécurisé
        if (redisClient) {
          try {
            redisHealthStatus = await redisConfig.getHealthStatus();
          } catch (error) {
            console.warn("⚠️ Erreur health check Redis:", error.message);
            redisHealthStatus = `Erreur: ${error.message}`;
          }
        }

        // Health check Kafka sécurisé
        if (kafkaProducers) {
          try {
            kafkaHealthStatus = await kafkaConfig.getHealthStatus();
          } catch (error) {
            console.warn("⚠️ Erreur health check Kafka:", error.message);
            kafkaHealthStatus = `Erreur: ${error.message}`;
          }
        }

        // Stats utilisateurs sécurisées
        try {
          connectedUsersCount = chatHandler
            ? chatHandler.getConnectedUserCount()
            : 0;
        } catch (error) {
          console.warn("⚠️ Erreur count users:", error.message);
        }

        try {
          onlineUsersCount = onlineUserManager
            ? await onlineUserManager.getOnlineUsersCount()
            : 0;
        } catch (error) {
          console.warn("⚠️ Erreur online users:", error.message);
        }

        try {
          activeRoomsCount = roomManager
            ? await roomManager.getRoomsCount()
            : 0;
        } catch (error) {
          console.warn("⚠️ Erreur rooms count:", error.message);
        }

        const health = {
          service: "CENADI Chat-File-Service",
          version: "1.0.0",
          status: "running",
          timestamp: new Date().toISOString(),
          serverId: process.env.SERVER_ID || "chat-file-1",
          services: {
            mongodb: "✅ Connecté",
            redis: {
              status: redisStatus,
              details: redisHealthStatus,
            },
            kafka: {
              status: kafkaStatus,
              details: kafkaHealthStatus,
              producers: kafkaProducers
                ? Object.keys(kafkaProducers).length
                : 0,
              consumers: kafkaConsumers
                ? Object.keys(kafkaConsumers).length
                : 0,
            },
            websocket: "✅ Actif",
          },
          endpoints: {
            files: "/api/files",
            messages: "/api/messages",
            conversations: "/api/conversations",
            health: "/api/health",
            stats: "/api/stats",
            interface: "/",
          },
          features: {
            chat: !!messageController,
            fileUpload: !!fileController,
            realTimeMessages: !!kafkaProducers,
            notifications: !!kafkaConsumers,
            caching: !!redisClient,
            userManagement: !!onlineUserManager,
            roomManagement: !!roomManager,
          },
          stats: {
            connectedUsers: connectedUsersCount,
            onlineUsers: onlineUsersCount,
            activeRooms: activeRoomsCount,
          },
        };
        res.json(health);
      } catch (error) {
        console.error("❌ Erreur health check:", error);
        res.status(500).json({
          service: "CENADI Chat-File-Service",
          status: "error",
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Route de statistiques Kafka/Redis
    app.get("/api/stats", async (req, res) => {
      try {
        // ✅ PROTECTION CONTRE LES ERREURS
        let websocketStats = { connectedUsers: 0, stats: {} };
        let redisStats = {
          isConnected: false,
          onlineUsers: 0,
          activeRooms: 0,
          usersList: [],
          roomsList: [],
        };
        let kafkaStats = {
          isConnected: false,
          status: kafkaStatus,
          producers: null,
          topics: [],
        };

        // Stats WebSocket sécurisées
        try {
          if (
            chatHandler &&
            typeof chatHandler.getConnectedUserCount === "function"
          ) {
            websocketStats = {
              connectedUsers: chatHandler.getConnectedUserCount(),
              stats:
                typeof chatHandler.getStats === "function"
                  ? chatHandler.getStats()
                  : {},
            };
          }
        } catch (error) {
          console.warn("⚠️ Erreur stats WebSocket:", error.message);
        }

        // Stats Redis sécurisées
        try {
          if (redisClient) {
            redisStats = {
              isConnected: true,
              onlineUsers: onlineUserManager
                ? await onlineUserManager.getOnlineUsersCount()
                : 0,
              activeRooms: roomManager ? await roomManager.getRoomsCount() : 0,
              usersList: onlineUserManager
                ? await onlineUserManager.getOnlineUsers()
                : [],
              roomsList: roomManager ? await roomManager.getRooms() : [],
            };
          }
        } catch (error) {
          console.warn("⚠️ Erreur stats Redis:", error.message);
          redisStats.error = error.message;
        }

        // Stats Kafka sécurisées
        try {
          if (
            kafkaConfig &&
            typeof kafkaConfig.isKafkaConnected === "function"
          ) {
            kafkaStats = {
              isConnected: kafkaConfig.isKafkaConnected(),
              status: kafkaStatus,
              producers: kafkaProducers
                ? {
                    messageProducer:
                      await kafkaProducers.messageProducer.healthCheck(),
                  }
                : null,
              topics: kafkaConfig.isKafkaConnected()
                ? await kafkaConfig.listTopics()
                : [],
            };
          }
        } catch (error) {
          console.warn("⚠️ Erreur stats Kafka:", error.message);
          kafkaStats.error = error.message;
        }

        const stats = {
          timestamp: new Date().toISOString(),
          websocket: websocketStats,
          redis: redisStats,
          kafka: kafkaStats,
        };
        res.json(stats);
      } catch (error) {
        console.error("❌ Erreur stats:", error);
        res.status(500).json({
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Route de test Kafka
    app.post("/api/test/kafka", async (req, res) => {
      try {
        if (!kafkaProducers || !kafkaProducers.messageProducer) {
          return res.status(503).json({
            success: false,
            message: "Kafka non disponible",
            details: "MessageProducer non initialisé",
          });
        }

        // ✅ VÉRIFIER QUE LA MÉTHODE EXISTE
        if (
          typeof kafkaProducers.messageProducer.publishSimpleMessage !==
          "function"
        ) {
          return res.status(503).json({
            success: false,
            message: "Méthode publishSimpleMessage non disponible",
            availableMethods: Object.getOwnPropertyNames(
              kafkaProducers.messageProducer
            ).filter(
              (prop) =>
                typeof kafkaProducers.messageProducer[prop] === "function"
            ),
          });
        }

        const testMessage = {
          eventType: "TEST_MESSAGE",
          content: "Message de test depuis l'API",
          userId: "test-user",
        };

        const result =
          await kafkaProducers.messageProducer.publishSimpleMessage(
            "TEST_MESSAGE",
            testMessage
          );

        res.json({
          success: result,
          message: "Message de test envoyé",
          data: testMessage,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("❌ Erreur test Kafka:", error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Route principale
    app.get("/", (req, res) => {
      res.json({
        service: "CENADI Chat-File-Service",
        version: "1.0.0",
        status: "running",
        timestamp: new Date().toISOString(),
        endpoints: {
          files: "/api/files",
          messages: "/api/messages",
          conversations: "/api/conversations",
          health: "/api/health",
          stats: "/api/stats",
          kafkaTest: "/api/test/kafka",
        },
        features: {
          chat: "✅ Chat en temps réel",
          files: "✅ Upload/Download fichiers",
          websocket: "✅ WebSocket activé",
          redis: redisClient ? "✅ Redis activé" : "⚠️ Mode mémoire locale",
          kafka: kafkaProducers ? "✅ Kafka activé" : "⚠️ Mode développement",
          notifications: kafkaConsumers
            ? "✅ Notifications temps réel"
            : "⚠️ Non disponible",
          userManagement: onlineUserManager
            ? "✅ Gestion utilisateurs"
            : "⚠️ Non disponible",
          roomManagement: roomManager
            ? "✅ Gestion salons"
            : "⚠️ Non disponible",
        },
      });
    });

    // ===============================
    // 12. GESTION D'ERREURS
    // ===============================
    app.use((error, req, res, next) => {
      console.error("❌ Erreur serveur:", error);
      if (res.headersSent) {
        return next(error);
      }
      res.status(error.status || 500).json({
        success: false,
        message: error.message || "Erreur interne du serveur",
        error: process.env.NODE_ENV === "development" ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
    });

    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: "Endpoint non trouvé",
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
      });
    });

    // ===============================
    // 13. TÂCHES DE MAINTENANCE
    // ===============================

    // Maintenance Redis
    if (onlineUserManager && roomManager) {
      setInterval(async () => {
        try {
          console.log("🧹 Nettoyage périodique Redis...");
          const cleanedUsers = await onlineUserManager.cleanupInactiveUsers();
          const cleanedRooms = await roomManager.cleanupInactiveRooms();

          if (cleanedUsers > 0 || cleanedRooms > 0) {
            console.log(
              `🧹 Nettoyage terminé: ${cleanedUsers} utilisateurs, ${cleanedRooms} salons`
            );
          }
        } catch (error) {
          console.error("❌ Erreur nettoyage Redis:", error);
        }
      }, 30 * 60 * 1000); // 30 minutes
    }

    // Health check Kafka périodique
    if (kafkaProducers && kafkaProducers.messageProducer) {
      setInterval(async () => {
        try {
          if (
            typeof kafkaProducers.messageProducer.healthCheck === "function"
          ) {
            const healthStatus =
              await kafkaProducers.messageProducer.healthCheck();

            // ✅ LOGGER SEULEMENT LES PROBLÈMES
            if (
              healthStatus.status === "error" ||
              healthStatus.status === "degraded"
            ) {
              console.warn(
                "⚠️ Problème détecté avec Kafka:",
                healthStatus.message
              );
            } else if (process.env.NODE_ENV === "development") {
              console.log(`💚 Kafka health check: ${healthStatus.status}`);
            }
          }
        } catch (error) {
          console.warn("⚠️ Erreur health check Kafka:", error.message);
        }
      }, 15 * 60 * 1000); // ✅ PASSER DE 5 À 15 MINUTES
    }

    // ===============================
    // 14. DÉMARRAGE SERVEUR
    // ===============================
    const PORT = process.env.CHAT_FILE_SERVICE_PORT || 8003;
    server.listen(PORT, () => {
      console.log(`🚀 Chat-File Service démarré sur le port ${PORT}`);
      console.log(`🌍 Serveur ID: ${process.env.SERVER_ID || "chat-file-1"}`);

      console.log("📋 Fonctionnalités disponibles:");
      console.log("   💬 Chat en temps réel");
      console.log("   📁 Upload/Download de fichiers");
      console.log("   🖼️ Traitement d'images");
      console.log("   📱 Interface web");
      console.log("   👥 Gestion utilisateurs en ligne");
      console.log("   🏠 Gestion des salons");
      console.log("   🔔 Notifications temps réel");
      console.log("   📊 Monitoring Kafka/Redis");

      console.log("\n📊 Statut des services:");
      console.log(`   MongoDB: ✅ Connecté`);
      console.log(
        `   Redis:   ${redisClient ? "✅ Connecté" : "⚠️ Mode mémoire locale"}`
      );
      console.log(
        `   Kafka:   ${
          kafkaProducers ? "✅ Connecté" : "⚠️ Mode développement"
        }`
      );
      console.log(
        `   UserMgr: ${onlineUserManager ? "✅ Actif" : "⚠️ Désactivé"}`
      );
      console.log(`   RoomMgr: ${roomManager ? "✅ Actif" : "⚠️ Désactivé"}`);
      console.log(
        `   NotifCon: ${kafkaConsumers ? "✅ Actif" : "⚠️ Désactivé"}`
      );

      console.log("\n" + "=".repeat(70));
      console.log("🎯 LIENS RAPIDES - CHAT-FILE-SERVICE");
      console.log("=".repeat(70));
      console.log(`🌐 Interface Web     : http://localhost:${PORT}/`);
      console.log(`📁 API Fichiers     : http://localhost:${PORT}/api/files`);
      console.log(
        `💬 API Messages     : http://localhost:${PORT}/api/messages`
      );
      console.log(
        `🗣️ API Conversations: http://localhost:${PORT}/api/conversations`
      );
      console.log(`📊 Statistiques     : http://localhost:${PORT}/api/stats`);
      console.log(
        `🧪 Test Kafka       : POST http://localhost:${PORT}/api/test/kafka`
      );
      console.log(`🔌 WebSocket        : ws://localhost:${PORT}`);
      console.log(`❤️ Health Check     : http://localhost:${PORT}/health`);
      console.log("=".repeat(70) + "\n");
    });
  } catch (error) {
    console.error("❌ Erreur au démarrage:", error);
    process.exit(1);
  }
};

// ===============================
// GESTION FERMETURE PROPRE
// ===============================
process.on("SIGINT", async () => {
  console.log("\n🛑 Arrêt du serveur...");
  try {
    // Fermer les producers Kafka
    if (kafkaProducers) {
      await Promise.all([
        kafkaProducers.messageProducer.close(),
        kafkaProducers.fileProducer && kafkaProducers.fileProducer.close(),
      ]);
    }

    // Fermer les connexions
    if (redisConfig && redisConfig.disconnect) {
      await redisConfig.disconnect();
    }
    if (kafkaConfig && kafkaConfig.disconnect) {
      await kafkaConfig.disconnect();
    }
    console.log("✅ Services déconnectés proprement");
  } catch (error) {
    console.error("❌ Erreur lors de l'arrêt:", error);
  }
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Exception non gérée:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Promesse rejetée non gérée:", reason);
  process.exit(1);
});

if (require.main === module) {
  startServer();
} else {
  module.exports = { startServer };
}
