class LoginUser {
  constructor(userRepository, jwtService, userCache, redisClient) {
    this.userRepository = userRepository;
    this.jwtService = jwtService;
    this.userCache = userCache;
    this.redisClient = redisClient;
  }

  async execute(matricule) {
    const user = await this.userRepository.findByMatricule(matricule);

    console.log("LoginUser: Utilisateur trouvé:", user);
    if (!user) {
      throw new Error("Utilisateur non trouvé");
    }

    // ✅ Mise en cache du profil lors du login (cache warming)
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
      console.log(`🔥 [LoginUser] Profil mis en cache: ${user.matricule}`);
    }

    // Seul le matricule est nécessaire pour générer les tokens
    const payload = { matricule: user.matricule, id: user.id };

    const accessToken = this.jwtService.generateToken(payload, "15m");
    const refreshToken = this.jwtService.generateRefreshToken(payload, "7d");

    return { user, accessToken, refreshToken };
  }
}

module.exports = LoginUser;
