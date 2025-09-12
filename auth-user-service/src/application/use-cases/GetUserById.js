class GetUserById {
  constructor(userRepository) {
    this.userRepository = userRepository;
  }

  async execute(userId) {
    if (!userId) {
      throw new Error("L'ID de l'utilisateur est requis");
    }

    // Utilisez findByMatricule si userId est un matricule
    // ou findById si c'est un ID classique
    return await this.userRepository.findByMatricule(userId);
  }
}

module.exports = GetUserById;
