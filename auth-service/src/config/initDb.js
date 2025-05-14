const { mongoose, User } = require("./db");
const bcrypt = require("bcryptjs");
const mockUsers = require("./mocks/mock-user"); // Assurez-vous que ce fichier existe

const initAuthDb = async () => {
  try {
    // Nettoyer uniquement la collection User (au lieu de dropDatabase())
    await User.deleteMany({});

    // Hasher les mots de passe et créer les users
    const userPromises = mockUsers.map(async (user) => {
      const hash = await bcrypt.hash(user.password, 10);
      const newUser = new User({
        username: user.username,
        email: user.email,
        password: hash,
        bio: user.bio || "",
        role: user.role || "user",
      });
      return newUser.save();
    });

    await Promise.all(userPromises);
    console.log("✅ Auth_DB initialisée avec les utilisateurs de test");

    // Optionnel : Créer un admin par défaut
    const adminExists = await User.findOne({ role: "admin" });
    if (!adminExists) {
      const adminHash = await bcrypt.hash("admin123", 10);
      const admin = new User({
        username: "admin",
        email: "admin@example.com",
        password: adminHash,
        role: "admin",
      });
      await admin.save();
      console.log("👑 Admin par défaut créé");
    }
  } catch (error) {
    console.error("❌ Erreur lors de l'init Auth_DB:", error);
    process.exit(1);
  }
};

module.exports = initAuthDb;
