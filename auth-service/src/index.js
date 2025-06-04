const express = require("express");
const chalk = require("chalk");
const { testConnection } = require("./infrastructure/config/database");
const UserRepository = require("./infrastructure/repositories/UserRepository");
const JwtService = require("./application/services/JwtService");
const LoginUser = require("./application/use-cases/LoginUser");
const AuthController = require("./interfaces/http/controllers/authController");
const authRoutes = require("./interfaces/http/routes/authRoutes");
require("dotenv").config();
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.AUTH_PORT || 8001;

// Initialisation des dépendances
const userRepository = new UserRepository();
const jwtService = new JwtService(process.env.JWT_SECRET);
const loginUserUseCase = new LoginUser(userRepository, jwtService);
const authController = new AuthController(loginUserUseCase);
const createAuthRoutes = require("./interfaces/http/routes/authRoutes");

const path = require("path");

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, "../public")));

// Routes
app.use("/", createAuthRoutes(authController));

const startServer = async () => {
  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error("Échec de connexion à la base de données");
    }

    app.listen(PORT, () => {
      console.log(
        chalk.yellow(`Auth service démarré sur le port ${PORT}`),
        chalk.blue(`http://localhost:${PORT}`)
      );
    });
  } catch (error) {
    console.error("❌ Erreur de démarrage:", error);
    process.exit(1);
  }
};

startServer();
