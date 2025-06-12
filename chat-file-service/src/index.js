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

    // Tentative de connexion à Redis
    let redisClient = null;
    try {
      const redisConnected = await redisConfig.connect();
      if (redisConnected) {
        redisClient = redisConfig.getClient();
        console.log(chalk.green("✅ Redis connecté"));
      }
    } catch (error) {
      console.log(
        chalk.yellow("⚠️  Redis non disponible, mode développement activé")
      );
    }

    // Configuration Socket.IO
    const io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL,
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    // Utiliser Redis adapter si disponible
    if (redisClient) {
      io.adapter(
        createAdapter(redisConfig.getPubClient(), redisConfig.getSubClient())
      );
      console.log(chalk.green("✅ Redis adapter configuré"));
    }

    // Middleware Express
    app.use(cors());
    app.use(express.json());
    
    // Servir les fichiers statiques
    app.use(express.static(path.join(__dirname, "../public")));
    app.use('/uploads', express.static(path.join(__dirname, "../uploads")));

    // Initialiser les repositories
    const messageRepository = new MongoMessageRepository();
    const conversationRepository = new MongoConversationRepository();
    const fileRepository = new MongoFileRepository();

    // Initialiser les use cases
    const sendMessageUseCase = new SendMessage(messageRepository, conversationRepository);
    const getMessagesUseCase = new GetMessages(messageRepository);
    const getConversationUseCase = new GetConversation(conversationRepository, messageRepository);
    const getConversationsUseCase = new GetConversations(conversationRepository, messageRepository);
    const updateMessageStatusUseCase = new UpdateMessageStatus(messageRepository, conversationRepository);
    const uploadFileUseCase = new UploadFile(fileRepository, messageRepository, conversationRepository);
    const getFileUseCase = new GetFile(fileRepository);

    // Initialiser les contrôleurs
    const fileController = new FileController(uploadFileUseCase, getFileUseCase);

    // Configuration des routes HTTP
    app.use("/api/messages", createMessageRoutes(sendMessageUseCase, getMessagesUseCase));
    app.use("/api/files", createFileRoutes(fileController));

    // Route de santé
    app.get("/health", (req, res) => {
      res.json({ 
        status: "OK", 
        service: "chat-file-service",
        timestamp: new Date().toISOString(),
        features: ["chat", "file-upload", "websocket"]
      });
    });

    // Configurer le gestionnaire WebSocket
    chatHandler(
      io,
      redisClient,
      sendMessageUseCase,
      getConversationUseCase,
      getConversationsUseCase,
      getMessagesUseCase,
      updateMessageStatusUseCase
    );

    const PORT = process.env.CHAT_FILE_SERVICE_PORT || 8003;
    server.listen(PORT, () => {
      console.log(chalk.blue(`�� Chat-File Service démarré sur le port ${PORT}`));
      console.log(chalk.yellow(`🌍 Serveur ID: ${process.env.SERVER_ID || "chat-file-1"}`));
      console.log(chalk.cyan("📋 Fonctionnalités disponibles:"));
      console.log(chalk.green("   💬 Chat en temps réel"));
      console.log(chalk.green("   📁 Upload/Download de fichiers"));
      console.log(chalk.green("   🖼️  Traitement d'images"));
      console.log(chalk.green("   📱 Interface web"));
      if (!redisClient) {
        console.log(chalk.yellow("⚠️  Mode développement - Redis désactivé"));
      }
    });

  } catch (error) {
    console.error(chalk.red("❌ Erreur au démarrage:"), error);
    process.exit(1);
  }
};

// Gestion propre de l'arrêt
process.on("SIGINT", async () => {
  console.log("\n🛑 Arrêt du serveur...");
  await redisConfig.disconnect();
  process.exit(0);
});

startServer();
