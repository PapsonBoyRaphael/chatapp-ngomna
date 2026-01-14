/**
 * BatchGetUsers - Use case pour récupérer plusieurs utilisateurs en batch
 *
 * Permet de récupérer efficacement les profils de plusieurs utilisateurs
 * Utilisé notamment par le système de pré-chauffage du cache
 */
class BatchGetUsers {
  constructor(userRepository) {
    this.userRepository = userRepository;
  }

  async execute(userIds) {
    if (!userIds || userIds.length === 0) {
      return [];
    }

    try {
      // Convertir les IDs en tableau si c'est une string séparée par des virgules
      const idsArray = Array.isArray(userIds)
        ? userIds
        : userIds.split(",").map((id) => id.trim());

      // Pour l'instant, on fait des requêtes individuelles
      // À optimiser avec une vraie requête batch SQL si nécessaire
      const userPromises = idsArray.map((id) =>
        this.userRepository.findById(id).catch((err) => {
          console.warn(`Erreur récupération user ${id}:`, err.message);
          return null;
        })
      );

      const users = await Promise.all(userPromises);

      // Filtrer les null
      return users.filter((user) => user !== null);
    } catch (error) {
      console.error("Erreur BatchGetUsers:", error);
      return [];
    }
  }
}

module.exports = BatchGetUsers;
