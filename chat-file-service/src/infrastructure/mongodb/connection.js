const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const options = {
      serverSelectionTimeoutMS: 5000,
      bufferCommands: false,
      maxPoolSize: 10,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
      // Options dépréciées supprimées pour éviter les warnings
    };

    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/chat_file_service",
      options
    );

    console.log("✅ Connexion MongoDB établie");

    // Gestionnaires d'événements
    mongoose.connection.on("error", (error) => {
      console.error("❌ Erreur MongoDB:", error);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ MongoDB déconnecté");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("🔄 MongoDB reconnecté");
    });

    return true;
  } catch (error) {
    console.error("❌ Erreur connexion MongoDB:", error.message);

    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }

    return false;
  }
};

module.exports = connectDB;
