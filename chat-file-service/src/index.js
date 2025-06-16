const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const cors = require("cors");
const chalk = require("chalk");
const path = require("path");
require("dotenv").config();

// Infrastructure
const connectDB = require("./infrastructure/mongodb/connection");
const redisConfig = require("./infrastructure/redis/redisConfig");
const kafkaConfig = require("./infrastructure/kafka/config/kafkaConfig");

// Kafka Producers
const MessageProducer = require("./infrastructure/kafka/producers/MessageProducer");
const FileProducer = require("./infrastructure/kafka/producers/FileProducer");

// Kafka Consumers
const NotificationConsumer = require("./infrastructure/kafka/consumers/NotificationConsumer");

// Repositories
const MongoMessageRepository = require("./infrastructure/repositories/MongoMessageRepository");
const MongoConversationRepository = require("./infrastructure/repositories/MongoConversationRepository");
const MongoFileRepository = require("./infrastructure/repositories/MongoFileRepository");

// Use Cases
const SendMessage = require("./application/use-cases/SendMessage");
const GetMessages = require("./application/use-cases/GetMessages");
const GetConversation = require("./application/use-cases/GetConversation");
const GetConversations = require("./application/use-cases/GetConversations");
const UpdateMessageStatus = require("./application/use-cases/UpdateMessageStatus");
const UploadFile = require("./application/use-cases/UploadFile");
const GetFile = require("./application/use-cases/GetFile");

// Controllers
const FileController = require("./application/controllers/FileController");

// Routes
const createMessageRoutes = require("./interfaces/http/routes/messageRoutes");
const createFileRoutes = require("./interfaces/http/routes/fileRoutes");

// WebSocket Handler
const chatHandler = require("./application/websocket/chatHandler");

const app = express();
const server = createServer(app);

const startServer = async () => {
  try {
    // Connexion à MongoDB
    await connectDB();
    console.log(chalk.green("✅ MongoDB connecté"));

    // Tentative de connexion à Redis avec retry
    let redisClient = null;
    let redisStatus = "disconnected";
    try {
      const redisConnected = await redisConfig.connect();
      if (redisConnected) {
        redisClient = redisConfig.getClient();
        redisStatus = "connected";
        console.log(chalk.green("✅ Redis connecté"));
      }
    } catch (error) {
      console.log(
        chalk.yellow("⚠️ Redis non disponible, mode développement activé")
      );
    }

    // Tentative de connexion à Kafka avec retry
    let kafkaProducers = null;
    let kafkaConsumers = null;
    let kafkaStatus = "disconnected";
    try {
      const kafkaConnected = await kafkaConfig.connect();
      if (kafkaConnected) {
        kafkaProducers = {
          messageProducer: new MessageProducer(kafkaConfig.getProducer()),
          fileProducer: new FileProducer(kafkaConfig.getProducer()),
        };
        kafkaStatus = "connected";
        console.log(chalk.green("✅ Kafka connecté"));
      }
    } catch (error) {
      console.log(
        chalk.yellow("⚠️ Kafka non disponible, mode développement activé")
      );
    }

    // Configuration Socket.IO avec adapter conditionnel
    const io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL,
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
      allowEIO3: true,
    });

    // Utiliser Redis adapter si disponible
    if (redisClient) {
      try {
        io.adapter(
          createAdapter(redisConfig.getPubClient(), redisConfig.getSubClient())
        );
        console.log(chalk.green("✅ Redis adapter configuré"));
      } catch (error) {
        console.warn(
          chalk.yellow("⚠️ Erreur configuration Redis adapter:", error.message)
        );
      }
    }

    // Démarrer les consumers Kafka si disponible
    if (kafkaProducers) {
      try {
        kafkaConsumers = {
          notificationConsumer: new NotificationConsumer(
            kafkaConfig.getConsumer(),
            io
          ),
        };

        // Démarrer les consumers
        await kafkaConsumers.notificationConsumer.start();
        console.log(chalk.green("✅ Kafka consumers démarrés"));
      } catch (error) {
        console.warn(
          chalk.yellow("⚠️ Erreur démarrage consumers:", error.message)
        );
      }
    }

    // Middleware Express
    app.use(cors());
    app.use(express.json());

    // Servir les fichiers statiques
    app.use(express.static(path.join(__dirname, "../public")));
    app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

    // Initialiser les repositories
    const messageRepository = new MongoMessageRepository();
    const conversationRepository = new MongoConversationRepository();
    const fileRepository = new MongoFileRepository();

    // Initialiser les use cases avec gestion null-safe
    const sendMessageUseCase = new SendMessage(
      messageRepository,
      conversationRepository,
      kafkaProducers?.messageProducer || null
    );
    const getMessagesUseCase = new GetMessages(messageRepository);
    const getConversationUseCase = new GetConversation(
      conversationRepository,
      messageRepository
    );
    const getConversationsUseCase = new GetConversations(
      conversationRepository,
      messageRepository
    );
    const updateMessageStatusUseCase = new UpdateMessageStatus(
      messageRepository,
      conversationRepository,
      kafkaProducers?.messageProducer || null
    );
    const uploadFileUseCase = new UploadFile(
      fileRepository,
      messageRepository,
      conversationRepository,
      kafkaProducers?.fileProducer || null
    );
    const getFileUseCase = new GetFile(
      fileRepository,
      kafkaProducers?.fileProducer || null
    );

    // Initialiser les contrôleurs
    const fileController = new FileController(
      uploadFileUseCase,
      getFileUseCase
    );

    // Configuration des routes HTTP
    app.use(
      "/api/messages",
      createMessageRoutes(sendMessageUseCase, getMessagesUseCase)
    );
    app.use("/api/files", createFileRoutes(fileController));

    // Route de health check détaillée
    app.get("/health", async (req, res) => {
      const health = {
        service: "CENADI Chat-File-Service",
        version: "1.0.0",
        status: "running",
        timestamp: new Date().toISOString(),
        services: {
          mongodb: "✅ Connecté",
          redis: {
            status: redisStatus,
            details: redisClient
              ? await redisConfig.getHealthStatus()
              : "Non connecté",
          },
          kafka: {
            status: kafkaStatus,
            details: kafkaProducers
              ? await kafkaConfig.getHealthStatus()
              : "Non connecté",
          },
        },
        endpoints: {
          files: "/api/files",
          messages: "/api/messages",
          interface: "/index.html",
          health: "/health",
        },
      };
      res.json(health);
    });

    // Route d'information principale
    app.get("/", (req, res) => {
      res.json({
        service: "CENADI Chat-File-Service",
        version: "1.0.0",
        status: "running",
        timestamp: new Date().toISOString(),
        endpoints: {
          files: "/api/files",
          messages: "/api/messages",
          interface: "/index.html",
          health: "/health",
        },
        features: {
          chat: "✅ Chat en temps réel",
          files: "✅ Upload/Download fichiers",
          images: "✅ Traitement d'images",
          websocket: "✅ WebSocket activé",
          redis: redisClient ? "✅ Redis activé" : "⚠️ Mode mémoire locale",
          kafka: kafkaProducers ? "✅ Kafka activé" : "⚠️ Mode développement",
        },
      });
    });

    // Configurer le gestionnaire WebSocket avec Kafka
    chatHandler(
      io,
      redisClient,
      sendMessageUseCase,
      getConversationUseCase,
      getConversationsUseCase,
      getMessagesUseCase,
      updateMessageStatusUseCase,
      kafkaProducers // Ajouter les producers Kafka
    );

    const PORT = process.env.CHAT_FILE_SERVICE_PORT || 8003;
    server.listen(PORT, () => {
      console.log(
        chalk.blue(`🚀 Chat-File Service démarré sur le port ${PORT}`)
      );
      console.log(
        chalk.yellow(`🌍 Serveur ID: ${process.env.SERVER_ID || "chat-file-1"}`)
      );

      console.log(chalk.cyan("📋 Fonctionnalités disponibles:"));
      console.log(chalk.green("   💬 Chat en temps réel"));
      console.log(chalk.green("   📁 Upload/Download de fichiers"));
      console.log(chalk.green("   🖼️ Traitement d'images"));
      console.log(chalk.green("   📱 Interface web"));

      // Afficher le statut des services
      console.log(chalk.cyan("\n📊 Statut des services:"));
      console.log(chalk.white(`   MongoDB: ✅ Connecté`));
      console.log(
        chalk.white(
          `   Redis:   ${
            redisClient ? "✅ Connecté" : "⚠️ Mode mémoire locale"
          }`
        )
      );
      console.log(
        chalk.white(
          `   Kafka:   ${
            kafkaProducers ? "✅ Connecté" : "⚠️ Mode développement"
          }`
        )
      );

      if (!redisClient) {
        console.log(chalk.yellow("\n💡 Pour activer Redis:"));
        console.log(chalk.yellow("   sudo systemctl start redis-server"));
      }

      if (!kafkaProducers) {
        console.log(chalk.yellow("\n💡 Pour activer Kafka:"));
        console.log(chalk.yellow("   ./start-kafka-dev.sh"));
      }

      // Afficher les liens utiles
      console.log(chalk.cyan("\n" + "=".repeat(60)));
      console.log(chalk.cyan("🎯 LIENS RAPIDES - CHAT-FILE-SERVICE"));
      console.log(chalk.cyan("=".repeat(60)));
      console.log(
        chalk.white(`🌐 Interface Web     : http://localhost:${PORT}/`)
      );
      console.log(
        chalk.white(`📁 API Fichiers     : http://localhost:${PORT}/api/files`)
      );
      console.log(
        chalk.white(
          `💬 API Messages     : http://localhost:${PORT}/api/messages`
        )
      );
      console.log(chalk.white(`🔌 WebSocket        : ws://localhost:${PORT}`));
      console.log(
        chalk.white(`❤️ Health Check     : http://localhost:${PORT}/health`)
      );
      console.log(chalk.cyan("=".repeat(60) + "\n"));
    });
  } catch (error) {
    console.error(chalk.red("❌ Erreur au démarrage:"), error);
    process.exit(1);
  }
};

// Gestion propre de l'arrêt avec monitoring
process.on("SIGINT", async () => {
  console.log("\n🛑 Arrêt du serveur...");
  try {
    await redisConfig.disconnect();
    await kafkaConfig.disconnect();
    console.log("✅ Services déconnectés proprement");
  } catch (error) {
    console.error("❌ Erreur lors de l'arrêt:", error);
  }
  process.exit(0);
});

startServer();
