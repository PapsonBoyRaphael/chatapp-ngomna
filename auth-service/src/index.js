const express = require("express");
const initDb = require("./src/infrastructure/database/initDb");
const authRoutes = require("./src/application/routes/authRoutes");

const app = express();
app.use(express.json());
app.use("/auth", authRoutes);

const PORT = process.env.PORT || 3002;

const startServer = async () => {
  try {
    await initDb();
    app.listen(PORT, () => {
      console.log(`auth-service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start auth-service:", error);
  }
};

startServer();
