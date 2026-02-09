#!/usr/bin/env node

/**
 * 🔄 Migration des Clés Redis - Convention de Nommage
 *
 * Ce script migre les anciennes clés Redis vers la nouvelle convention:
 * - Ancien format: presence:*, user_data:*, stream:*
 * - Nouveau format: chat:cache:presence:*, chat:cache:user_data:*, chat:stream:*
 */

const redis = require("redis");

// Mapping des anciens vers nouveaux préfixes
const KEY_MAPPINGS = {
  // Présence et utilisateurs
  "presence:": "chat:cache:presence:",
  "user_data:": "chat:cache:user_data:",
  "user_sockets:": "chat:cache:user_sockets:",
  "user_sockets_set:": "chat:cache:user_sockets_set:",
  "last_seen:": "chat:cache:last_seen:",

  // Rooms
  "rooms:": "chat:cache:rooms:",
  "room_users:": "chat:cache:room_users:",
  "user_rooms:": "chat:cache:user_rooms:",
  "room_data:": "chat:cache:room_data:",
  "room_state:": "chat:cache:room_state:",
  "room_roles:": "chat:cache:room_roles:",
  "room_peak:": "chat:cache:room_peak:",

  // Streams techniques
  "stream:wal": "chat:stream:wal",
  "stream:retry": "chat:stream:retry",
  "stream:dlq": "chat:stream:dlq",
  "stream:fallback": "chat:stream:fallback",
  "stream:metrics": "chat:stream:metrics",

  // Streams fonctionnels (patterns)
  "stream:messages:": "chat:stream:messages:",
  "stream:status:": "chat:stream:status:",
  "stream:events:": "chat:stream:events:",
};

async function migrateRedisKeys() {
  console.log("🔄 Démarrage de la migration des clés Redis...\n");

  // Configuration Redis
  const client = redis.createClient({
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    db: process.env.REDIS_DB || 0,
  });

  try {
    await client.connect();
    console.log("✅ Connecté à Redis\n");

    let totalMigrated = 0;
    let totalErrors = 0;

    // Pour chaque mapping de préfixe
    for (const [oldPrefix, newPrefix] of Object.entries(KEY_MAPPINGS)) {
      try {
        // Scanner pour trouver les clés avec l'ancien préfixe
        let cursor = 0;
        const pattern = `${oldPrefix}*`;
        const keysToMigrate = [];

        console.log(`🔍 Recherche des clés avec pattern: ${pattern}`);

        // Utiliser SCAN pour éviter de bloquer Redis
        do {
          const result = await client.scan(cursor, {
            MATCH: pattern,
            COUNT: 100,
          });

          cursor = result.cursor;
          keysToMigrate.push(...result.keys);
        } while (cursor !== 0);

        if (keysToMigrate.length === 0) {
          console.log(`   ℹ️ Aucune clé trouvée\n`);
          continue;
        }

        console.log(`   📦 ${keysToMigrate.length} clé(s) à migrer`);

        // Migrer les clés par batch
        const batchSize = 50;
        let migratedInBatch = 0;

        for (let i = 0; i < keysToMigrate.length; i += batchSize) {
          const batch = keysToMigrate.slice(i, i + batchSize);

          for (const oldKey of batch) {
            try {
              const newKey = oldKey.replace(oldPrefix, newPrefix);

              // Récupérer le type de la clé et sa TTL
              const type = await client.type(oldKey);
              const ttl = await client.ttl(oldKey);

              console.log(`   ⏳ ${oldKey} → ${newKey}`);

              // Migrer selon le type
              switch (type) {
                case "string":
                  const value = await client.get(oldKey);
                  await client.set(newKey, value);
                  if (ttl > 0) {
                    await client.expire(newKey, ttl);
                  }
                  break;

                case "hash":
                  const hash = await client.hGetAll(oldKey);
                  await client.hSet(newKey, hash);
                  if (ttl > 0) {
                    await client.expire(newKey, ttl);
                  }
                  break;

                case "set":
                  const members = await client.sMembers(oldKey);
                  if (members.length > 0) {
                    await client.sAdd(newKey, ...members);
                  }
                  if (ttl > 0) {
                    await client.expire(newKey, ttl);
                  }
                  break;

                case "list":
                  const list = await client.lRange(oldKey, 0, -1);
                  if (list.length > 0) {
                    await client.rPush(newKey, ...list);
                  }
                  if (ttl > 0) {
                    await client.expire(newKey, ttl);
                  }
                  break;

                case "zset":
                  const zset = await client.zRangeByScoreWithScores(
                    oldKey,
                    0,
                    Infinity,
                  );
                  const pairs = zset.map(({ score, value }) => ({
                    score,
                    member: value,
                  }));
                  if (pairs.length > 0) {
                    await client.zAdd(newKey, pairs);
                  }
                  if (ttl > 0) {
                    await client.expire(newKey, ttl);
                  }
                  break;

                case "stream":
                  // Les streams ne peuvent pas être facilement migrés
                  console.log(`   ⚠️ Stream non migrés: ${oldKey}`);
                  continue;

                default:
                  console.log(`   ⚠️ Type inconnu: ${type}`);
                  continue;
              }

              // Supprimer l'ancienne clé
              await client.del(oldKey);
              migratedInBatch++;
              totalMigrated++;
            } catch (keyError) {
              console.error(
                `   ❌ Erreur migration ${oldKey}:`,
                keyError.message,
              );
              totalErrors++;
            }
          }

          // Petit délai entre les batches
          if (i + batchSize < keysToMigrate.length) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }

        console.log(
          `   ✅ ${migratedInBatch}/${keysToMigrate.length} clés migrées\n`,
        );
      } catch (prefixError) {
        console.error(
          `❌ Erreur traitement préfixe ${oldPrefix}:`,
          prefixError.message,
        );
        totalErrors++;
      }
    }

    // Résumé final
    console.log("\n" + "=".repeat(60));
    console.log("📊 RÉSUMÉ DE LA MIGRATION");
    console.log("=".repeat(60));
    console.log(`✅ Clés migrées: ${totalMigrated}`);
    console.log(`❌ Erreurs: ${totalErrors}`);
    console.log(
      `📈 Taux de réussite: ${((totalMigrated / (totalMigrated + totalErrors)) * 100).toFixed(2)}%`,
    );
    console.log("=".repeat(60) + "\n");

    if (totalMigrated > 0) {
      console.log("🎉 Migration terminée avec succès!");
    } else {
      console.log(
        "ℹ️ Aucune clé à migrer (nouvelle installation ou déjà migrée)",
      );
    }
  } catch (error) {
    console.error("❌ Erreur critique:", error);
    process.exit(1);
  } finally {
    await client.quit();
  }
}

// Lancer la migration
migrateRedisKeys().catch((error) => {
  console.error("❌ Erreur non gérée:", error);
  process.exit(1);
});
