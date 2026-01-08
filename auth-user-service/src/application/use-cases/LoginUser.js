class LoginUser {
  constructor(userRepository, jwtService) {
    this.userRepository = userRepository;
    this.jwtService = jwtService;
  }

  async execute(matricule) {
    const user = await this.userRepository.findByMatricule(matricule);

    console.log("LoginUser: Utilisateur trouvé:", user);
    if (!user) {
      throw new Error("Utilisateur non trouvé");
    }

    // Seul le matricule est nécessaire pour générer les tokens
    const payload = { matricule: user.matricule };

    const accessToken = this.jwtService.generateToken(payload, "15m");
    const refreshToken = this.jwtService.generateRefreshToken(payload, "7d");

    return { user, accessToken, refreshToken };
  }
}

module.exports = LoginUser;
