const express = require("express");
const { Server } = require("ws");
const initDb = require("./src/infrastructure/database/initDb");
const chatHandler = require("./src/application/controllers/chatWebSocketHandler");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3003;
const server = app.listen(PORT, async () => {
  try {
    await initDb();
    console.log(`chat-service running on port ${PORT}`);
    const wss = new Server({ server });
    chatHandler(wss);
  } catch (error) {
    console.error("Failed to start chat-service:", error);
  }
});
