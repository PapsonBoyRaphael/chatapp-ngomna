/**
 * DeleteUser - Use case pour supprimer un utilisateur
 *
 * Actions:
 * 1. Suppression en base de données (source de vérité)
 * 2. Invalidation du cache Redis
 * 3. Publication d'un événement dans Redis Streams
 */
class DeleteUser {
  constructor(userRepository, userCache, redisClient) {
    this.userRepository = userRepository;
    this.userCache = userCache;
    this.redisClient = redisClient;
  }

  async execute(userId) {
    // 1. Vérifier que l'utilisateur existe
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new Error("Utilisateur non trouvé");
    }

    // 2. Suppression en base de données
    // NOTE: À adapter selon votre implémentation
    // await this.userRepository.delete(userId);

    // 3. Invalidation du cache Redis
    if (this.userCache) {
      await this.userCache.invalidate(userId);
    }

    // 4. Publication dans Redis Streams
    if (this.redisClient) {
      try {
        const event = {
          event: "user.profile.deleted",
          userId: userId,
          matricule: user.matricule,
          timestamp: Date.now(),
        };

        await this.redisClient.xAdd("events:users", "*", {
          payload: JSON.stringify(event),
        });

        console.log(
          `📤 [DeleteUser] Événement user.profile.deleted publié pour user ${userId}`
        );
      } catch (error) {
        console.error(
          "❌ [DeleteUser] Erreur publication event:",
          error.message
        );
        // Non-bloquant
      }
    }

    return { success: true, userId };
  }
}

module.exports = DeleteUser;
