const express = require("express");
// const initDb = require("./src/infrastructure/database/initDb");
// const fileRoutes = require("./src/application/routes/fileRoutes");

const app = express();
app.use(express.json());
// app.use("/files", fileRoutes);

const PORT = process.env.PORT || 3006;

const startServer = async () => {
  try {
    // await initDb();
    app.listen(PORT, () => {
      console.log(`file-service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start file-service:", error);
  }
};

startServer();
