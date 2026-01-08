const axios = require("axios");
const { RedisManager } = require("@chatapp-ngomna/shared");

/**
 * UserCacheService - Service intelligent de cache utilisateur avec fallback
 *
 * Stratégie multi-niveaux :
 * 1. Cache Redis (rapide, TTL 24h)
 * 2. Fallback auth-user-service (si cache miss)
 * 3. Cache warming automatique
 *
 * Gère élégamment les utilisateurs hors ligne
 */
class UserCacheService {
  constructor(options = {}) {
    this.cachePrefix = options.cachePrefix || "user:cache";
    this.cacheTTL = options.cacheTTL || 24 * 3600; // 24 heures par défaut
    this.authServiceUrl =
      options.authServiceUrl ||
      process.env.AUTH_USER_SERVICE_URL ||
      "http://localhost:8001";
    this.timeout = options.timeout || 5000;
  }

  /**
   * Récupère les infos d'un utilisateur avec fallback intelligent
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<Object>} - { userId, name, avatar, matricule }
   */
  async fetchUserInfo(userId) {
    if (!userId) {
      return {
        userId: null,
        name: "Utilisateur inconnu",
        avatar: null,
        matricule: null,
      };
    }

    try {
      // Étape 1 : Tentative lecture Redis
      const cached = await this._getFromCache(userId);
      if (cached) {
        console.log(`✅ [UserCache] Hit Redis: ${userId}`);
        return cached;
      }

      // Étape 2 : Cache miss → Fallback auth-user-service
      console.log(`⚠️ [UserCache] Miss Redis → Fallback HTTP: ${userId}`);
      const userInfo = await this._fetchFromAuthService(userId);

      // Étape 3 : Cache warming (repopulation Redis)
      if (userInfo && userInfo.name) {
        await this._saveToCache(userId, userInfo);
      }

      return userInfo;
    } catch (error) {
      console.warn(
        `⚠️ [UserCache] Erreur fetchUserInfo pour ${userId}:`,
        error.message
      );
      return {
        userId,
        name: "Utilisateur inconnu",
        avatar: null,
        matricule: userId,
      };
    }
  }

  /**
   * Récupère les infos de plusieurs utilisateurs en batch
   * @param {Array<string>} userIds - Liste des IDs
   * @returns {Promise<Array>} - Tableau d'infos utilisateurs
   */
  async fetchUsersInfo(userIds) {
    if (!userIds || userIds.length === 0) return [];

    try {
      // Étape 1 : Lecture batch depuis Redis
      const results = [];
      const missingIds = [];

      for (const userId of userIds) {
        const cached = await this._getFromCache(userId);
        if (cached) {
          results.push(cached);
        } else {
          missingIds.push(userId);
          results.push({
            userId,
            name: null, // placeholder temporaire
            avatar: null,
            matricule: userId,
          });
        }
      }

      console.log(
        `📊 [UserCache] Batch: ${results.length - missingIds.length} hits, ${
          missingIds.length
        } miss`
      );

      // Étape 2 : Fallback HTTP pour les utilisateurs manquants
      if (missingIds.length > 0) {
        const fetchedUsers = await this._fetchBatchFromAuthService(missingIds);

        // Mise à jour des résultats + cache warming
        for (const fetchedUser of fetchedUsers) {
          const index = results.findIndex(
            (r) => r.userId === fetchedUser.userId
          );
          if (index !== -1) {
            results[index] = fetchedUser;
          }

          // Repopulate le cache
          if (fetchedUser.name) {
            await this._saveToCache(fetchedUser.userId, fetchedUser);
          }
        }
      }

      return results;
    } catch (error) {
      console.error(`❌ [UserCache] Erreur fetchUsersInfo:`, error.message);
      // Fallback gracieux
      return userIds.map((userId) => ({
        userId,
        name: "Utilisateur inconnu",
        avatar: null,
        matricule: userId,
      }));
    }
  }

  /**
   * Lit depuis le cache Redis
   * @private
   */
  async _getFromCache(userId) {
    try {
      const redis = RedisManager?.clients?.main;
      if (!redis) return null;

      const key = `${this.cachePrefix}:${userId}`;
      const data = await redis.hGetAll(key);

      if (!data || Object.keys(data).length === 0) {
        return null;
      }

      return {
        userId,
        name: data.fullName || data.name || "Utilisateur inconnu",
        avatar: data.avatar || null,
        matricule: data.matricule || userId,
      };
    } catch (error) {
      console.warn(
        `⚠️ [UserCache] Erreur lecture Redis ${userId}:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Sauvegarde dans le cache Redis avec TTL
   * @private
   */
  async _saveToCache(userId, userInfo) {
    try {
      const redis = RedisManager?.clients?.main;
      if (!redis) return;

      const key = `${this.cachePrefix}:${userId}`;
      const cacheData = {
        fullName: userInfo.name || "Utilisateur inconnu",
        avatar: userInfo.avatar || "",
        matricule: userInfo.matricule || userId,
        updatedAt: Date.now().toString(),
      };

      await redis.hSet(key, cacheData);
      await redis.expire(key, this.cacheTTL);

      console.log(`💾 [UserCache] Cached ${userId} (TTL: ${this.cacheTTL}s)`);
    } catch (error) {
      console.warn(
        `⚠️ [UserCache] Erreur sauvegarde Redis ${userId}:`,
        error.message
      );
    }
  }

  /**
   * Récupère un utilisateur depuis auth-user-service
   * @private
   */
  async _fetchFromAuthService(userId) {
    try {
      const response = await axios.get(`${this.authServiceUrl}/${userId}`, {
        timeout: this.timeout,
      });

      const user = response.data;
      const fullName = user.nom
        ? `${user.prenom || ""} ${user.nom}`.trim()
        : user.name || user.username || "Utilisateur inconnu";

      return {
        userId,
        name: fullName,
        avatar: user.profile_pic || user.avatar || null,
        matricule: user.matricule || userId,
      };
    } catch (error) {
      if (error.response?.status === 404) {
        console.warn(`⚠️ [UserCache] Utilisateur ${userId} introuvable`);
      } else {
        console.warn(`⚠️ [UserCache] Erreur HTTP ${userId}:`, error.message);
      }

      return {
        userId,
        name: "Utilisateur inconnu",
        avatar: null,
        matricule: userId,
      };
    }
  }

  /**
   * Récupère plusieurs utilisateurs depuis auth-user-service
   * Utilise route batch si disponible, sinon parallélise les requêtes
   * @private
   */
  async _fetchBatchFromAuthService(userIds) {
    try {
      // Tentative route batch (si disponible)
      try {
        const response = await axios.get(
          `${this.authServiceUrl}/api/users/batch`,
          {
            params: { ids: userIds.join(",") },
            timeout: this.timeout,
          }
        );

        const users = response.data.users || [];
        return users.map((user) => ({
          userId: user.id || user._id?.toString(),
          name: user.nom
            ? `${user.prenom || ""} ${user.nom}`.trim()
            : user.name || "Utilisateur inconnu",
          avatar: user.profile_pic || user.avatar || null,
          matricule: user.matricule || user.id,
        }));
      } catch (batchError) {
        // Fallback : requêtes parallèles individuelles
        console.log(
          `⚠️ [UserCache] Route batch indisponible, fallback requêtes parallèles`
        );
        const requests = userIds.map((id) => this._fetchFromAuthService(id));
        return await Promise.all(requests);
      }
    } catch (error) {
      console.error(`❌ [UserCache] Erreur batch fetch:`, error.message);
      return userIds.map((userId) => ({
        userId,
        name: "Utilisateur inconnu",
        avatar: null,
        matricule: userId,
      }));
    }
  }

  /**
   * Invalide le cache d'un utilisateur (après update profil)
   */
  async invalidateUser(userId) {
    try {
      const redis = RedisManager?.clients?.main;
      if (!redis) return;

      const key = `${this.cachePrefix}:${userId}`;
      await redis.del(key);
      console.log(`🗑️ [UserCache] Invalidated ${userId}`);
    } catch (error) {
      console.warn(
        `⚠️ [UserCache] Erreur invalidation ${userId}:`,
        error.message
      );
    }
  }

  /**
   * Warm le cache pour un utilisateur (après login/update)
   */
  async warmCache(userId, userData) {
    try {
      const userInfo = {
        userId,
        name: userData.fullName || userData.name || "Utilisateur inconnu",
        avatar: userData.avatar || null,
        matricule: userData.matricule || userId,
      };

      await this._saveToCache(userId, userInfo);
      console.log(`🔥 [UserCache] Warmed ${userId}`);
    } catch (error) {
      console.warn(
        `⚠️ [UserCache] Erreur cache warming ${userId}:`,
        error.message
      );
    }
  }
}

module.exports = UserCacheService;
