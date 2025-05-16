const express = require("express");
const chalk = require("chalk");
const bodyParser = require("body-parser");
const mongoose = require("./src/config/db");
const cors = require("cors");
require("dotenv").config();
const cookieParser = require("cookie-parser");
const axios = require("axios");
const cloudinary = require("cloudinary").v2;
// const fileRoutes = require("./src/routes/fileRoutes");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

// app.use("/api/files", authenticateToken, fileRoutes);

app.use(({ res }) => {
  const message = "Ressource non trouvée.";
  res.status(404).json({ message });
});

const port = process.env.FILE_PORT || 3005;
app.listen(port, () =>
  console.log(
    `file-service démarré sur: ${chalk.green(`http://localhost:${port}`)}`
  )
);
