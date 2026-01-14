const RedisManager = require("../redis/RedisManager");

/**
 * UserCache - Cache centralisé des profils utilisateurs dans Redis
 *
 * Stratégie :
 * - Stockage dans des Redis Hashes (HSET/HGETALL)
 * - Clé: user:profile:{userId}
 * - TTL par défaut: 7 jours
 * - Champs: fullName, avatar, matricule, ministere, updatedAt
 *
 * Avantages :
 * - Latence < 1ms pour les lectures
 * - Réduction des appels HTTP entre services
 * - Cache partagé entre tous les services
 */
class UserCache {
  constructor(options = {}) {
    this.prefix = options.prefix || "user:profile:";
    this.defaultTTL = options.defaultTTL || 7 * 24 * 3600; // 7 jours
    this.redis = null;
  }

  /**
   * Initialise le cache avec le client Redis
   */
  async initialize() {
    this.redis = RedisManager?.clients?.main;

    if (!this.redis) {
      console.warn("⚠️ [UserCache] Redis non disponible");
      return false;
    }

    console.log("✅ [UserCache] Initialisé avec succès");
    return true;
  }

  /**
   * Sauvegarde un profil utilisateur dans le cache
   * @param {Object} user - Objet utilisateur
   * @returns {Promise<void>}
   */
  async set(user) {
    if (!this.redis || !user || !user.id) {
      console.warn("⚠️ [UserCache] Impossible de sauvegarder:", {
        hasRedis: !!this.redis,
        hasUser: !!user,
      });
      return;
    }

    try {
      const key = `${this.prefix}${user.id}`;
      const data = {
        fullName:
          `${user.prenom || ""} ${user.nom || ""}`.trim() ||
          user.name ||
          user.fullName ||
          "Utilisateur inconnu",
        avatar: user.avatar || user.profile_pic || "",
        matricule: user.matricule || "",
        ministere: user.ministere || "",
        sexe: user.sexe || "",
        updatedAt: Date.now().toString(),
      };

      // Sauvegarde dans Redis Hash
      await this.redis.hSet(key, data);

      // Définir le TTL
      await this.redis.expire(key, this.defaultTTL);

      // console.log(
      //   `✅ [UserCache] Profil mis en cache: ${user.id} (${data.fullName})`
      // );
    } catch (error) {
      console.error(
        `❌ [UserCache] Erreur sauvegarde ${user.id}:`,
        error.message
      );
    }
  }

  /**
   * Récupère un profil utilisateur depuis le cache
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<Object|null>} Profil ou null si absent
   */
  async get(userId) {
    if (!this.redis || !userId) {
      return null;
    }

    try {
      const key = `${this.prefix}${userId}`;
      const data = await this.redis.hGetAll(key);

      if (!data || Object.keys(data).length === 0) {
        return null; // Cache miss
      }

      return {
        userId,
        fullName: data.fullName || "Utilisateur inconnu",
        avatar: data.avatar || null,
        matricule: data.matricule || userId,
        ministere: data.ministere || "",
        sexe: data.sexe || "",
        updatedAt: data.updatedAt ? parseInt(data.updatedAt) : null,
      };
    } catch (error) {
      console.error(`❌ [UserCache] Erreur lecture ${userId}:`, error.message);
      return null;
    }
  }

  /**
   * Récupère plusieurs profils utilisateurs en batch (optimisé avec pipeline)
   * @param {Array<string>} userIds - Liste des IDs
   * @returns {Promise<Array<Object>>} Liste des profils
   */
  async batchGet(userIds) {
    if (!this.redis || !userIds || userIds.length === 0) {
      return [];
    }

    try {
      const pipeline = this.redis.multi();
      const keys = userIds.map((id) => `${this.prefix}${id}`);

      keys.forEach((key) => {
        pipeline.hGetAll(key);
      });

      const results = await pipeline.exec();

      return results.map((result, i) => {
        // result est un tableau [error, data]
        const [err, data] = result || [null, null];

        if (err || !data || Object.keys(data).length === 0) {
          return {
            userId: userIds[i],
            fullName: "Utilisateur inconnu",
            avatar: null,
            matricule: userIds[i],
            ministere: "",
          };
        }

        return {
          userId: userIds[i],
          fullName: data.fullName || "Utilisateur inconnu",
          avatar: data.avatar || null,
          matricule: data.matricule || userIds[i],
          ministere: data.ministere || "",
          sexe: data.sexe || "",
          updatedAt: data.updatedAt ? parseInt(data.updatedAt) : null,
        };
      });
    } catch (error) {
      console.error(`❌ [UserCache] Erreur batchGet:`, error.message);
      return userIds.map((userId) => ({
        userId,
        fullName: "Utilisateur inconnu",
        avatar: null,
        matricule: userId,
        ministere: "",
      }));
    }
  }

  /**
   * Invalide le cache d'un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<void>}
   */
  async invalidate(userId) {
    if (!this.redis || !userId) {
      return;
    }

    try {
      const key = `${this.prefix}${userId}`;
      await this.redis.del(key);
      console.log(`🗑️ [UserCache] Cache invalidé: ${userId}`);
    } catch (error) {
      console.error(
        `❌ [UserCache] Erreur invalidation ${userId}:`,
        error.message
      );
    }
  }

  /**
   * Invalide plusieurs utilisateurs en batch
   * @param {Array<string>} userIds - Liste des IDs
   * @returns {Promise<void>}
   */
  async batchInvalidate(userIds) {
    if (!this.redis || !userIds || userIds.length === 0) {
      return;
    }

    try {
      const keys = userIds.map((id) => `${this.prefix}${id}`);
      await this.redis.del(keys);
      console.log(`🗑️ [UserCache] ${userIds.length} caches invalidés`);
    } catch (error) {
      console.error(`❌ [UserCache] Erreur batchInvalidate:`, error.message);
    }
  }

  /**
   * Compte le nombre d'utilisateurs en cache
   * @returns {Promise<number>}
   */
  async count() {
    if (!this.redis) {
      return 0;
    }

    try {
      let cursor = "0";
      let count = 0;

      do {
        const result = await this.redis.scan(cursor, {
          MATCH: `${this.prefix}*`,
          COUNT: 1000,
        });

        cursor = result.cursor.toString();
        count += result.keys.length;
      } while (cursor !== "0");

      return count;
    } catch (error) {
      console.error(`❌ [UserCache] Erreur count:`, error.message);
      return 0;
    }
  }

  /**
   * Vérifie si un utilisateur est en cache
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<boolean>}
   */
  async exists(userId) {
    if (!this.redis || !userId) {
      return false;
    }

    try {
      const key = `${this.prefix}${userId}`;
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      console.error(`❌ [UserCache] Erreur exists ${userId}:`, error.message);
      return false;
    }
  }

  /**
   * Récupère les statistiques du cache
   * @returns {Promise<Object>}
   */
  async getStats() {
    try {
      const count = await this.count();

      return {
        totalCached: count,
        prefix: this.prefix,
        ttl: this.defaultTTL,
        ttlHours: Math.floor(this.defaultTTL / 3600),
      };
    } catch (error) {
      console.error(`❌ [UserCache] Erreur getStats:`, error.message);
      return {
        totalCached: 0,
        prefix: this.prefix,
        ttl: this.defaultTTL,
        ttlHours: Math.floor(this.defaultTTL / 3600),
      };
    }
  }
}

// Export singleton
module.exports = new UserCache();
