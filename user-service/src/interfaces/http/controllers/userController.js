class UserController {
  constructor(getAllUsersUseCase) {
    this.getAllUsersUseCase = getAllUsersUseCase;
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
}

module.exports = UserController;
