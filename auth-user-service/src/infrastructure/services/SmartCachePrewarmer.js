const { UserCache, RedisManager } = require("../../../shared");

/**
 * SmartCachePrewarmer - Système de pré-chauffage intelligent du cache utilisateur
 *
 * ✅ VERSION AUTH-USER-SERVICE :
 * - Charge les utilisateurs directement depuis MongoDB (pas d'HTTP)
 * ✅ PUBLIE SUR LE STREAM: app:stream:events:users (pas stockage local)
 * - ✅ RÉINITIALISE le stream avant publication (supprime les anciennes données)
 * - Découlé du chat-service → aucune dépendance
 *
 * Stratégie:
 * - Récupère tous les utilisateurs depuis MongoDB User collection
 * - Vide complètement le stream avant de publier (XDEL tout)
 * - Traitement par batch pour éviter la surcharge
 * - Publie chaque utilisateur sur le stream Redis pour propagation globale
 * - Non-bloquant : s'exécute en arrière-plan
 *
 * Avantages:
 * - Source de vérité = auth-user-service
 * - ✅ Données publiées sur stream (event-driven)
 * - ✅ Pas de doublons : stream réinitialisé à chaque démarrage
 * - Autres services reçoivent les données sans polling
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
    // ✅ RedisManager est déjà une instance singleton
    this.redisManager = RedisManager;
    this.stats = {
      totalProcessed: 0,
      published: 0,
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
      // Étape 0: Réinitialiser le stream (supprimer les anciennes données)
      await this._reinitializeStream();

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
      console.log(`   - ✅ Publiés sur stream: ${this.stats.published}`);
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
   * Réinitialise le stream en supprimant toutes les entrées
   * @private
   */
  async _reinitializeStream() {
    try {
      if (!this.redisManager || !this.redisManager.streamManager) {
        console.warn(
          "⚠️ [SmartCachePrewarmer] StreamManager non disponible pour réinitialisation",
        );
        return;
      }

      const streamName = this.redisManager.streamManager.EVENT_STREAMS.USERS;
      const streamClient = this.redisManager.clients?.main;

      if (!streamClient) {
        console.warn("⚠️ [SmartCachePrewarmer] Client Redis non disponible");
        return;
      }

      // Récupérer tous les IDs du stream
      const entries = await streamClient.xRange(streamName, "-", "+");

      if (entries && entries.length > 0) {
        console.log(
          `🔄 [SmartCachePrewarmer] Suppression de ${entries.length} anciennes entrées du stream...`,
        );

        // Supprimer chaque entrée
        for (const entry of entries) {
          await streamClient.xDel(streamName, entry.id);
        }

        console.log(
          `✅ [SmartCachePrewarmer] Stream réinitialisé (${entries.length} entrées supprimées)`,
        );
      } else {
        console.log(
          "ℹ️ [SmartCachePrewarmer] Stream vide, pas besoin de réinitialiser",
        );
      }
    } catch (error) {
      console.warn(
        "⚠️ [SmartCachePrewarmer] Erreur réinitialisation stream:",
        error.message,
      );
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
   * Traite les utilisateurs par batch et les publie sur le stream
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

      await this._publishBatchToStream(batch);

      // Délai entre les batches pour ne pas surcharger
      if (i + this.batchSize < allUsers.length) {
        await this._delay(this.delayBetweenBatches);
      }
    }
  }

  /**
   * Publie un batch d'utilisateurs sur le stream + cache Redis
   * @private
   */
  async _publishBatchToStream(users) {
    console.log(
      `📊 [SmartCachePrewarmer] Publication sur stream + cache de ${users.length} utilisateurs`,
    );

    // Vérifier que StreamManager est disponible
    if (!this.redisManager || !this.redisManager.streamManager) {
      console.error(`❌ [SmartCachePrewarmer] StreamManager non disponible`);
      this.stats.errors += users.length;
      return;
    }

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

        // ✅ Construire les données d'utilisateur
        const userData = {
          id: String(userId),
          nom: user.nom || "",
          prenom: user.prenom || "",
          fullName: user.nom
            ? `${user.prenom || ""} ${user.nom}`.trim()
            : user.name || "Utilisateur inconnu",
          avatar: user.avatar || user.profile_pic || "",
          matricule: user.matricule || userId,
          ministere: user.ministere || "",
          sexe: user.sexe || "",
          timestamp: Date.now(),
        };

        // ✅ ÉTAPE 1: Stocker dans le cache Redis (UserCache datastore)
        try {
          await UserCache.set(userData);
          // console.log(
          //   // `💾 [SmartCachePrewarmer] Utilisateur ${userId} stocké dans le cache`,
          // );
        } catch (cacheError) {
          console.warn(
            `⚠️ [SmartCachePrewarmer] Erreur stockage cache ${userId}:`,
            cacheError.message,
          );
        }

        // ✅ ÉTAPE 2: Publier sur le stream users
        const streamId = await this.redisManager.streamManager.addToStream(
          this.redisManager.streamManager.EVENT_STREAMS.USERS,
          {
            event: "user:profile:synced",
            userId: userData.id,
            data: JSON.stringify(userData),
          },
        );

        if (streamId) {
          this.stats.published++;
          this.stats.totalProcessed++;
          // console.log(
          //   `✅ [SmartCachePrewarmer] Utilisateur ${userId} publié (streamId: ${streamId})`,
          // );
        } else {
          this.stats.errors++;
          console.warn(
            `⚠️ [SmartCachePrewarmer] Échec publication utilisateur ${userId}`,
          );
        }
      } catch (streamError) {
        console.error(
          `❌ [SmartCachePrewarmer] Erreur stream user ${
            user.matricule || user.id
          }:`,
          streamError.message,
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
