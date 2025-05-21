const { mongoose, Contact } = require("./src/config/db");

async function initDb() {
  try {
    // Nettoyer la base de données
    await Contact.deleteMany({});
    console.log("Base de données MongoDB (Contacts) nettoyée");

    // Liste des mongoId des utilisateurs (à récupérer manuellement après user-service/initDb.js)
    const userMongoIds = [
      "mongoId_alice", // Remplace par le vrai mongoId d'Alice
      "mongoId_bob", // Remplace par le vrai mongoId de Bob
      "mongoId_charlie", // Remplace par le vrai mongoId de Charlie
      "mongoId_diana", // Remplace par le vrai mongoId de Diana
      "mongoId_eve", // Remplace par le vrai mongoId d'Eve
    ];

    // Créer des relations de contact
    const contactsData = [
      {
        user: mongoose.Types.ObjectId(userMongoIds[0]),
        contact: mongoose.Types.ObjectId(userMongoIds[1]),
      },
      {
        user: mongoose.Types.ObjectId(userMongoIds[0]),
        contact: mongoose.Types.ObjectId(userMongoIds[2]),
      },
      {
        user: mongoose.Types.ObjectId(userMongoIds[1]),
        contact: mongoose.Types.ObjectId(userMongoIds[3]),
      },
      {
        user: mongoose.Types.ObjectId(userMongoIds[2]),
        contact: mongoose.Types.ObjectId(userMongoIds[4]),
      },
      {
        user: mongoose.Types.ObjectId(userMongoIds[3]),
        contact: mongoose.Types.ObjectId(userMongoIds[0]),
      },
    ];

    const contacts = await Contact.insertMany(contactsData);
    console.log(`${contacts.length} contacts créés dans MongoDB`);

    contacts.forEach((contact) => {
      console.log(
        `Contact créé: user ${contact.user} -> contact ${contact.contact}`
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
