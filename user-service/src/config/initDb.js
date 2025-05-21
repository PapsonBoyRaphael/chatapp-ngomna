const sequelize = require("./db"); // Importation directe de sequelize
const User = require("../models/user");
const bcrypt = require("bcryptjs");

async function initDb() {
  try {
    await sequelize.sync({ force: true });
    console.log("Base de données PostgreSQL synchronisée et nettoyée");

    const usersData = [
      {
        username: "alice",
        password: await bcrypt.hash("alice123", 10),
        email: "alice@example.com",
        phoneNumber: "+1234567890",
        role: "user",
        status: "online",
        isverify: true,
        mongoId: require("mongoose").Types.ObjectId().toString(),
        profilePicture: {
          public_id: "alice_pic_id",
          url: "http://example.com/alice.jpg",
          width: 800,
          height: 600,
          format: "jpg",
        },
      },
      // ... (autres utilisateurs avec profilePicture similaire)
    ];

    const users = await User.bulkCreate(usersData);
    console.log(`${users.length} utilisateurs créés dans PostgreSQL`);

    users.forEach((user) => {
      console.log(
        `Utilisateur ${user.username} créé avec mongoId: ${user.mongoId}`
      );
    });
  } catch (error) {
    console.error(
      "Erreur lors de l’initialisation de la base de données:",
      error
    );
  }
}

module.exports = initDb;
