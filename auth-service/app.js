const express = require("express");
const cors = require("cors");
require("dotenv").config();
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
// const loginRoutes = require("./src/routes/loginRoutes");

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// app.use("/api/login", loginRoutes);

app.post("/api/validate-token", (req, res) => {
  const { token } = req.body;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.status(200).json({ user: decoded });
  } catch (error) {
    res.status(401).json({ message: "Token invalide" });
  }
});

app.use(({ res }) => {
  const message = "Ressource non trouvée.";
  res.status(404).json({ message });
});

const port = process.env.AUTH_PORT || 3000;
app.listen(port, () => console.log(`auth-service démarré sur le port ${port}`));
