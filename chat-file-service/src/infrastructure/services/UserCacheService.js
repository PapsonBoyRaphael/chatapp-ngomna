const axios = require("axios");
const { UserCache } = require("../../../shared");

/**
 * UserCacheService - Service intelligent de cache utilisateur avec fallback
 *
 * Stratégie multi-niveaux :
 * 1. Cache Redis partagé via @chatapp-ngomna/shared/UserCache (rapide, TTL 7j)
 * 2. Fallback auth-user-service (si cache miss)
 * 3. Cache warming automatique
 *
 * ✅ NOUVELLE VERSION : Utilise le cache partagé centralisé
 */
class UserCacheService {
  constructor(options = {}) {
    this.authServiceUrl =
      options.authServiceUrl ||
      process.env.AUTH_USER_SERVICE_URL ||
      "http://localhost:8001";
    this.timeout = options.timeout || 5000;
    this.userCache = UserCache; // Cache partagé depuis shared module
  }

  _buildCachePayload(user) {
    const userId = user.userId || user.id;
    const nom = user.nom || null;
    const prenom = user.prenom || null;
    const fullName = nom
      ? `${prenom || ""} ${nom}`.trim()
      : user.fullName || user.name || "Utilisateur inconnu";

    return {
      id: userId,
      nom,
      prenom,
      fullName,
      avatar: user.avatar || user.profile_pic || null,
      matricule: user.matricule || userId,
      ministere: user.ministere || "",
      sexe: user.sexe || "",
    };
  }

  _mapCacheToResponse(cached, fallbackId) {
    if (!cached) {
      return null;
    }

    const userId = cached.id || cached.userId || fallbackId;
    const fullName = cached.fullName
      ? cached.fullName
      : cached.nom
        ? `${cached.prenom || ""} ${cached.nom}`.trim()
        : "Utilisateur inconnu";

    return {
      userId,
      name: fullName,
      nom: cached.nom || null,
      prenom: cached.prenom || null,
      avatar: cached.avatar || null,
      matricule: cached.matricule || userId,
      ministere: cached.ministere || "",
      sexe: cached.sexe || "",
    };
  }

  _normalizeAuthUser(user, fallbackId) {
    const userId = user.id || user._id?.toString() || fallbackId;
    const nom = user.nom || null;
    const prenom = user.prenom || null;
    const fullName = nom
      ? `${prenom || ""} ${nom}`.trim()
      : user.fullName || user.name || user.username || "Utilisateur inconnu";

    return {
      userId,
      nom,
      prenom,
      fullName,
      name: fullName,
      avatar: user.avatar || user.profile_pic || null,
      matricule: user.matricule || userId,
      ministere: user.ministere || "",
      sexe: user.sexe || "",
    };
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
      // Étape 1 : Tentative lecture depuis le cache partagé Redis
      const cached = await this.userCache.get(userId);
      if (cached) {
        const responseUser = this._mapCacheToResponse(cached, userId);
        if (responseUser) {
          console.log(`✅ [UserCacheService] Hit Redis: ${userId}`);
          return responseUser;
        }
      }

      // Étape 2 : Cache miss → Fallback HTTP auth-user-service
      console.log(
        `⚠️ [UserCacheService] Miss Redis → Fallback HTTP: ${userId}`,
      );
      const userInfo = await this._fetchFromAuthService(userId);

      // Étape 3 : Cache warming (repopulation Redis via cache partagé)
      if (userInfo && userInfo.name) {
        await this.userCache.set(this._buildCachePayload(userInfo));
      }

      return userInfo;
    } catch (error) {
      console.warn(
        `⚠️ [UserCacheService] Erreur fetchUserInfo pour ${userId}:`,
        error.message,
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
      // Étape 1 : Lecture batch depuis Redis (cache partagé)
      const cachedResults = await this.userCache.batchGet(userIds);

      const results = [];
      const missingIds = [];

      cachedResults.forEach((cached, i) => {
        const mapped = this._mapCacheToResponse(cached, userIds[i]);
        if (mapped && mapped.name !== "Utilisateur inconnu") {
          results.push(mapped);
        } else {
          missingIds.push(userIds[i]);
          results.push({
            userId: userIds[i],
            name: null,
            avatar: null,
            matricule: userIds[i],
            ministere: "",
            sexe: "",
            nom: null,
            prenom: null,
          });
        }
      });

      console.log(
        `📊 [UserCacheService] Batch: ${
          results.length - missingIds.length
        } hits, ${missingIds.length} miss`,
      );

      // Étape 2 : Fallback HTTP pour les utilisateurs manquants
      if (missingIds.length > 0) {
        const fetchedUsers = await this._fetchBatchFromAuthService(missingIds);

        // Mise à jour des résultats + cache warming
        for (const fetchedUser of fetchedUsers) {
          const index = results.findIndex(
            (r) => r.userId === fetchedUser.userId,
          );
          if (index !== -1) {
            results[index] = fetchedUser;
          }

          // Repopulate le cache partagé
          if (fetchedUser.name) {
            await this.userCache.set(this._buildCachePayload(fetchedUser));
          }
        }
      }

      return results;
    } catch (error) {
      console.error(
        `❌ [UserCacheService] Erreur fetchUsersInfo:`,
        error.message,
      );
      return userIds.map((userId) => ({
        userId,
        name: "Utilisateur inconnu",
        avatar: null,
        matricule: userId,
        ministere: "",
        sexe: "",
      }));
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

      return this._normalizeAuthUser(response.data, userId);
    } catch (error) {
      if (error.response?.status === 404) {
        console.warn(`⚠️ [UserCacheService] Utilisateur ${userId} introuvable`);
      } else {
        console.warn(
          `⚠️ [UserCacheService] Erreur HTTP ${userId}:`,
          error.message,
        );
      }

      return {
        userId,
        name: "Utilisateur inconnu",
        avatar: null,
        matricule: userId,
        ministere: "",
        sexe: "",
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
      // Tentative route batch
      try {
        const response = await axios.get(`${this.authServiceUrl}/batch`, {
          params: { ids: userIds.join(",") },
          timeout: this.timeout,
        });

        const users = response.data.users || [];
        return users.map((user) =>
          this._normalizeAuthUser(user, user.id || user._id?.toString()),
        );
      } catch (batchError) {
        // Fallback : requêtes parallèles individuelles
        console.log(
          `⚠️ [UserCacheService] Route batch indisponible, fallback requêtes parallèles`,
        );
        const requests = userIds.map((id) => this._fetchFromAuthService(id));
        return await Promise.all(requests);
      }
    } catch (error) {
      console.error(`❌ [UserCacheService] Erreur batch fetch:`, error.message);
      return userIds.map((userId) => ({
        userId,
        name: "Utilisateur inconnu",
        avatar: null,
        matricule: userId,
        ministere: "",
        sexe: "",
      }));
    }
  }

  /**
  /**
   * Invalide le cache d'un utilisateur (après update profil)
   */
  async invalidateUser(userId) {
    await this.userCache.invalidate(userId);
  }

  /**
   * Récupère les statistiques du cache
   */
  async getStats() {
    return await this.userCache.getStats();
  }

  /**
   * Warm le cache pour un utilisateur (après login/update)
   */
  async warmCache(userId, userData) {
    try {
      await this.userCache.set(
        this._buildCachePayload({ userId, ...userData }),
      );
      console.log(`🔥 [UserCacheService] Warmed ${userId}`);
    } catch (error) {
      console.warn(
        `⚠️ [UserCacheService] Erreur cache warming ${userId}:`,
        error.message,
      );
    }
  }
}

module.exports = UserCacheService;
