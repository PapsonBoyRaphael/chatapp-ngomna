const path = require("path");
const io = require(
  path.join(__dirname, "chat-file-service/node_modules/socket.io-client"),
);

// Se connecter au serveur WebSocket
const socket = io("http://localhost:8000", {
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("✅ Connecté au serveur WebSocket");

  // S'authentifier
  socket.emit("authenticate", {
    userId: "570479H",
    matricule: "570479H",
    token: "test-token", // Token de test
  });
});

socket.on("authenticated", (data) => {
  console.log("✅ Authentifié:", data);

  // Envoyer un message de test
  setTimeout(() => {
    socket.emit("sendMessage", {
      content: `Test cache invalidation ${Date.now()}`,
      conversationId: "", // Conversation vide pour créer une nouvelle
      receiverId: "534589D",
      type: "TEXT",
    });
  }, 1000);
});

socket.on("message_sent", (data) => {
  console.log("✅ Message envoyé:", data);

  // Attendre un peu puis vérifier le cache
  setTimeout(() => {
    checkCache();
  }, 2000);
});

socket.on("error", (error) => {
  console.error("❌ Erreur WebSocket:", error);
});

function checkCache() {
  const { exec } = require("child_process");

  // Vérifier si le cache existe encore
  exec(
    'redis-cli GET "chat:chat:convs:user:570479H:first:20"',
    (error, stdout, stderr) => {
      if (error) {
        console.error("❌ Erreur Redis:", error);
        return;
      }

      if (stdout.trim() === "nil") {
        console.log("✅ Cache invalidé avec succès !");
      } else {
        console.log("❌ Cache toujours présent");
        try {
          const data = JSON.parse(stdout);
          console.log("📋 Données cache:", {
            conversationsCount: data.conversations?.length,
            lastMessage: data.conversations?.[0]?.lastMessage,
          });
        } catch (e) {
          console.log("📋 Cache brut:", stdout.substring(0, 200) + "...");
        }
      }

      socket.disconnect();
      process.exit(0);
    },
  );
}

// Timeout de sécurité
setTimeout(() => {
  console.log("⏰ Timeout - arrêt du test");
  socket.disconnect();
  process.exit(1);
}, 10000);
