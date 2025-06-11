const express = require("express");

const createUserRoutes = (userController) => {
  const router = express.Router();

  // Route pour obtenir tous les utilisateurs
  router.get("/", (req, res) => {
    userController.getAllUsers(req, res);
  });

  // Route pour obtenir un utilisateur par son ID
  router.get("/:id", (req, res) => {
    userController.getUserById(req, res);
  });

  return router;
};

module.exports = createUserRoutes;
