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
const redisConfig = require("./infrastructure/redis/redisConfig");
const kafkaConfig = require("./infrastructure/kafka/config/kafkaConfig");

const ThumbnailService = require("./infrastructure/services/ThumbnailService");
const FileStorageService = require("./infrastructure/services/FileStorageService");

// Gestionnaires Redis optionnels
const OnlineUserManager = require("./infrastructure/redis/OnlineUserManager");
const RoomManager = require("./infrastructure/redis/RoomManager");

// Use Cases
const SendMessage = require("./application/use-cases/SendMessage");
const GetMessages = require("./application/use-cases/GetMessages");
const GetConversation = require("./application/use-cases/GetConversation");
const GetConversations = require("./application/use-cases/GetConversations");
const GetFile = require("./application/use-cases/GetFile");
const UpdateMessageStatus = require("./application/use-cases/UpdateMessageStatus");
const UploadFile = require("./application/use-cases/UploadFile");
const GetConversationIds = require("./application/use-cases/GetConversationIds");
const GetMessageById = require("./application/use-cases/GetMessageById");
const UpdateMessageContent = require("./application/use-cases/UpdateMessageContent");
const DownloadFile = require("./application/use-cases/DownloadFile");
const CreateGroup = require("./application/use-cases/CreateGroup");
const CreateBroadcast = require("./application/use-cases/CreateBroadcast");

// Controllers
const FileController = require("./application/controllers/FileController");
const MessageController = require("./application/controllers/MessageController");
const ConversationController = require("./application/controllers/ConversationController");
const HealthController = require("./application/controllers/HealthController");

// Repositories
const MongoMessageRepository = require("./infrastructure/repositories/MongoMessageRepository");
const MongoConversationRepository = require("./infrastructure/repositories/MongoConversationRepository");
const MongoFileRepository = require("./infrastructure/repositories/MongoFileRepository");

// Routes
const createConversationRoutes = require("./interfaces/http/routes/conversationRoutes");
const createMessageRoutes = require("./interfaces/http/routes/messageRoutes");
const createFileRoutes = require("./interfaces/http/routes/fileRoutes");
const createHealthRoutes = require("./interfaces/http/routes/healthRoutes");
const createGroupRoutes = require("./interfaces/http/routes/groupRoutes");
const createBroadcastRoutes = require("./interfaces/http/routes/broadcastRoutes");

// Kafka Producers - Utilisation des vrais fichiers
const MessageProducer = require("./infrastructure/kafka/producers/MessageProducer");
const FileProducer = require("./infrastructure/kafka/producers/FileProducer");

// Kafka Consumer
const NotificationConsumer = require("./infrastructure/kafka/consumers/NotificationConsumer");

// WebSocket Handler
const ChatHandler = require("./application/websocket/chatHandler");

// Middleware - CORRECTION
const { rateLimitMiddleware } = require("./interfaces/http/middleware");

// ✅ DÉCLARATION DES VARIABLES GLOBALES AU BON ENDROIT
let kafka = null;
let kafkaProducers = null;
let kafkaConsumer = null;
let kafkaConsumers = null; // ✅ AJOUTER CETTE VARIABLE GLOBALE
let kafkaStatus = "disconnected";

const initializeKafka = async () => {
  try {
    console.log("🔧 Initialisation Kafka...");

    const {
      createKafkaInstance,
      createProducer,
      createConsumer,
    } = require("./infrastructure/kafka/config/kafkaConfig");

    // ✅ CRÉER L'INSTANCE KAFKA
    kafka = createKafkaInstance();

    // ✅ CRÉER ET CONNECTER LES PRODUCERS
    const producer = createProducer(kafka);
    await producer.connect();

    kafkaProducers = {
      messageProducer: new MessageProducer(producer),
      fileProducer: new FileProducer(producer),
    };

    // ✅ CRÉER UN SEUL CONSUMER AVEC ID UNIQUE
    const uniqueTopics = ["chat.notifications"]; // ✅ ÉVITER LES DOUBLONS
    const consumer = createConsumer(kafka, uniqueTopics);
    kafkaConsumer = new NotificationConsumer(consumer);

    // ✅ ÉVITER LA DUPLICATION
    kafkaConsumers = {
      notificationConsumer: kafkaConsumer,
    };

    console.log("✅ Kafka initialisé avec succès");
    kafkaStatus = "connected";
    return true;
  } catch (error) {
    console.error("❌ Erreur initialisation Kafka:", error);
    console.warn("⚠️ L'application continuera sans Kafka");
    kafkaStatus = "error";
    return false;
  }
};

// ✅ SUPPRIMER LA DOUBLE INITIALISATION DANS startServer
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

    // Redis
    let redisClient = null;
    let redisStatus = "disconnected";
    let onlineUserManager = null;
    let roomManager = null;

    try {
      const redisConnected = await redisConfig.connect();
      if (redisConnected) {
        redisClient = redisConfig.getClient();
        redisStatus = "connected";

        onlineUserManager = new OnlineUserManager(redisClient);
        roomManager = new RoomManager(redisClient);

        console.log("✅ Redis connecté avec gestionnaires");
      }
    } catch (error) {
      console.log("⚠️ Redis non disponible, mode développement activé");
    }

    // ✅ INITIALISER KAFKA UNE SEULE FOIS
    const kafkaInitialized = await initializeKafka();

    // ===============================
    // 3. CONFIGURATION EXPRESS
    // ===============================
    app.use(
      cors({
        origin: ["*"],
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      })
    );

    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    app.locals.redisClient = redisClient;
    app.locals.onlineUserManager = onlineUserManager;
    app.locals.roomManager = roomManager;

    if (rateLimitMiddleware && rateLimitMiddleware.apiLimit) {
      app.use(rateLimitMiddleware.apiLimit);
    }

    app.use(express.static(path.join(__dirname, "../public")));

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
    // 5. DÉMARRER LE CONSUMER UNE SEULE FOIS
    // ===============================
    if (kafkaConsumer && kafkaInitialized) {
      try {
        console.log("🚀 Démarrage NotificationConsumer unique...");

        // ✅ ATTENDRE UN PEU POUR ÉVITER LES CONFLITS DE DÉMARRAGE
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const started = await kafkaConsumer.start();
        if (started) {
          console.log("✅ Kafka consumer notifications démarré");
        } else {
          console.warn("⚠️ Échec démarrage consumer Kafka");
        }
      } catch (error) {
        console.warn("⚠️ Erreur démarrage consumer Kafka:", error.message);
      }
    }

    // ===============================
    // 5.5 INITIALISATION SERVICES FICHIERS
    // ===============================

    // ✅ INITIALISER LE SERVICE DE STOCKAGE DE FICHIERS
    const fileStorageService = new FileStorageService({
      env: process.env.NODE_ENV || "development",
      s3Endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
      s3AccessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
      s3SecretAccessKey: process.env.S3_SECRET_KEY || "minioadmin",
      s3Bucket: process.env.S3_BUCKET || "chat-files",
      sftpConfig: {
        host: process.env.SFTP_HOST,
        port: process.env.SFTP_PORT || 22,
        username: process.env.SFTP_USER,
        password: process.env.SFTP_PASS,
        remotePath: process.env.SFTP_REMOTE_PATH || "/uploads",
      },
    });

    // ✅ INITIALISER LE SERVICE DE THUMBNAILS
    const thumbnailService = new ThumbnailService(fileStorageService);

    console.log("✅ Services de fichiers initialisés");

    // ===============================
    // 6. INITIALISATION REPOSITORIES
    // ===============================
    // ✅ CORRIGER L'INJECTION DES SERVICES
    const CacheService = require("./infrastructure/redis/CacheService");
    const cacheService = new CacheService(redisClient, 3600);

    const messageRepository = new MongoMessageRepository(
      cacheService,
      kafkaProducers?.messageProducer || null
    );
    const conversationRepository = new MongoConversationRepository(
      cacheService,
      kafkaProducers?.messageProducer || null
    );
    const fileRepository = new MongoFileRepository(
      redisClient,
      kafkaProducers?.fileProducer || null,
      thumbnailService,
      cacheService // Ajouté
    );

    // ✅ LOG POUR VÉRIFIER LES OBJETS REDIS
    if (redisClient) {
      console.log("🔍 Redis client methods:", {
        hasGet: typeof redisClient.get === "function",
        hasSet: typeof redisClient.set === "function",
        hasSetex: typeof redisClient.setex === "function",
        hasExpire: typeof redisClient.expire === "function",
        hasDel: typeof redisClient.del === "function",
      });
    } else {
      console.warn("⚠️ Redis client is null/undefined");
    }

    // ===============================
    // 7. INITIALISATION USE CASES
    // ===============================
    const sendMessageUseCase = new SendMessage(
      messageRepository,
      conversationRepository,
      kafkaProducers?.messageProducer || null,
      cacheService
    );

    const getMessagesUseCase = new GetMessages(messageRepository, cacheService);

    const getConversationUseCase = new GetConversation(
      conversationRepository,
      messageRepository,
      cacheService
    );

    const getConversationsUseCase = new GetConversations(
      conversationRepository,
      messageRepository,
      cacheService
    );

    const updateMessageStatusUseCase = new UpdateMessageStatus(
      messageRepository,
      conversationRepository,
      kafkaProducers?.messageProducer || null,
      cacheService
    );

    const updateMessageContentUseCase = new UpdateMessageContent(
      messageRepository,
      kafkaProducers?.messageProducer || null,
      cacheService
    );

    const uploadFileUseCase = new UploadFile(
      fileRepository,
      kafkaProducers?.fileProducer || null
    );

    const getFileUseCase = new GetFile(fileRepository, cacheService);

    const getConversationIdsUseCase = new GetConversationIds(
      conversationRepository
    );

    const getMessageByIdUseCase = new GetMessageById(messageRepository);

    const downloadFileUseCase = new DownloadFile(
      fileRepository,
      fileStorageService,
      cacheService
    );

    const createGroupUseCase = new CreateGroup(
      conversationRepository,
      kafkaProducers?.messageProducer || null
    );
    const createBroadcastUseCase = new CreateBroadcast(
      conversationRepository,
      kafkaProducers?.messageProducer || null
    );

    // ===============================
    // 8. INITIALISATION CONTROLLERS
    // ===============================
    const fileController = new FileController(
      uploadFileUseCase,
      getFileUseCase,
      redisClient,
      kafkaProducers?.fileProducer || null,
      fileStorageService,
      downloadFileUseCase // <-- AJOUTE CET ARGUMENT
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

    // ===============================
    // 9. CONFIGURATION ROUTES HTTP
    // ===============================

    // ✅ IMPORT ET CONFIGURATION DES ROUTES CONVERSATIONS
    const createConversationRoutes = require("./interfaces/http/routes/conversationRoutes");

    app.use("/files", createFileRoutes(fileController));
    app.use("/messages", createMessageRoutes(messageController));
    // ✅ AJOUTER LA ROUTE CONVERSATIONS
    app.use("/conversations", createConversationRoutes(conversationController));
    app.use("/health", createHealthRoutes(healthController));
    app.use("/groups", createGroupRoutes(createGroupUseCase));
    app.use("/broadcasts", createBroadcastRoutes(createBroadcastUseCase));

    // ===============================
    // 10. CONFIGURATION WEBSOCKET
    // ===============================
    console.log("🔌 Configuration du gestionnaire WebSocket...");

    // ✅ CRÉER LE CHATHANDLER AVEC TOUS LES PARAMÈTRES
    const chatHandler = new ChatHandler(
      io,
      sendMessageUseCase,
      getMessagesUseCase,
      updateMessageStatusUseCase,
      kafkaProducers?.messageProducer || null,
      redisClient,
      onlineUserManager,
      roomManager,
      getConversationIdsUseCase,
      getConversationUseCase,
      getConversationsUseCase,
      getMessageByIdUseCase,
      updateMessageContentUseCase,
      createGroupUseCase,
      createBroadcastUseCase
    );

    // Gestionnaire d'utilisateurs Kafka
    const UserConsumerManager = require("./infrastructure/kafka/consumers/UserConsumerManager");

    const userConsumerManager = new UserConsumerManager(kafka);

    // Injecter le manager
    chatHandler.userConsumerManager = userConsumerManager;

    // ✅ CONFIGURER LES GESTIONNAIRES D'ÉVÉNEMENTS SOCKET.IO
    chatHandler.setupSocketHandlers();

    console.log("✅ ChatHandler configuré avec succès");

    // ===============================
    // 10. ROUTES PERSONNALISÉES
    // ===============================

    // Route de health check détaillée
    app.get("/health", async (req, res) => {
      try {
        const redisStatus = redisClient ? "✅ Connecté" : "⚠️ Déconnecté";
        const kafkaStatus = kafkaProducers ? "✅ Connecté" : "⚠️ Déconnecté";

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
            files: "/files",
            messages: "/messages",
            conversations: "/conversations",
            health: "/health",
            stats: "/stats",
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
    app.get("/stats", async (req, res) => {
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
    app.get("/test/kafka", async (req, res) => {
      try {
        if (!kafkaProducers || !kafkaProducers.messageProducer) {
          return res.status(503).json({
            success: false,
            message: "Kafka non disponible",
            details: "MessageProducer non initialisé",
            status: kafkaStatus,
            availableEndpoints: {
              healthCheck: "GET /health",
              stats: "GET /stats",
              testKafkaPost: "POST /test/kafka (pour envoyer un message)",
            },
          });
        }

        // ✅ HEALTH CHECK KAFKA POUR GET
        const healthStatus = await kafkaProducers.messageProducer.healthCheck(
          true
        );

        res.json({
          success: true,
          message: "Status Kafka récupéré",
          kafka: {
            status: kafkaStatus,
            health: healthStatus,
            producer: {
              isConnected: kafkaProducers.messageProducer.isConnected,
              isEnabled: kafkaProducers.messageProducer.isEnabled,
            },
            topics: kafkaConfig.isKafkaConnected
              ? await kafkaConfig.listTopics()
              : [],
          },
          usage: {
            testMessage: "POST /test/kafka avec body JSON",
            healthCheck: "GET /test/kafka (cette route)",
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("❌ Erreur GET test Kafka:", error);
        res.status(500).json({
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // ✅ ROUTE POST POUR ENVOYER UN MESSAGE DE TEST
    app.post("/test/kafka", async (req, res) => {
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
          typeof kafkaProducers.messageProducer.publishMessage !== "function"
        ) {
          return res.status(503).json({
            success: false,
            message: "Méthode publishMessage non disponible",
            availableMethods: Object.getOwnPropertyNames(
              kafkaProducers.messageProducer
            ).filter(
              (prop) =>
                typeof kafkaProducers.messageProducer[prop] === "function"
            ),
          });
        }

        // ✅ UTILISER LES DONNÉES DU BODY OU VALEURS PAR DÉFAUT
        const {
          eventType = "TEST_MESSAGE",
          content = "Message de test depuis l'API",
          userId = "test-user",
          ...additionalData
        } = req.body || {};

        const testMessage = {
          eventType,
          content,
          userId,
          timestamp: new Date().toISOString(),
          source: "API_TEST",
          ...additionalData,
        };

        // ✅ UTILISER publishMessage AU LIEU DE publishSimpleMessage
        const result = await kafkaProducers.messageProducer.publishMessage(
          testMessage
        );

        res.json({
          success: result,
          message: result
            ? "Message de test envoyé avec succès"
            : "Échec envoi message",
          data: testMessage,
          kafka: {
            status: kafkaStatus,
            topicUsed: kafkaProducers.messageProducer.topicName,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("❌ Erreur POST test Kafka:", error);
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
          files: "/files",
          messages: "/messages",
          conversations: "/conversations",
          health: "/health",
          stats: "/stats",
          kafkaTest: "/test/kafka",
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
              console.log(
                `💚 Kafka health: ${healthStatus.status} (connected: ${healthStatus.connected})`
              );
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
        `   NotifCon: ${kafkaConsumers ? "✅ Actif" : "⚠️ Désactivé"}` // ✅ UTILISER kafkaConsumers QUI EST MAINTENANT DÉFINI
      );

      console.log("\n" + "=".repeat(70));
      console.log("🎯 LIENS RAPIDES - CHAT-FILE-SERVICE");
      console.log("=".repeat(70));
      console.log(`🌐 Interface Web     : http://localhost:${PORT}/`);
      console.log(`📁 API Fichiers     : http://localhost:${PORT}/files`);
      console.log(`💬 API Messages     : http://localhost:${PORT}/messages`);
      console.log(
        `🗣️ API Conversations: http://localhost:${PORT}/conversations`
      );
      console.log(`📊 Statistiques     : http://localhost:${PORT}/stats`);
      console.log(
        `🧪 Test Kafka       : POST http://localhost:${PORT}/test/kafka`
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
const gracefulShutdown = async (signal) => {
  console.log(`🛑 Signal ${signal} reçu. Arrêt en cours...`);

  try {
    // Arrêter Kafka
    if (kafkaConsumer) {
      console.log("🔌 Arrêt du consumer Kafka...");
      await kafkaConsumer.stop();
    }

    if (kafkaProducers?.messageProducer) {
      console.log("🔌 Arrêt du producer Kafka...");
      await kafkaProducers.messageProducer.close();
    }

    // Fermer Redis
    if (redisConfig && redisConfig.disconnect) {
      console.log("🔌 Fermeture Redis...");
      await redisConfig.disconnect();
    }

    console.log("✅ Arrêt propre terminé");
    process.exit(0);
  } catch (error) {
    console.error("❌ Erreur lors de l'arrêt:", error);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

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
