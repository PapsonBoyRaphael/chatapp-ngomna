class UserController {
  constructor(getAllUsersUseCase, getUserUseCase) {
    this.getAllUsersUseCase = getAllUsersUseCase;
    this.getUserUseCase = getUserUseCase;
  }
  async getAllUsers(req, res) {
    try {
      const users = await this.getAllUsersUseCase.execute();
      res.json(users);
    } catch (error) {
      console.error("Erreur lors de la récupération des utilisateurs:", error);
      res.status(500).json({ message: "Erreur interne du serveur" });
    }
  }
  async getUserById(req, res) {
    try {
      const userId = req.params.id;
      const user = await this.getUserUseCase.execute(userId);

      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }

      res.status(200).json(user);
    } catch (error) {
      console.error("Erreur lors de la récupération de l'utilisateur:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  }
}

module.exports = UserController;
