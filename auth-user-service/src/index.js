const express = require("express");
const chalk = require("chalk");
const cors = require("cors");
const path = require("path");
const { testConnection } = require("./infrastructure/config/database");

// Repositories
const UserRepository = require("./infrastructure/repositories/UserRepository");

// Services
const JwtService = require("./application/services/JwtService");

// Use Cases
const GetAllUsers = require("./application/use-cases/GetAllUsers");
const GetUserById = require("./application/use-cases/GetUserById");
const LoginUser = require("./application/use-cases/LoginUser");

// Controllers
const UserController = require("./interfaces/http/controllers/UserController");
const AuthController = require("./interfaces/http/controllers/AuthController");

// Routes
const createUserRoutes = require("./interfaces/http/routes/userRoutes");
const createAuthRoutes = require("./interfaces/http/routes/authRoutes");

require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.AUTH_USER_SERVICE_PORT || 8001;

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, "../public")));

const startServer = async () => {
  try {
    // Test de connexion à la base de données
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error("Échec de connexion à la base de données");
    }

    // Initialisation des dépendances
    const userRepository = new UserRepository();
    const jwtService = new JwtService(process.env.JWT_SECRET);

    // Use Cases
    const getAllUsersUseCase = new GetAllUsers(userRepository);
    const getUserByIdUseCase = new GetUserById(userRepository);
    const loginUserUseCase = new LoginUser(userRepository, jwtService);

    // Controllers
    const userController = new UserController(
      getAllUsersUseCase,
      getUserByIdUseCase
    );
    const authController = new AuthController(loginUserUseCase);

    // Routes
    app.use("/users", createUserRoutes(userController));
    app.use("/auth", createAuthRoutes(authController));

    app.listen(PORT, () => {
      console.log(
        chalk.yellow(`🚀 Auth-User Service démarré sur le port ${PORT}`),
        chalk.blue(`http://localhost:${PORT}`)
      );
    });
  } catch (error) {
    console.error(chalk.red("❌ Erreur de démarrage:"), error);
    process.exit(1);
  }
};

startServer();
