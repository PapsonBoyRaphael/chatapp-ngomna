const { UserCache } = require("../../../shared");

/**
 * SmartCachePrewarmer - Système de pré-chauffage intelligent du cache utilisateur
 *
 * ✅ VERSION AUTH-USER-SERVICE :
 * - Charge les utilisateurs directement depuis MongoDB (pas d'HTTP)
 * - Publie dans Redis UserCache au démarrage
 * - Découlé du chat-service → aucune dépendance
 *
 * Stratégie:
 * - Récupère tous les utilisateurs depuis MongoDB User collection
 * - Traitement par batch pour éviter la surcharge
 * - Non-bloquant : s'exécute en arrière-plan
 *
 * Avantages:
 * - Source de vérité = auth-user-service
 * - Cache hit rate élevé au démarrage (80-95%)
 * - Réduction des appels HTTP au runtime
 * - Couverture complète de tous les utilisateurs sans appel externe
 */
class SmartCachePrewarmer {
  constructor(userRepository = null, options = {}) {
    this.userRepository = userRepository;
    this.batchSize = options.batchSize || 500;
    this.delayBetweenBatches = options.delayBetweenBatches || 1500; // 1.5s
    this.maxUsers = options.maxUsers || 10000;
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

    if (!this.userRepository) {
      console.warn(
        "⚠️ [SmartCachePrewarmer] userRepository non disponible, abandon",
      );
      return this.stats;
    }

    this.isRunning = true;
    this.stats.startTime = Date.now();

    console.log(
      "🔥 [SmartCachePrewarmer] Démarrage du pré-chauffage depuis MongoDB...",
    );

    try {
      // Étape 1: Récupérer TOUS les utilisateurs depuis MongoDB
      const allUsers = await this._getAllUsersFromMongoDB();

      if (allUsers.length === 0) {
        console.log("⚠️ [SmartCachePrewarmer] Aucun utilisateur trouvé");
        return this.stats;
      }

      console.log(
        `📊 [SmartCachePrewarmer] ${allUsers.length} utilisateurs à mettre en cache Redis`,
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
   * Récupère TOUS les utilisateurs depuis MongoDB
   * @private
   */
  async _getAllUsersFromMongoDB() {
    try {
      console.log(
        `🔍 [SmartCachePrewarmer] Récupération des utilisateurs depuis MongoDB`,
      );

      // Utiliser la méthode du repository pour récupérer tous les utilisateurs
      const allUsers = await this.userRepository.findAll();

      if (!Array.isArray(allUsers)) {
        console.warn(
          "⚠️ [SmartCachePrewarmer] Résultat non itérable:",
          typeof allUsers,
        );
        return [];
      }

      console.log(
        `✅ [SmartCachePrewarmer] ${allUsers.length} utilisateurs récupérés de MongoDB`,
      );
      return allUsers;
    } catch (error) {
      console.error(
        "❌ [SmartCachePrewarmer] Erreur récupération users MongoDB:",
        error.message,
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
        `📦 [SmartCachePrewarmer] Batch ${batchNumber}/${totalBatches} (${batch.length} users)`,
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
      `📊 [SmartCachePrewarmer] Mise en cache Redis de ${users.length} utilisateurs`,
    );

    for (const user of users) {
      try {
        // ✅ Utiliser matricule comme clé primaire
        const userId = user.matricule || user.id;

        if (!userId) {
          console.warn(
            `⚠️ [SmartCachePrewarmer] Utilisateur sans matricule/id:`,
            user,
          );
          this.stats.errors++;
          continue;
        }

        // ✅ Publier dans Redis UserCache
        await UserCache.set({
          id: userId,
          nom: user.nom || null,
          prenom: user.prenom || null,
          fullName: user.nom
            ? `${user.prenom || ""} ${user.nom}`.trim()
            : user.name || "Utilisateur inconnu",
          avatar: user.avatar || user.profile_pic || null,
          matricule: user.matricule || userId,
          ministere: user.ministere || "",
          sexe: user.sexe || "",
        });

        this.stats.cached++;
        this.stats.totalProcessed++;
      } catch (cacheError) {
        console.error(
          `❌ [SmartCachePrewarmer] Erreur cache user ${
            user.matricule || user.id
          }:`,
          cacheError.message,
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
