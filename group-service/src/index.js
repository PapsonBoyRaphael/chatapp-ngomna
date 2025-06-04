const express = require("express");
// const initDb = require("./src/infrastructure/database/initDb");
// const groupRoutes = require("./src/application/routes/groupRoutes");

const app = express();
app.use(express.json());
// app.use("/groups", groupRoutes);

const PORT = process.env.PORT || 8004;

const startServer = async () => {
  try {
    // await initDb();
    app.listen(PORT, () => {
      console.log(`group-service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start group-service:", error);
  }
};

startServer();
