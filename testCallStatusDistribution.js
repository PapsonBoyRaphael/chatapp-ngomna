/**
 * Script de test pour vérifier la distribution des événements call.status.updated
 * Vérifie:
 * 1. Si l'événement est publié dans le stream Redis
 * 2. Si le consumer le récupère
 * 3. Si l'événement est bien distribué aux participants connectés
 */

const Redis = require("ioredis");

const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
};

const redis = new Redis(redisConfig);

async function checkCallStream() {
  try {
    console.log("🔍 Vérification du stream chat:stream:events:call...\n");

    // 1. Vérifier l'existence du stream
    const streamExists = await redis.exists("chat:stream:events:call");
    console.log(`Stream existe: ${streamExists ? "✅ OUI" : "❌ NON"}`);

    if (!streamExists) {
      console.log("⚠️ Le stream n'existe pas encore");
      return;
    }

    // 2. Obtenir les infos du stream
    const streamInfo = await redis.xinfo("STREAM", "chat:stream:events:call");
    console.log(`\n📊 Informations du stream:`);
    console.log(`   - Longueur: ${streamInfo[1]} messages`);
    console.log(`   - Groupes: ${streamInfo[5].length} groupe(s)`);

    // 3. Lire les derniers messages du stream
    console.log(`\n📬 Derniers messages du stream:`);
    const messages = await redis.xrevrange(
      "chat:stream:events:call",
      "+",
      "-",
      "COUNT",
      5,
    );

    if (messages.length === 0) {
      console.log("   Aucun message dans le stream");
    } else {
      messages.forEach((msg, idx) => {
        const [id, fields] = msg;
        const data = {};
        for (let i = 0; i < fields.length; i += 2) {
          data[fields[i]] = fields[i + 1];
        }
        console.log(`\n   Message ${idx + 1} (ID: ${id}):`);
        console.log(`      Event: ${data.event}`);
        console.log(`      Status: ${data.status}`);
        console.log(`      CallId: ${data.callId}`);
        console.log(`      MessageId: ${data.messageId}`);
        console.log(`      Participants: ${data.participants}`);
        console.log(`      Timestamp: ${data.timestamp}`);
      });
    }

    // 4. Vérifier les groupes de consumers
    console.log(`\n👥 Groupes de consumers:`);
    const groups = await redis
      .xinfo("GROUPS", "chat:stream:events:call")
      .catch(() => []);

    if (groups.length === 0) {
      console.log("   ⚠️ Aucun groupe de consumer configuré");
    } else {
      for (let i = 0; i < groups.length; i += 10) {
        const groupName = groups[i + 1];
        const consumers = groups[i + 3];
        const pending = groups[i + 5];
        const lastDeliveredId = groups[i + 7];

        console.log(`\n   Groupe: ${groupName}`);
        console.log(`      - Consumers: ${consumers}`);
        console.log(`      - Messages en attente: ${pending}`);
        console.log(`      - Dernier ID livré: ${lastDeliveredId}`);

        // Obtenir les infos des consumers du groupe
        try {
          const consumerInfo = await redis.xinfo(
            "CONSUMERS",
            "chat:stream:events:call",
            groupName,
          );
          console.log(`      - Consumers actifs:`);
          for (let j = 0; j < consumerInfo.length; j += 6) {
            const consumerName = consumerInfo[j + 1];
            const pendingMsgs = consumerInfo[j + 3];
            const idle = consumerInfo[j + 5];
            console.log(
              `         · ${consumerName}: ${pendingMsgs} en attente, idle ${idle}ms`,
            );
          }
        } catch (e) {
          console.log(`      ⚠️ Impossible de lire les consumers`);
        }
      }
    }

    // 5. Vérifier les messages en attente (pending)
    console.log(`\n⏳ Messages en attente de traitement:`);
    try {
      const pending = await redis.xpending(
        "chat:stream:events:call",
        "events-call",
        "-",
        "+",
        10,
      );

      if (pending.length === 0) {
        console.log("   ✅ Aucun message en attente");
      } else {
        pending.forEach((p) => {
          console.log(`   - Message ID: ${p[0]}`);
          console.log(`     Consumer: ${p[1]}`);
          console.log(`     Délai: ${p[2]}ms`);
          console.log(`     Tentatives: ${p[3]}`);
        });
      }
    } catch (e) {
      console.log(`   ⚠️ Impossible de vérifier les pending: ${e.message}`);
    }
  } catch (error) {
    console.error("❌ Erreur:", error.message);
  } finally {
    await redis.quit();
  }
}

// Exécuter la vérification
checkCallStream();
