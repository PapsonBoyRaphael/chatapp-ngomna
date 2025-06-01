const axios = require("axios");

module.exports = (io, sendMessageUseCase) => {
  io.on("connection", async (socket) => {
    console.log("Nouveau client connecté:", socket.id);

    // Récupérer le token depuis socket.handshake.auth
    const token = socket.handshake.auth?.token;

    if (!token) {
      console.error("Connexion refusée : token manquant");
      socket.emit("error", { message: "Token d'authentification requis" });
      socket.disconnect(); // Déconnecter le client
      return;
    }

    try {
      // Valider le token auprès de l'auth-service
      const response = await axios.post(process.env.AUTH_SERVICE_URL, {
        token,
      });

      const userData = response.data; // Récupérer les données utilisateur
      const userId = userData.id; // Supposons que l'auth-service renvoie un champ `id`

      console.log(`Utilisateur authentifié : ${userId}`);
      socket.join(userId); // Joindre la salle de l'utilisateur

      // Gérer les messages privés
      socket.on("privateMessage", async (data) => {
        try {
          const { senderId, receiverId, content } = data;

          // Vérifiez que l'utilisateur est bien celui qui envoie le message
          if (senderId !== userId) {
            console.error("Tentative d'usurpation d'identité détectée");
            socket.emit("messageError", {
              message: "Vous n'êtes pas autorisé à envoyer ce message",
            });
            return;
          }

          const message = await sendMessageUseCase.execute({
            senderId,
            receiverId,
            content,
          });

          io.to(receiverId).emit("newMessage", message);
          socket.emit("messageSent", message);
        } catch (error) {
          console.error("Erreur lors de l'envoi du message:", error);
          socket.emit("messageError", {
            message: "Erreur lors de l'envoi du message",
          });
        }
      });

      socket.on("disconnect", () => {
        console.log("Client déconnecté:", socket.id);
      });
    } catch (error) {
      console.error(
        "Erreur lors de la validation du token:",
        error.response?.data || error.message
      );
      socket.emit("error", { message: "Erreur d'authentification" });
      socket.disconnect(); // Déconnecter le client
    }
  });
};
