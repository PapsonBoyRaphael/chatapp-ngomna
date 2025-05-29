const express = require("express");
const { Server } = require("socket.io");
const http = require("http");
const initDb = require("./infrastructure/database/initDb");
const chatHandler = require("./application/websocket/chatHandler");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(express.json());

const PORT = process.env.PORT || 3003;

const startServer = async () => {
  try {
    await initDb();

    // Configuration des gestionnaires de websocket
    chatHandler(io);

    server.listen(PORT, () => {
      console.log(`Chat service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start chat-service:", error);
  }
};

startServer();
