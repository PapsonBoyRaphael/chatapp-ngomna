const express = require("express");
const cors = require("cors");
const { testConnection } = require("./infrastructure/config/database");
const UserRepository = require("./infrastructure/repositories/UserRepository");
const GetAllUsers = require("./application/use-cases/GetAllUsers");
const UserController = require("./interfaces/http/controllers/userController");
const createUserRoutes = require("./interfaces/http/routes/userRoutes");
const chalk = require("chalk");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.USER_SERVICE_PORT || 8002;

// Initialisation des dépendances
const userRepository = new UserRepository();
const getAllUsersUseCase = new GetAllUsers(userRepository);
const userController = new UserController(getAllUsersUseCase);

// Routes
app.use("/", createUserRoutes(userController));

const startServer = async () => {
  try {
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error("Échec de connexion à la base de données");
    }

    app.listen(PORT, () => {
      console.log(chalk.yellow(`User service démarré sur le port ${PORT}`));
    });
  } catch (error) {
    console.error("❌ Erreur de démarrage:", error);
    process.exit(1);
  }
};

startServer();
