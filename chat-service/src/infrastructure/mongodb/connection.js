const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ Connexion MongoDB établie");
    return true;
  } catch (error) {
    console.error("❌ Erreur de connexion MongoDB:", error);
    return false;
  }
};

module.exports = connectDB;
