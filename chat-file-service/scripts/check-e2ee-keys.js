/**
 * Script de diagnostic E2EE
 * Vérifie l'état des clés publiques RSA enregistrées dans MongoDB
 */

require("dotenv").config();
const mongoose = require("mongoose");

async function checkE2EEKeys() {
  console.log("🔍 Diagnostic E2EE - Vérification des clés publiques");
  console.log("═".repeat(70));

  try {
    // Connexion MongoDB
    const MONGODB_URI =
      process.env.MONGODB_URI || "mongodb://localhost:27017/chatapp";
    console.log(`📦 Connexion MongoDB: ${MONGODB_URI}`);
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connecté à MongoDB\n");

    // Définir le schéma (simplifié)
    const UserEncryptionKeySchema = new mongoose.Schema(
      {
        userId: String,
        publicKey: String,
        keyVersion: String,
        fingerprint: String,
        isActive: Boolean,
        deviceInfo: Object,
        createdAt: Date,
        expiresAt: Date,
      },
      { collection: "user_encryption_keys" },
    );

    const UserEncryptionKey = mongoose.model(
      "UserEncryptionKey",
      UserEncryptionKeySchema,
    );

    // Compter toutes les clés
    const totalKeys = await UserEncryptionKey.countDocuments({});
    const activeKeys = await UserEncryptionKey.countDocuments({
      isActive: true,
    });
    const inactiveKeys = await UserEncryptionKey.countDocuments({
      isActive: false,
    });

    console.log("📊 STATISTIQUES GLOBALES");
    console.log("─".repeat(70));
    console.log(`Total clés enregistrées    : ${totalKeys}`);
    console.log(`Clés actives               : ${activeKeys}`);
    console.log(`Clés inactives/révoquées   : ${inactiveKeys}\n`);

    // Lister toutes les clés actives
    const keys = await UserEncryptionKey.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(50);

    if (keys.length === 0) {
      console.log("⚠️  AUCUNE CLÉ ACTIVE TROUVÉE");
      console.log("   → Aucun utilisateur n'a enregistré de clé publique E2EE");
      console.log("   → Les messages seront envoyés en clair (fallback)\n");
    } else {
      console.log("🔑 CLÉS ACTIVES PAR UTILISATEUR");
      console.log("─".repeat(70));
      keys.forEach((key, index) => {
        const age = Math.round((Date.now() - key.createdAt) / 1000 / 60);
        const expiresIn = key.expiresAt
          ? Math.round((key.expiresAt - Date.now()) / 1000 / 60 / 60 / 24)
          : "N/A";
        console.log(`\n${index + 1}. userId: ${key.userId}`);
        console.log(`   Version      : ${key.keyVersion}`);
        console.log(
          `   Fingerprint  : ${key.fingerprint?.substring(0, 32)}...`,
        );
        console.log(
          `   Device       : ${key.deviceInfo?.platform || "N/A"} - ${key.deviceInfo?.deviceName || "N/A"}`,
        );
        console.log(`   Créée il y a : ${age} min`);
        console.log(`   Expire dans  : ${expiresIn} jours`);
      });
    }

    // Vérifier les utilisateurs de test spécifiques
    console.log("\n\n🎯 VÉRIFICATION UTILISATEURS DE TEST");
    console.log("─".repeat(70));
    const testUsers = ["570479H", "534589D", "012345A"];

    for (const userId of testUsers) {
      const userKey = await UserEncryptionKey.findOne({
        userId,
        isActive: true,
      });
      if (userKey) {
        console.log(
          `✅ ${userId} : Clé active v${userKey.keyVersion} (${userKey.fingerprint?.substring(0, 16)}...)`,
        );
      } else {
        console.log(`❌ ${userId} : AUCUNE CLÉ ACTIVE`);
      }
    }

    // Vérifier les clés expirées
    const expiredKeys = await UserEncryptionKey.countDocuments({
      isActive: true,
      expiresAt: { $lt: new Date() },
    });

    if (expiredKeys > 0) {
      console.log(
        `\n⚠️  ${expiredKeys} clé(s) active(s) sont expirées et devraient être révoquées`,
      );
    }

    console.log("\n\n🔧 MODE E2EE SERVEUR");
    console.log("─".repeat(70));
    console.log(`ENCRYPTION_MODE = ${process.env.ENCRYPTION_MODE || "none"}`);

    if (process.env.ENCRYPTION_MODE === "e2ee") {
      console.log("✅ E2EE activé sur le serveur");
      if (activeKeys === 0) {
        console.log(
          "⚠️  Mais aucune clé enregistrée → messages envoyés en clair",
        );
      }
    } else {
      console.log("❌ E2EE désactivé (mode: none ou non configuré)");
    }

    console.log("\n" + "═".repeat(70));
    console.log("✅ Diagnostic terminé");
  } catch (error) {
    console.error("❌ Erreur lors du diagnostic:", error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log("\n📦 Connexion MongoDB fermée");
  }
}

checkE2EEKeys();
