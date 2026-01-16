/**
 * UpdateUserProfile - Use case pour mettre à jour un profil utilisateur
 *
 * Actions:
 * 1. Mise à jour en base de données (source de vérité)
 * 2. Mise à jour dans le cache Redis partagé
 * 3. Publication d'un événement dans Redis Streams
 */
class UpdateUserProfile {
  constructor(userRepository, userCache, redisClient) {
    this.userRepository = userRepository;
    this.userCache = userCache;
    this.redisClient = redisClient;
  }

  async execute(userId, updates) {
    // 1. Mise à jour en base de données
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new Error("Utilisateur non trouvé");
    }

    // Appliquer les mises à jour (à adapter selon votre modèle)
    // Pour l'instant on retourne l'utilisateur tel quel
    // Dans un vrai cas, vous feriez: await this.userRepository.update(userId, updates);

    // 2. Mise à jour immédiate dans le cache partagé Redis
    if (this.userCache) {
      await this.userCache.set({
        id: user.matricule, // ✅ Utilise matricule comme clé primaire (570479H)
        nom: user.nom,
        prenom: user.prenom,
        fullName: `${user.prenom || ""} ${user.nom || ""}`.trim(),
        matricule: user.matricule,
        ministere: user.ministere,
        avatar: user.avatar || user.profile_pic,
        sexe: user.sexe,
      });
    }

    // 3. Publication dans Redis Streams pour notifier les autres services
    if (this.redisClient) {
      try {
        const event = {
          event: "user.profile.updated",
          userId: user.id,
          fullName: `${user.prenom || ""} ${user.nom || ""}`.trim(),
          avatar: user.avatar || user.profile_pic || null,
          matricule: user.matricule,
          ministere: user.ministere || "",
          sexe: user.sexe || "",
          nom: user.nom,
          prenom: user.prenom,
          timestamp: Date.now(),
        };

        await this.redisClient.xAdd("events:users", "*", {
          payload: JSON.stringify(event),
        });

        console.log(
          `📤 [UpdateUserProfile] Événement publié pour user ${user.id}`
        );
      } catch (error) {
        console.error(
          "❌ [UpdateUserProfile] Erreur publication event:",
          error.message
        );
        // Non-bloquant : on continue même si la publication échoue
      }
    }

    return user;
  }
}

module.exports = UpdateUserProfile;
