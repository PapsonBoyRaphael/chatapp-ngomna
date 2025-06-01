const express = require("express");
const chalk = require("chalk");
const { Server } = require("socket.io");
const http = require("http");
const cors = require("cors");
const connectDB = require("./infrastructure/mongodb/connection");
const MongoMessageRepository = require("./infrastructure/repositories/MongoMessageRepository");
const MongoConversationRepository = require("./infrastructure/repositories/MongoConversationRepository");
const SendMessage = require("./application/use-cases/SendMessage");
const chatHandler = require("./application/websocket/chatHandler");
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

    chatHandler(io, sendMessageUseCase);

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
