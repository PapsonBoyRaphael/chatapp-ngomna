const express = require("express");
const chalk = require("chalk");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");
const { testConnection } = require("./infrastructure/config/database");
const redisConfig = require("./infrastructure/redis/redisConfig");

// Repositories
const UserRepository = require("./infrastructure/repositories/UserRepository");

// Services
const JwtService = require("./application/services/JwtService");

// ✅ SMART CACHE PREWARMER
const SmartCachePrewarmer = require("./infrastructure/services/SmartCachePrewarmer");

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
const shared = require("@chatapp-ngomna/shared");

// ✅ SHARED MODULE - Cache utilisateur partagé
let UserCache, UserStreamConsumer, RedisManager;
try {
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

    // ===============================
    // 2. CONNEXION REDIS + CACHE UTILISATEUR
    // ===============================
    let redisClient = null;
    if (RedisManager) {
      try {
        await RedisManager.connect({
          host: process.env.REDIS_HOST,
          port: process.env.REDIS_PORT,
          password: process.env.REDIS_PASSWORD,
          db: process.env.REDIS_DB || 0,
        });

        if (!RedisManager.isConnected) {
          throw new Error("RedisManager non connecté");
        }

        redisClient = RedisManager.getMainClient();
        console.log(
          "✅ Redis connecté via RedisManager (cache utilisateur activé)",
        );

        if (UserCache) {
          await UserCache.initialize();
        }
      } catch (error) {
        console.warn("⚠️ Redis (shared) indisponible:", error.message);
        console.error("Stack:", error.stack);

        try {
          const fallbackClient = await redisConfig.connect();
          if (fallbackClient) {
            redisClient = fallbackClient;
            console.log("✅ Redis connecté via redisConfig (fallback local)");
          }
        } catch (fallbackError) {
          console.error("❌ Fallback Redis échoué:", fallbackError.message);
        }
      }
    } else {
      try {
        const fallbackClient = await redisConfig.connect();
        if (fallbackClient) {
          redisClient = fallbackClient;
          console.log("✅ Redis connecté via redisConfig (sans module shared)");
        }
      } catch (fallbackError) {
        console.error(
          "❌ Redis indisponible (fallback):",
          fallbackError.message,
        );
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
      redisClient,
    );
    const batchGetUsersUseCase = new BatchGetUsers(userRepository);
    const updateUserProfileUseCase = new UpdateUserProfile(
      userRepository,
      UserCache,
      redisClient,
    );
    const createUserUseCase = new CreateUser(
      userRepository,
      UserCache,
      redisClient,
    );
    const deleteUserUseCase = new DeleteUser(
      userRepository,
      UserCache,
      redisClient,
    );

    // Controllers
    const userController = new UserController(
      getAllUsersUseCase,
      getUserByIdUseCase,
      batchGetUsersUseCase,
      updateUserProfileUseCase,
      createUserUseCase,
      deleteUserUseCase,
    );
    const authController = new AuthController(loginUserUseCase);

    // ===============================
    // 3. PRÉ-CHAUFFAGE CACHE UTILISATEUR
    // ===============================
    // ✅ Publier tous les utilisateurs dans Redis au démarrage
    if (UserCache && userRepository) {
      try {
        const prewarmer = new SmartCachePrewarmer(userRepository, {
          batchSize: 500,
          delayBetweenBatches: 1500,
        });
        prewarmer.start().catch((error) => {
          console.warn("⚠️ Erreur pré-chauffage cache:", error.message);
        });
      } catch (error) {
        console.warn(
          "⚠️ Impossible de démarrer SmartCachePrewarmer:",
          error.message,
        );
      }
    }

    // Routes
    app.use("/", createUserRoutes(userController));
    app.use("/", createAuthRoutes(authController, jwtService));

    app.listen(PORT, () => {
      console.log(
        `🚀 Auth-User Service démarré sur le port ${PORT} : ${chalk.blue(
          `http://localhost:${PORT}`,
        )}`,
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
