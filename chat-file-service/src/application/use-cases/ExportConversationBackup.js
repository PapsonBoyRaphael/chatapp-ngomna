const ConversationModel = require("../../infrastructure/mongodb/models/ConversationModel");
const MessageModel = require("../../infrastructure/mongodb/models/MessageModel");

/**
 * ExportConversationBackup
 * ─────────────────────────
 * Use case : exporte UNIQUEMENT les conversations et messages
 * auxquels l'utilisateur (userId) est participant.
 *
 * Chemin MinIO : backups/{userId}/YYYY/MM/DD/backup-{timestamp}.zip
 *
 * Contenu du ZIP :
 *   - manifest.json       → métadonnées (userId, date, stats, options)
 *   - conversations.json  → documents Conversation où userId ∈ participants
 *   - messages.json       → documents Message des conversations ci-dessus
 *
 * @param {import('../../infrastructure/services/BackupService')} backupService
 */
class ExportConversationBackup {
  /**
   * @param {import('../../infrastructure/services/BackupService')} backupService
   */
  constructor(backupService) {
    this.backupService = backupService;

    // Taille de batch pour les messages (évite les OOM sur grandes bases)
    this.MESSAGE_BATCH_SIZE = 1000000;
  }

  /**
   * Exécute l'export scopé pour un utilisateur.
   *
   * @param {object} options
   * @param {string} options.userId           - REQUIS : ID de l'utilisateur dont on exporte les données
   * @param {string} [options.label]          - étiquette libre (ex: "backup-nightly")
   * @param {string} [options.conversationId] - si fourni, limite l'export à cette conversation
   *
   * @returns {Promise<{
   *   objectPath: string,
   *   bucket: string,
   *   size: number,
   *   checksum: string,
   *   createdAt: string,
   *   stats: { conversationCount: number, messageCount: number },
   *   durationMs: number
   * }>}
   */
  async execute(options = {}) {
    const { userId, label = "manual-backup", conversationId = null } = options;

    if (!userId) {
      throw new Error(
        "ExportConversationBackup: userId est requis pour un export utilisateur"
      );
    }

    const startTime = Date.now();
    const userIdStr = String(userId);

    console.log(`📦 ExportConversationBackup: démarrage export utilisateur ${userIdStr}`);
    console.log(
      `   label=${label} | conversationId=${conversationId || "toutes"}`
    );

    // ─── 1. Récupérer les conversations de l'utilisateur ──────────────
    const conversations = await this._fetchUserConversations(
      userIdStr,
      conversationId
    );
    console.log(`   ✅ Conversations récupérées : ${conversations.length}`);

    if (conversations.length === 0) {
      console.log(`   ℹ️ Aucune conversation trouvée pour ${userIdStr}`);
    }

    // ─── 2. Récupérer les messages de ces conversations ────────────────
    const conversationIds = conversations.map((c) => c._id);
    const messages = await this._fetchMessagesForConversations(conversationIds);
    console.log(`   ✅ Messages récupérés : ${messages.length}`);

    // ─── 3. Construire les métadonnées du backup ──────────────────────
    const meta = {
      userId: userIdStr,
      label,
      scope: conversationId
        ? `conversation:${conversationId}`
        : `user:${userIdStr}`,
      nodeVersion: process.version,
      serviceVersion: process.env.npm_package_version || "1.0.0",
    };

    // ─── 4. Créer le backup via BackupService ─────────────────────────
    // Le chemin MinIO est scopé par userId
    const result = await this.backupService.createBackup(
      conversations,
      messages,
      meta,
      { userIdScope: userIdStr } // préfixe le chemin MinIO par userId
    );

    const totalDuration = Date.now() - startTime;
    console.log(
      `✅ ExportConversationBackup: export user ${userIdStr} terminé en ${totalDuration}ms → ${result.objectPath}`
    );

    return {
      ...result,
      durationMs: totalDuration,
    };
  }

  // ─────────────────────────────────────────────
  // MÉTHODES PRIVÉES
  // ─────────────────────────────────────────────

  /**
   * Récupère toutes les conversations où userId est participant.
   * Supporte les deux formes d'ID (string et number) comme le reste du projet.
   *
   * @param {string} userId
   * @param {string|null} conversationId - filtre optionnel sur une seule conv
   * @returns {Promise<object[]>}
   */
  async _fetchUserConversations(userId, conversationId = null) {
    try {
      // Gérer les deux formes possibles de l'ID (string vs number)
      const userIdVariants = [
        userId,
        isNaN(userId) ? userId : Number(userId),
      ].filter((v, i, arr) => arr.indexOf(v) === i);

      const filter = {
        participants: { $in: userIdVariants },
      };

      if (conversationId) {
        filter._id = conversationId;
      }

      const docs = await ConversationModel.find(filter)
        .lean()
        .sort({ lastMessageAt: -1 });

      return docs;
    } catch (err) {
      console.error(
        `❌ ExportConversationBackup: erreur fetch conversations user ${userId}:`,
        err.message
      );
      throw new Error(
        `Impossible de récupérer les conversations de l'utilisateur ${userId}: ${err.message}`
      );
    }
  }

  /**
   * Récupère tous les messages appartenant aux conversations données,
   * par batch de MESSAGE_BATCH_SIZE pour éviter les OOM.
   *
   * @param {string[]} conversationIds - liste des _id de conversations
   * @returns {Promise<object[]>}
   */
  async _fetchMessagesForConversations(conversationIds) {
    if (!conversationIds || conversationIds.length === 0) {
      return [];
    }

    const allMessages = [];
    let skip = 0;
    let hasMore = true;

    const filter = {
      conversationId: { $in: conversationIds },
    };

    try {
      while (hasMore) {
        const batch = await MessageModel.find(filter)
          .lean()
          .sort({ createdAt: 1 })
          .skip(skip)
          .limit(this.MESSAGE_BATCH_SIZE);

        if (batch.length === 0) {
          hasMore = false;
        } else {
          allMessages.push(...batch);
          skip += batch.length;

          if (batch.length < this.MESSAGE_BATCH_SIZE) {
            hasMore = false;
          }

          console.log(
            `   📥 Messages chargés : ${allMessages.length} (batch ${batch.length})`
          );
        }
      }

      return allMessages;
    } catch (err) {
      console.error(
        "❌ ExportConversationBackup: erreur fetch messages:",
        err.message
      );
      throw new Error(
        `Impossible de récupérer les messages: ${err.message}`
      );
    }
  }
}

module.exports = ExportConversationBackup;
