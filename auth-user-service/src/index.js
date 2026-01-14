const express = require("express");
const chalk = require("chalk");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");
const { testConnection } = require("./infrastructure/config/database");

// Repositories
const UserRepository = require("./infrastructure/repositories/UserRepository");

// Services
const JwtService = require("./application/services/JwtService");

// Use Cases
const GetAllUsers = require("./application/use-cases/GetAllUsers");
const GetUserById = require("./application/use-cases/GetUserById");
const LoginUser = require("./application/use-cases/LoginUser");
const BatchGetUsers = require("./application/use-cases/BatchGetUsers");
const UpdateUserProfile = require("./application/use-cases/UpdateUserProfile");
const CreateUser = require("./application/use-cases/CreateUser");
const DeleteUser = require("./application/use-cases/DeleteUser");

// Controllers
const UserController = require("./interfaces/http/controllers/UserController");
const AuthController = require("./interfaces/http/controllers/AuthController");

// Routes
const createUserRoutes = require("./interfaces/http/routes/userRoutes");
const createAuthRoutes = require("./interfaces/http/routes/authRoutes");

// ✅ SHARED MODULE - Cache utilisateur partagé
let UserCache, UserStreamConsumer, RedisManager;
try {
  const shared = require("@chatapp-ngomna/shared");
  UserCache = shared.UserCache;
  UserStreamConsumer = shared.UserStreamConsumer;
  RedisManager = shared.RedisManager;
} catch (error) {
  console.warn("⚠️ Module shared non disponible, cache utilisateur désactivé");
}

require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(cookieParser());

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

    // ✅ INITIALISER REDIS (optionnel)
    let redisClient = null;
    if (RedisManager) {
      try {
        await RedisManager.initialize({
          host: process.env.REDIS_HOST || "localhost",
          port: process.env.REDIS_PORT || 6379,
        });
        redisClient = RedisManager.clients.main;
        console.log("✅ Redis connecté (cache utilisateur activé)");

        // Initialiser UserCache
        if (UserCache) {
          await UserCache.initialize();
        }
      } catch (error) {
        console.warn("⚠️ Redis non disponible:", error.message);
      }
    }

    // Initialisation des dépendances
    const userRepository = new UserRepository();
    const jwtService = new JwtService(process.env.JWT_SECRET);

    // Use Cases
    const getAllUsersUseCase = new GetAllUsers(userRepository);
    const getUserByIdUseCase = new GetUserById(userRepository);
    const loginUserUseCase = new LoginUser(
      userRepository,
      jwtService,
      UserCache,
      redisClient
    );
    const batchGetUsersUseCase = new BatchGetUsers(userRepository);
    const updateUserProfileUseCase = new UpdateUserProfile(
      userRepository,
      UserCache,
      redisClient
    );
    const createUserUseCase = new CreateUser(
      userRepository,
      UserCache,
      redisClient
    );
    const deleteUserUseCase = new DeleteUser(
      userRepository,
      UserCache,
      redisClient
    );

    // Controllers
    const userController = new UserController(
      getAllUsersUseCase,
      getUserByIdUseCase,
      batchGetUsersUseCase,
      updateUserProfileUseCase,
      createUserUseCase,
      deleteUserUseCase
    );
    const authController = new AuthController(loginUserUseCase);

    // Routes
    app.use("/", createUserRoutes(userController));
    app.use("/", createAuthRoutes(authController, jwtService));

    app.listen(PORT, () => {
      console.log(
        `🚀 Auth-User Service démarré sur le port ${PORT} : ${chalk.blue(
          `http://localhost:${PORT}`
        )}`
      );
      if (redisClient) {
        console.log("   ✅ Cache utilisateur Redis actif");
      }
    });
  } catch (error) {
    console.error(chalk.red("❌ Erreur de démarrage:"), error);
    process.exit(1);
  }
};

startServer();
