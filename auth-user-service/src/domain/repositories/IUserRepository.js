class IUserRepository {
  async findAll() {
    throw new Error("Méthode non implémentée");
  }

  async findByMatricule(matricule) {
    throw new Error("Méthode non implémentée");
  }

  async findById(id) {
    throw new Error("Méthode non implémentée");
  }
}

module.exports = IUserRepository;
