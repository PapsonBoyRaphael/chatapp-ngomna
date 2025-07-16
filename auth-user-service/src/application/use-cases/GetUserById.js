class GetUserById {
  constructor(userRepository) {
    this.userRepository = userRepository;
  }

  async execute(userId) {
    if (!userId) {
      throw new Error("L'ID de l'utilisateur est requis");
    }
    return await this.userRepository.findById(userId);
  }
}

module.exports = GetUserById;
