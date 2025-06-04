class LoginUser {
  constructor(userRepository, jwtService) {
    this.userRepository = userRepository;
    this.jwtService = jwtService;
  }

  async execute(matricule) {
    const user = await this.userRepository.findByMatricule(matricule);

    if (!user) {
      throw new Error("Utilisateur non trouvé");
    }

    const token = this.jwtService.generateToken({
      id: user.id,
      matricule: user.matricule,
    });

    return { user, token };
  }
}

module.exports = LoginUser;
