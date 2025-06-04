const express = require("express");
const chalk = require("chalk");
const { Server } = require("socket.io");
const http = require("http");
const cors = require("cors");
const connectDB = require("./infrastructure/mongodb/connection");
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
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors());
app.use(express.json());

// app.use("/messages", messageRoutes); // Ajouter les routes des messages

const path = require("path");

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, "../public")));

const PORT = process.env.CHAT_PORT || 8003;

const startServer = async () => {
  try {
    const isConnected = await connectDB();
    if (!isConnected) {
      throw new Error("Échec de connexion à MongoDB");
    }

    const messageRepository = new MongoMessageRepository();
    const conversationRepository = new MongoConversationRepository();
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
    const getMessagesUseCase = new GetMessages(messageRepository);
    const updateMessageStatusUseCase = new UpdateMessageStatus(
      messageRepository
    );

    chatHandler(
      io,
      sendMessageUseCase,
      getConversationUseCase,
      getConversationsUseCase,
      getMessagesUseCase,
      updateMessageStatusUseCase
    );

    server.listen(PORT, () => {
      console.log(
        chalk.yellow(`Chat service démarré sur le port ${PORT}, `),
        chalk.blue(`http://localhost:${PORT}`)
      );
    });
  } catch (error) {
    console.error("❌ Erreur de démarrage:", error);
    process.exit(1);
  }
};

startServer();
