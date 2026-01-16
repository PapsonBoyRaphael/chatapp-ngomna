const axios = require("axios");
const { UserCache } = require("@chatapp-ngomna/shared");

/**
 * SmartCachePrewarmer - Système de pré-chauffage intelligent du cache utilisateur
 *
 * Stratégie:
 * - Charge TOUS les utilisateurs depuis auth-user-service/all
 * - Traitement par batch pour éviter la surcharge
 * - Non-bloquant : s'exécute en arrière-plan
 *
 * Avantages:
 * - Pas de blocage au démarrage
 * - Cache hit rate élevé (80-95%)
 * - Réduction des appels HTTP au runtime
 * - Couverture complète de tous les utilisateurs
 */
class SmartCachePrewarmer {
  constructor(options = {}) {
    this.authServiceUrl =
      options.authServiceUrl ||
      process.env.AUTH_USER_SERVICE_URL ||
      "http://localhost:8001";
    this.batchSize = options.batchSize || 500;
    this.delayBetweenBatches = options.delayBetweenBatches || 1500; // 1.5s
    this.maxUsers = options.maxUsers || 10000;
    this.daysBack = options.daysBack || 7;
    this.isRunning = false;
    this.stats = {
      totalProcessed: 0,
      cached: 0,
      errors: 0,
      startTime: null,
      endTime: null,
    };
  }

  /**
   * Démarre le pré-chauffage intelligent
   */
  async start() {
    if (this.isRunning) {
      console.warn("⚠️ [SmartCachePrewarmer] Déjà en cours d'exécution");
      return this.stats;
    }

    this.isRunning = true;
    this.stats.startTime = Date.now();

    console.log(
      "🔥 [SmartCachePrewarmer] Démarrage du pré-chauffage intelligent..."
    );

    try {
      // Étape 1: Récupérer TOUS les utilisateurs depuis auth-user-service
      const allUsers = await this._getAllUsersFromAuthService();

      if (allUsers.length === 0) {
        console.log("⚠️ [SmartCachePrewarmer] Aucun utilisateur trouvé");
        return this.stats;
      }

      console.log(
        `📊 [SmartCachePrewarmer] ${allUsers.length} utilisateurs à mettre en cache`
      );

      // Étape 2: Traitement par batch
      await this._processBatchesDirectly(allUsers);

      this.stats.endTime = Date.now();
      const duration = (
        (this.stats.endTime - this.stats.startTime) /
        1000
      ).toFixed(2);

      console.log("✅ [SmartCachePrewarmer] Pré-chauffage terminé:");
      console.log(`   - Traités: ${this.stats.totalProcessed}`);
      console.log(`   - Mis en cache: ${this.stats.cached}`);
      console.log(`   - Erreurs: ${this.stats.errors}`);
      console.log(`   - Durée: ${duration}s`);

      return this.stats;
    } catch (error) {
      console.error("❌ [SmartCachePrewarmer] Erreur:", error.message);
      this.stats.errors++;
      return this.stats;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Récupère TOUS les utilisateurs depuis auth-user-service/all
   * @private
   */
  async _getAllUsersFromAuthService() {
    try {
      console.log(
        `🔍 [SmartCachePrewarmer] Récupération de tous les utilisateurs depuis ${this.authServiceUrl}/all`
      );

      const response = await axios.get(`${this.authServiceUrl}/all`, {
        timeout: 30000, // 30s pour une grosse requête
      });

      if (Array.isArray(response.data)) {
        return response.data;
      } else if (response.data && Array.isArray(response.data.users)) {
        return response.data.users;
      } else {
        console.warn(
          "⚠️ [SmartCachePrewarmer] Format de réponse inattendu:",
          typeof response.data
        );
        return [];
      }
    } catch (error) {
      console.error(
        "❌ [SmartCachePrewarmer] Erreur récupération users:",
        error.message
      );
      return [];
    }
  }

  /**
   * Traite les utilisateurs par batch et les cache directement
   * @private
   */
  async _processBatchesDirectly(allUsers) {
    const totalBatches = Math.ceil(allUsers.length / this.batchSize);

    for (let i = 0; i < allUsers.length; i += this.batchSize) {
      const batch = allUsers.slice(i, i + this.batchSize);
      const batchNumber = Math.floor(i / this.batchSize) + 1;

      console.log(
        `📦 [SmartCachePrewarmer] Batch ${batchNumber}/${totalBatches} (${batch.length} users)`
      );

      await this._cacheBatch(batch);

      // Délai entre les batches pour ne pas surcharger
      if (i + this.batchSize < allUsers.length) {
        await this._delay(this.delayBetweenBatches);
      }
    }
  }

  /**
   * Met directement en cache un batch d'utilisateurs
   * @private
   */
  async _cacheBatch(users) {
    console.log(
      `📊 [SmartCachePrewarmer] Mise en cache de ${users.length} utilisateurs`
    );

    for (const user of users) {
      try {
        if (!user.id) {
          console.warn(
            `⚠️ [SmartCachePrewarmer] Utilisateur sans ID:`,
            user.matricule
          );
          this.stats.errors++;
          continue;
        }

        await UserCache.set({
          id: user.matricule || user.id, // ✅ Priorité au matricule (570479H)
          nom: user.nom,
          prenom: user.prenom,
          fullName: user.nom
            ? `${user.prenom || ""} ${user.nom}`.trim()
            : user.name,
          avatar: user.avatar || user.profile_pic || null,
          matricule: user.matricule,
          ministere: user.ministere || "",
          sexe: user.sexe || "",
        });

        this.stats.cached++;
        this.stats.totalProcessed++;
      } catch (cacheError) {
        console.error(
          `❌ [SmartCachePrewarmer] Erreur cache user ${user.id}:`,
          cacheError.message
        );
        this.stats.errors++;
      }
    }
  }

  /**
   * Délai asynchrone
   * @private
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Récupère les statistiques actuelles
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      duration: this.stats.endTime
        ? ((this.stats.endTime - this.stats.startTime) / 1000).toFixed(2)
        : null,
    };
  }

  /**
   * Vérifie si le pré-chauffage est en cours
   */
  isPrewarming() {
    return this.isRunning;
  }
}

module.exports = SmartCachePrewarmer;
