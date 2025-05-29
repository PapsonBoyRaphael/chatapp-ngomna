const express = require("express");
// const initDb = require("./src/infrastructure/database/initDb");
// const userRoutes = require("./src/application/routes/userRoutes");

const app = express();
app.use(express.json());
// app.use("/users", userRoutes);

const PORT = process.env.PORT || 3001;

const startServer = async () => {
  try {
    // await initDb();
    app.listen(PORT, () => {
      console.log(`user-service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start user-service:", error);
  }
};

startServer();
