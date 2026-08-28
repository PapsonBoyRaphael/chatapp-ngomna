class GetUserById {
  constructor(userRepository) {
    this.userRepository = userRepository;
  }

  async execute(userId) {
    if (!userId) {
      throw new Error("L'ID de l'utilisateur est requis");
    }

    const isNumeric = /^\d+$/.test(userId);
    let user = null;

    if (isNumeric) {
      user = await this.userRepository.findById(userId);
    }

    if (!user) {
      user = await this.userRepository.findByMatricule(userId);
    }

    return user;
  }
}

module.exports = GetUserById;
