const ConversationModel = require("../../infrastructure/mongodb/models/ConversationModel");
const MessageModel = require("../../infrastructure/mongodb/models/MessageModel");
const unzipper = require("unzipper");

/**
 * RestoreConversationBackup
 * ──────────────────────────
 * Use case : restaure conversations et messages depuis un backup ZIP stocké sur MinIO.
 *
 * Stratégie :
 *   - Télécharge le ZIP depuis MinIO via BackupService
 *   - Extrait conversations.json et messages.json en mémoire
 *   - Réinsère en base via bulkWrite (upsert par _id)
 *   - Invalide optionnellement le cache Redis
 *
 * Note : Ce use case utilise upsert → il ne supprime pas les données existantes.
 *        Il crée ou met à jour les documents par leur _id MongoDB.
 *
 * @param {import('../../infrastructure/services/BackupService')} backupService
 * @param {object} [cacheService] - optionnel, pour invalider le cache après restauration
 */
class RestoreConversationBackup {
  /**
   * @param {import('../../infrastructure/services/BackupService')} backupService
   * @param {object|null} [cacheService]
   */
  constructor(backupService, cacheService = null) {
    this.backupService = backupService;
    this.cacheService = cacheService;

    // Taille de batch pour bulkWrite (évite les timeouts MongoDB)
    this.BATCH_SIZE = 5000;
  }

  /**
   * Restaure un backup complet.
   *
   * @param {string} objectPath - chemin de l'objet dans le bucket backup (ex: "backups/2025/01/15/backup-123.zip")
   * @param {object} [options]
   * @param {boolean} [options.invalidateCache=true] - invalider le cache Redis après restauration
   * @param {boolean} [options.dryRun=false]         - ne pas écrire en base, juste valider le backup
   *
   * @returns {Promise<{
   *   manifest: object,
   *   restored: { conversations: number, messages: number },
   *   durationMs: number,
   *   dryRun: boolean
   * }>}
   */
  async execute(objectPath, options = {}) {
    const { invalidateCache = true, dryRun = false } = options;

    const startTime = Date.now();

    console.log(`🔄 RestoreConversationBackup: démarrage restauration...`);
    console.log(
      `   objectPath=${objectPath} | dryRun=${dryRun} | invalidateCache=${invalidateCache}`
    );

    // ─── 1. Télécharger et extraire le ZIP depuis MinIO ────────────────
    const { manifest, conversations, messages } =
      await this._downloadAndExtract(objectPath);

    console.log(
      `   📄 Manifest: ${manifest.stats?.conversationCount} conversations, ${manifest.stats?.messageCount} messages`
    );
    console.log(
      `   📦 Contenu réel: ${conversations.length} conversations, ${messages.length} messages`
    );

    if (dryRun) {
      const duration = Date.now() - startTime;
      console.log(
        `✅ RestoreConversationBackup (dry run): validation OK en ${duration}ms`
      );
      return {
        manifest,
        restored: { conversations: 0, messages: 0 },
        durationMs: duration,
        dryRun: true,
      };
    }

    // ─── 2. Upsert conversations en base ──────────────────────────────
    const restoredConversations = await this._upsertDocuments(
      ConversationModel,
      conversations,
      "conversations"
    );

    // ─── 3. Upsert messages en base ───────────────────────────────────
    const restoredMessages = await this._upsertDocuments(
      MessageModel,
      messages,
      "messages"
    );

    // ─── 4. Invalider le cache Redis ──────────────────────────────────
    if (invalidateCache && this.cacheService) {
      await this._invalidateCache(conversations);
    }

    const duration = Date.now() - startTime;
    console.log(
      `✅ RestoreConversationBackup: restauration terminée en ${duration}ms`
    );
    console.log(
      `   Conversations restaurées : ${restoredConversations} | Messages restaurés : ${restoredMessages}`
    );

    return {
      manifest,
      restored: {
        conversations: restoredConversations,
        messages: restoredMessages,
      },
      durationMs: duration,
      dryRun: false,
    };
  }

  // ─────────────────────────────────────────────
  // MÉTHODES PRIVÉES
  // ─────────────────────────────────────────────

  /**
   * Télécharge le ZIP depuis MinIO et extrait les fichiers en mémoire.
   *
   * @param {string} objectPath
   * @returns {Promise<{manifest: object, conversations: object[], messages: object[]}>}
   */
  async _downloadAndExtract(objectPath) {
    const stream = await this.backupService.downloadBackup(objectPath);

    return new Promise((resolve, reject) => {
      const files = {};

      stream
        .pipe(unzipper.Parse())
        .on("entry", (entry) => {
          const fileName = entry.path;
          const chunks = [];

          entry.on("data", (chunk) => chunks.push(chunk));
          entry.on("end", () => {
            try {
              files[fileName] = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            } catch (err) {
              console.warn(
                `⚠️ RestoreConversationBackup: impossible de parser ${fileName}: ${err.message}`
              );
              files[fileName] = null;
            }
          });
          entry.on("error", reject);
        })
        .on("finish", () => {
          const manifest = files["manifest.json"];
          const conversations = files["conversations.json"];
          const messages = files["messages.json"];

          if (!manifest) {
            return reject(
              new Error(
                "RestoreConversationBackup: manifest.json manquant dans le backup"
              )
            );
          }
          if (!Array.isArray(conversations)) {
            return reject(
              new Error(
                "RestoreConversationBackup: conversations.json invalide ou manquant"
              )
            );
          }
          if (!Array.isArray(messages)) {
            return reject(
              new Error(
                "RestoreConversationBackup: messages.json invalide ou manquant"
              )
            );
          }

          resolve({ manifest, conversations, messages });
        })
        .on("error", reject);
    });
  }

  /**
   * Upsert par batch via bulkWrite (replaceOne + upsert: true).
   * Performant et idempotent.
   *
   * @param {import('mongoose').Model} Model
   * @param {object[]} documents
   * @param {string} label  - pour les logs
   * @returns {Promise<number>} Nombre de documents traités
   */
  async _upsertDocuments(Model, documents, label) {
    if (!documents || documents.length === 0) {
      console.log(`   ℹ️ Aucun document ${label} à restaurer`);
      return 0;
    }

    let total = 0;

    for (let i = 0; i < documents.length; i += this.BATCH_SIZE) {
      const batch = documents.slice(i, i + this.BATCH_SIZE);

      const operations = batch.map((doc) => ({
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true,
        },
      }));

      try {
        const result = await Model.bulkWrite(operations, { ordered: false });
        total += result.upsertedCount + result.modifiedCount + result.matchedCount;

        console.log(
          `   📝 ${label}: batch ${Math.floor(i / this.BATCH_SIZE) + 1} → upserted=${result.upsertedCount} | modified=${result.modifiedCount}`
        );
      } catch (err) {
        console.error(
          `❌ RestoreConversationBackup: erreur bulkWrite ${label} (batch ${i}):`,
          err.message
        );
        throw new Error(
          `Erreur restauration ${label}: ${err.message}`
        );
      }
    }

    return total;
  }

  /**
   * Invalide les clés de cache Redis pour les conversations restaurées.
   *
   * @param {object[]} conversations
   */
  async _invalidateCache(conversations) {
    if (!this.cacheService) return;

    let invalidated = 0;

    for (const conv of conversations) {
      try {
        const cacheKey = `conversation:${conv._id}`;
        await this.cacheService.delete(cacheKey);
        invalidated++;
      } catch (err) {
        console.warn(
          `⚠️ RestoreConversationBackup: erreur invalidation cache ${conv._id}: ${err.message}`
        );
      }
    }

    console.log(
      `   🔄 Cache Redis invalidé pour ${invalidated} conversations`
    );
  }
}

module.exports = RestoreConversationBackup;
