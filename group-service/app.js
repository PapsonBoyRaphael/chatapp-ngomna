const express = require("express");
const chalk = require("chalk");
const bodyParser = require("body-parser");
const mongoose = require("./src/config/db");
const cors = require("cors");
require("dotenv").config();
const cookieParser = require("cookie-parser");
const axios = require("axios");
// const groupRoutes = require("./src/routes/groupRoutes");

const app = express();

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

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.json());

// app.use("/api/groups", authenticateToken, groupRoutes);

app.use(({ res }) => {
  const message = "Ressource non trouvée.";
  res.status(404).json({ message });
});

const port = process.env.GROUP_PORT || 3003;
app.listen(port, () =>
  console.log(
    `group-service démarré sur: ${chalk.green(`http://localhost:${port}`)}`
  )
);
