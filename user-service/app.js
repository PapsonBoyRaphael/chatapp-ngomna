const express = require("express");
const cors = require("cors");
require("dotenv").config();
// const userRoutes = require("./src/routes/userRoutes");
// const { Sequelize } = require("sequelize");
const { sequelize } = require("./src/config/db");
const initDb = require("./src/config/initDb");

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());

// initDb();

const axios = require("axios");
const authenticateToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token requis" });

  try {
    const response = await axios.post(
      `${process.env.AUTH_SERVICE_URL}/api/validate-token`,
      { token }
    );
    if (response.status === 200) {
      req.user = response.data.user;
      next();
    } else {
      res.status(401).json({ message: "Token invalide" });
    }
  } catch (error) {
    res.status(401).json({ message: "Erreur lors de la validation du token" });
  }
};

// app.use("/api/users", authenticateToken, userRoutes);

app.use(({ res }) => {
  const message = "Ressource non trouvée.";
  res.status(404).json({ message });
});

const port = process.env.USER_PORT || 3001;
app.listen(port, () => console.log(`user-service démarré sur le port ${port}`));
