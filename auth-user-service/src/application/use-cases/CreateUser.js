/**
 * CreateUser - Use case pour créer un nouvel utilisateur
 *
 * Actions:
 * 1. Création en base de données (source de vérité)
 * 2. Mise en cache Redis partagé
 * 3. Publication d'un événement dans Redis Streams
 */
class CreateUser {
  constructor(userRepository, userCache, redisClient) {
    this.userRepository = userRepository;
    this.userCache = userCache;
    this.redisClient = redisClient;
  }

  async execute(userData) {
    // 1. Création en base de données
    // NOTE: À adapter selon votre implémentation de création
    // const user = await this.userRepository.create(userData);

    // Pour l'instant, simuler la création (à remplacer par votre logique)
    const user = {
      id: userData.id,
      matricule: userData.matricule,
      nom: userData.nom,
      prenom: userData.prenom,
      ministere: userData.ministere,
      avatar: userData.avatar,
      sexe: userData.sexe,
    };

    // 2. Mise en cache immédiate Redis
    if (this.userCache) {
      await this.userCache.set({
        id: user.id,
        nom: user.nom,
        prenom: user.prenom,
        matricule: user.matricule,
        ministere: user.ministere,
        avatar: user.avatar,
        sexe: user.sexe,
      });
    }

    // 3. Publication dans Redis Streams
    if (this.redisClient) {
      try {
        const event = {
          event: "user.profile.created",
          userId: user.id,
          fullName: `${user.prenom || ""} ${user.nom || ""}`.trim(),
          avatar: user.avatar || null,
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
          `📤 [CreateUser] Événement user.profile.created publié pour user ${user.id}`
        );
      } catch (error) {
        console.error(
          "❌ [CreateUser] Erreur publication event:",
          error.message
        );
        // Non-bloquant
      }
    }

    return user;
  }
}

module.exports = CreateUser;
