const { mongoose, Group } = require("./src/config/db");

async function initDb() {
  try {
    // Nettoyer la base de données
    await Group.deleteMany({});
    console.log("Base de données MongoDB (Groups) nettoyée");

    // Liste des mongoId des utilisateurs (à récupérer manuellement après user-service/initDb.js)
    const userMongoIds = [
      "mongoId_alice", // Remplace par le vrai mongoId d'Alice
      "mongoId_bob", // Remplace par le vrai mongoId de Bob
      "mongoId_charlie", // Remplace par le vrai mongoId de Charlie
      "mongoId_diana", // Remplace par le vrai mongoId de Diana
      "mongoId_eve", // Remplace par le vrai mongoId d'Eve
    ];

    // Créer 2 groupes
    const groupsData = [
      {
        name: "Amis Proches",
        description: "Groupe pour les amis proches",
        members: [
          mongoose.Types.ObjectId(userMongoIds[0]),
          mongoose.Types.ObjectId(userMongoIds[1]),
          mongoose.Types.ObjectId(userMongoIds[2]),
        ],
        admins: [mongoose.Types.ObjectId(userMongoIds[2])],
        messages: [],
        profile_pic: {
          public_id: "",
          url: "",
          width: 0,
          height: 0,
          format: "",
        },
      },
      {
        name: "Collègues",
        description: "Groupe pour les collègues de travail",
        members: [
          mongoose.Types.ObjectId(userMongoIds[1]),
          mongoose.Types.ObjectId(userMongoIds[3]),
          mongoose.Types.ObjectId(userMongoIds[4]),
        ],
        admins: [mongoose.Types.ObjectId(userMongoIds[1])],
        messages: [],
        profile_pic: {
          public_id: "",
          url: "",
          width: 0,
          height: 0,
          format: "",
        },
      },
    ];

    const groups = await Group.insertMany(groupsData);
    console.log(`${groups.length} groupes créés dans MongoDB`);

    groups.forEach((group) => {
      console.log(
        `Groupe ${group.name} créé avec ${group.members.length} membres`
      );
    });
  } catch (error) {
    console.error(
      "Erreur lors de l’initialisation de la base de données:",
      error
    );
  } finally {
    await mongoose.connection.close();
  }
}

initDb();
