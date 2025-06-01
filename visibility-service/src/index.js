const express = require("express");
// const initDb = require('./src/infrastructure/database/initDb');
// const visibilityRoutes = require('./src/application/routes/visibilityRoutes');

const app = express();
app.use(express.json());
// app.use('/visibility', visibilityRoutes);

const PORT = process.env.PORT || 8005;

const startServer = async () => {
  try {
    // await initDb();
    app.listen(PORT, () => {
      console.log(`visibility-service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start visibility-service:", error);
  }
};

startServer();
