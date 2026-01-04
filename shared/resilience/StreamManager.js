/**
 * StreamManager - Gestionnaire centralisé des Redis Streams
 * ✅ Configuration des streams
 * ✅ Ajout avec MAXLEN automatique
 * ✅ Consumer groups
 * ✅ Statistiques
 */

class StreamManager {
  constructor(redisClient, options = {}) {
    this.redis = redisClient;

    // ✅ CONFIGURATION DES STREAMS - RÉSILIENCE
    this.STREAMS = {
      WAL: options.walStream || "wal:stream",
      RETRY: options.retryStream || "retry:stream",
      DLQ: options.dlqStream || "dlq:stream",
      FALLBACK: options.fallbackStream || "fallback:stream",
      MESSAGES: options.messagesStream || "messages:stream",
    };

    // ✅ MULTI-STREAMS PAR TYPE
    this.MULTI_STREAMS = {
      PRIVATE: options.privateStream || "stream:messages:private",
      GROUP: options.groupStream || "stream:messages:group",
      TYPING: options.typingStream || "stream:events:typing",
      READ_RECEIPTS: options.readReceiptsStream || "stream:events:read",
      NOTIFICATIONS: options.notificationsStream || "stream:messages:system",
    };

    // ✅ CONFIGURATION DES TAILLES MAXIMALES
    this.STREAM_MAXLEN = {
      [this.STREAMS.MESSAGES]: options.messagesMaxLen || 5000,
      [this.STREAMS.RETRY]: options.retryMaxLen || 5000,
      [this.STREAMS.WAL]: options.walMaxLen || 10000,
      [this.STREAMS.FALLBACK]: options.fallbackMaxLen || 5000,
      [this.STREAMS.DLQ]: options.dlqMaxLen || 1000,
      [this.MULTI_STREAMS.PRIVATE]: options.privateMaxLen || 10000,
      [this.MULTI_STREAMS.GROUP]: options.groupMaxLen || 20000,
      [this.MULTI_STREAMS.TYPING]: options.typingMaxLen || 2000,
      [this.MULTI_STREAMS.READ_RECEIPTS]: options.readReceiptsMaxLen || 5000,
      [this.MULTI_STREAMS.NOTIFICATIONS]: options.notificationsMaxLen || 2000,
    };

    this.consumerGroupsInitialized = false;

    console.log("✅ StreamManager initialisé");
  }

  /**
   * ✅ AJOUTER À UN STREAM AVEC MAXLEN APPLIQUÉ IMMÉDIATEMENT
   * Redis gère le trim automatiquement à chaque écriture
   */
  async addToStream(streamName, fields) {
    if (!this.redis) return null;

    try {
      // ✅ NORMALISER LES CHAMPS - TOUS LES CHAMPS DOIVENT ÊTRE DES CHAÎNES
      const normalizedFields = {};

      for (const [key, value] of Object.entries(fields || {})) {
        let stringValue = "";

        if (value === null || value === undefined) {
          stringValue = "";
        } else if (typeof value === "string") {
          stringValue = value;
        } else if (typeof value === "object") {
          stringValue = JSON.stringify(value);
        } else {
          stringValue = String(value);
        }

        normalizedFields[key] = stringValue;
      }

      // ✅ VÉRIFIER QUE LES CHAMPS CRITIQUES NE SONT PAS VIDES
      if (
        normalizedFields.data === "" ||
        normalizedFields.data === "undefined"
      ) {
        console.warn(
          `⚠️ ATTENTION: Champ 'data' vide ou undefined dans ${streamName}`,
          { fields: Object.keys(fields) }
        );
      }

      // ✅ ÉCRIRE DANS LE STREAM
      const streamId = await this.redis.xAdd(streamName, "*", normalizedFields);

      // ✅ TRIMMER LE STREAM APRÈS (ne pas ralentir la rédaction)
      const maxLen = this.STREAM_MAXLEN[streamName];
      if (maxLen !== undefined) {
        try {
          this.redis.xTrim(streamName, "~", maxLen).catch(() => {
            // Ignorer les erreurs de trim
          });
        } catch (trimErr) {
          // Ignorer
        }
      }

      return streamId;
    } catch (err) {
      console.warn(`⚠️ Erreur addToStream ${streamName}:`, err.message);
      try {
        const normalizedFields = {};
        for (const [key, value] of Object.entries(fields || {})) {
          normalizedFields[key] = String(
            value === null || value === undefined ? "" : value
          );
        }
        return await this.redis.xAdd(streamName, "*", normalizedFields);
      } catch (retryErr) {
        console.error(
          `❌ Échec complet addToStream ${streamName}:`,
          retryErr.message
        );
        return null;
      }
    }
  }

  /**
   * ✅ NORMALISER LES CHAMPS POUR REDIS
   */
  _normalizeFields(fields) {
    const normalizedFields = {};

    for (const [key, value] of Object.entries(fields || {})) {
      let stringValue = "";

      if (value === null || value === undefined) {
        stringValue = "";
      } else if (typeof value === "string") {
        stringValue = value;
      } else if (typeof value === "object") {
        stringValue = JSON.stringify(value);
      } else {
        stringValue = String(value);
      }

      normalizedFields[key] = stringValue;
    }

    return normalizedFields;
  }

  /**
   * ✅ INITIALISER LES CONSUMER GROUPS
   */
  async initConsumerGroups() {
    if (this.consumerGroupsInitialized) {
      console.log("ℹ️ Consumer groups déjà initialisés");
      return;
    }

    try {
      const groupConfigs = {
        [this.STREAMS.RETRY]: "retry-workers",
        [this.STREAMS.DLQ]: "dlq-processors",
        [this.STREAMS.FALLBACK]: "fallback-workers",
        [this.MULTI_STREAMS.PRIVATE]: "delivery-private",
        [this.MULTI_STREAMS.GROUP]: "delivery-group",
        [this.MULTI_STREAMS.TYPING]: "delivery-typing",
        [this.MULTI_STREAMS.READ_RECEIPTS]: "delivery-read",
        [this.MULTI_STREAMS.NOTIFICATIONS]: "delivery-notifications",
      };

      for (const [stream, group] of Object.entries(groupConfigs)) {
        try {
          await this.redis.xGroupCreate(stream, group, "$", {
            MKSTREAM: true,
          });
          console.log(`✅ Stream ${stream} + Consumer group ${group} créés`);
        } catch (err) {
          if (err.message.includes("BUSYGROUP")) {
            console.log(`ℹ️ Consumer group ${group} existe déjà`);
          } else {
            console.warn(`⚠️ Erreur création groupe:`, err.message);
          }
        }
      }

      this.consumerGroupsInitialized = true;
    } catch (err) {
      console.warn("⚠️ Erreur init consumer groups:", err.message);
      this.consumerGroupsInitialized = false;
    }
  }

  /**
   * ✅ LIRE DEPUIS UN STREAM
   */
  async readFromStream(streamName, options = {}) {
    if (!this.redis) return [];

    try {
      const count = options.count || 10;
      const id = options.id || "0";

      const messages = await this.redis.xRead([{ key: streamName, id }], {
        COUNT: count,
        BLOCK: options.block || 0,
      });

      if (!messages || messages.length === 0) return [];

      return messages[0]?.messages || [];
    } catch (error) {
      console.error(`❌ Erreur lecture stream ${streamName}:`, error.message);
      return [];
    }
  }

  /**
   * ✅ LIRE AVEC CONSUMER GROUP
   */
  async readFromGroup(streamName, groupName, consumerName, options = {}) {
    if (!this.redis) return [];

    try {
      const messages = await this.redis.xReadGroup(
        groupName,
        consumerName,
        [{ key: streamName, id: ">" }],
        { COUNT: options.count || 10, BLOCK: options.block || 0 }
      );

      if (!messages || messages.length === 0) return [];

      return messages[0]?.messages || [];
    } catch (error) {
      if (error.message.includes("NOGROUP")) {
        console.warn(`⚠️ Consumer group ${groupName} n'existe pas`);
        await this.initConsumerGroups();
      }
      return [];
    }
  }

  /**
   * ✅ SUPPRIMER UN MESSAGE DU STREAM
   */
  async deleteFromStream(streamName, messageId) {
    if (!this.redis) return false;

    try {
      await this.redis.xDel(streamName, messageId);
      return true;
    } catch (error) {
      console.error(`❌ Erreur suppression message:`, error.message);
      return false;
    }
  }

  /**
   * ✅ OBTENIR LES STATISTIQUES DES STREAMS
   */
  async getStreamStats() {
    if (!this.redis) return null;

    try {
      const stats = {};

      for (const [streamName, maxLen] of Object.entries(this.STREAM_MAXLEN)) {
        try {
          const length = await this.redis.xLen(streamName);
          stats[streamName] = {
            current: length,
            max: maxLen,
            usage: ((length / maxLen) * 100).toFixed(2) + "%",
          };
        } catch (err) {
          stats[streamName] = { error: err.message };
        }
      }

      return stats;
    } catch (error) {
      console.error("❌ Erreur getStreamStats:", error);
      return null;
    }
  }

  /**
   * ✅ OBTENIR LA LONGUEUR D'UN STREAM
   */
  async getStreamLength(streamName) {
    if (!this.redis) return 0;

    try {
      return await this.redis.xLen(streamName);
    } catch (error) {
      return 0;
    }
  }

  /**
   * ✅ LIRE UNE PLAGE DE MESSAGES
   */
  async getStreamRange(streamName, start = "-", end = "+", count = 100) {
    if (!this.redis) return [];

    try {
      return await this.redis.xRange(streamName, start, end, { COUNT: count });
    } catch (error) {
      console.error(`❌ Erreur xRange ${streamName}:`, error.message);
      return [];
    }
  }

  /**
   * ✅ LIRE LES DERNIERS MESSAGES (ordre inverse)
   */
  async getStreamReverseRange(streamName, count = 10) {
    if (!this.redis) return [];

    try {
      return await this.redis.xRevRange(streamName, "+", "-", { COUNT: count });
    } catch (error) {
      console.error(`❌ Erreur xRevRange ${streamName}:`, error.message);
      return [];
    }
  }

  /**
   * ✅ PARSER LES CHAMPS D'UN MESSAGE STREAM
   */
  parseStreamMessage(entry) {
    if (Array.isArray(entry)) {
      const id = entry[0];
      const fields = Object.fromEntries(
        Array.from({ length: entry[1].length / 2 }, (_, i) => [
          entry[1][i * 2],
          entry[1][i * 2 + 1],
        ])
      );
      return { id, fields };
    }
    return { id: entry.id, fields: entry.message };
  }
}

module.exports = StreamManager;
