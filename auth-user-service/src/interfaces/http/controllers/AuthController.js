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

      res.json({
        user: result.user,
        token: result.token,
      });
    } catch (error) {
      console.error("Erreur lors de la connexion:", error);
      res.status(401).json({ message: error.message });
    }
  }
}

module.exports = AuthController;
