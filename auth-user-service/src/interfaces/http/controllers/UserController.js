class UserController {
  constructor(
    getAllUsersUseCase,
    getUserUseCase,
    batchGetUsersUseCase,
    updateUserProfileUseCase,
    createUserUseCase,
    deleteUserUseCase
  ) {
    this.getAllUsersUseCase = getAllUsersUseCase;
    this.getUserUseCase = getUserUseCase;
    this.batchGetUsersUseCase = batchGetUsersUseCase;
    this.updateUserProfileUseCase = updateUserProfileUseCase;
    this.createUserUseCase = createUserUseCase;
    this.deleteUserUseCase = deleteUserUseCase;
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

  async getUserByMatricule(req, res) {
    try {
      const { matricule } = req.params;
      const user = await this.getUserUseCase.execute(matricule);

      if (!user) {
        return res.status(404).json({ message: "Utilisateur non trouvé" });
      }

      res.status(200).json(user);
    } catch (error) {
      console.error("Erreur lors de la récupération par matricule:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  }

  async batchGetUsers(req, res) {
    try {
      const { ids } = req.query;

      if (!ids) {
        return res.status(400).json({
          message: "Paramètre 'ids' requis (ex: ?ids=1,2,3)",
        });
      }

      const users = await this.batchGetUsersUseCase.execute(ids);

      res.status(200).json({
        users,
        count: users.length,
      });
    } catch (error) {
      console.error("Erreur batch récupération utilisateurs:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  }

  async updateUserProfile(req, res) {
    try {
      const userId = req.params.id;
      const updates = req.body;

      if (!this.updateUserProfileUseCase) {
        return res.status(501).json({
          message: "Fonction non implémentée",
        });
      }

      const user = await this.updateUserProfileUseCase.execute(userId, updates);

      res.status(200).json(user);
    } catch (error) {
      console.error("Erreur mise à jour profil:", error);

      if (error.message === "Utilisateur non trouvé") {
        return res.status(404).json({ message: error.message });
      }

      res.status(500).json({ message: "Erreur serveur" });
    }
  }

  async createUser(req, res) {
    try {
      const userData = req.body;

      if (!this.createUserUseCase) {
        return res.status(501).json({
          message: "Fonction non implémentée",
        });
      }

      const user = await this.createUserUseCase.execute(userData);

      res.status(201).json(user);
    } catch (error) {
      console.error("Erreur création utilisateur:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  }

  async deleteUser(req, res) {
    try {
      const userId = req.params.id;

      if (!this.deleteUserUseCase) {
        return res.status(501).json({
          message: "Fonction non implémentée",
        });
      }

      const result = await this.deleteUserUseCase.execute(userId);

      res.status(200).json(result);
    } catch (error) {
      console.error("Erreur suppression utilisateur:", error);

      if (error.message === "Utilisateur non trouvé") {
        return res.status(404).json({ message: error.message });
      }

      res.status(500).json({ message: "Erreur serveur" });
    }
  }
}

module.exports = UserController;
