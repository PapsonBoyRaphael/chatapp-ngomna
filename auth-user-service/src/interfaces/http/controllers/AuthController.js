class AuthController {
  constructor(loginUserUseCase) {
    this.loginUserUseCase = loginUserUseCase;
  }

  async login(req, res) {
    try {
      const { matricule } = req.body;

      if (!matricule) {
        return res.status(400).json({ message: "Le matricule est requis" });
      }

      const result = await this.loginUserUseCase.execute(matricule);

      // Définir des cookies httpOnly pour protéger les tokens côté client
      res.json({
        user: result.user,
        accessToken: result.accessToken, // optionnel pour mobile
        refreshToken: result.refreshToken, // optionnel pour mobile
      });
    } catch (error) {
      console.error("Erreur lors de la connexion:", error);
      res.status(401).json({ message: error.message });
    }
  }
}

module.exports = AuthController;
