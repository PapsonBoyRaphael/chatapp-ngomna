const express = require("express");
const chalk = require("chalk");
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const http = require("http");
const cors = require("cors");
const connectDB = require("./infrastructure/mongodb/connection");
const redisConfig = require("./infrastructure/redis/redisConfig");
const MongoMessageRepository = require("./infrastructure/repositories/MongoMessageRepository");
const MongoConversationRepository = require("./infrastructure/repositories/MongoConversationRepository");
const GetConversation = require("./application/use-cases/GetConversation");
const GetConversations = require("./application/use-cases/GetConversations");
const GetMessages = require("./application/use-cases/GetMessages");
const SendMessage = require("./application/use-cases/SendMessage");
const UpdateMessageStatus = require("./application/use-cases/UpdateMessageStatus");
const chatHandler = require("./application/websocket/chatHandler");
const messageRoutes = require("./interfaces/http/routes/messageRoutes");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const startServer = async () => {
  try {
    // Connexion à MongoDB
    await connectDB();
    console.log(chalk.green("✅ MongoDB connecté"));

    // Tentative de connexion à Redis (optionnel en dev)
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
      console.log(
        chalk.yellow("   Les fonctionnalités avancées seront limitées")
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

    // Utiliser Redis adapter seulement si Redis est disponible
    if (redisClient) {
      io.adapter(
        createAdapter(redisConfig.getPubClient(), redisConfig.getSubClient())
      );
      console.log(chalk.green("✅ Redis adapter configuré"));
    }

    const path = require("path");

    // Servir les fichiers statiques
    app.use(express.static(path.join(__dirname, "../public")));

    app.use(cors());
    app.use(express.json());
    app.use("/api/messages", messageRoutes);

    // Initialiser les repositories
    const messageRepository = new MongoMessageRepository();
    const conversationRepository = new MongoConversationRepository();

    // Initialiser les use cases
    const sendMessageUseCase = new SendMessage(
      messageRepository,
      conversationRepository
    );
    const getConversationUseCase = new GetConversation(
      conversationRepository,
      messageRepository
    );
    const getConversationsUseCase = new GetConversations(
      conversationRepository,
      messageRepository
    );
    const getMessagesUseCase = new GetMessages(
      messageRepository,
      conversationRepository
    );
    const updateMessageStatusUseCase = new UpdateMessageStatus(
      messageRepository,
      conversationRepository
    );

    // Configurer le gestionnaire de chat (avec ou sans Redis)
    chatHandler(
      io,
      redisClient, // Peut être null
      sendMessageUseCase,
      getConversationUseCase,
      getConversationsUseCase,
      getMessagesUseCase,
      updateMessageStatusUseCase
    );

    const PORT = process.env.PORT || 8003;
    server.listen(PORT, () => {
      console.log(chalk.yellow(`🚀 Chat-service démarré sur le port ${PORT}`));
      console.log(
        chalk.blue(`🌍 Serveur ID: ${process.env.SERVER_ID || "chat-1"}`)
      );
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
