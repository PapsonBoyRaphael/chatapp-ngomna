const express = require("express");

const createUserRoutes = (userController) => {
  const router = express.Router();

  // Route pour obtenir tous les utilisateurs
  router.get("/all", (req, res) => {
    userController.getAllUsers(req, res);
  });

  // Route pour obtenir tous les utilisateurs
  router.get("/alls", (req, res) => {
    userController.getAllUsers(req, res);
  });

  // Route batch pour récupérer plusieurs utilisateurs
  router.get("/batch", (req, res) => {
    userController.batchGetUsers(req, res);
  });

  // Route pour créer un utilisateur (POST)
  router.post("/", (req, res) => {
    userController.createUser(req, res);
  });

  // Route pour mettre à jour un profil utilisateur
  router.put("/:id", (req, res) => {
    userController.updateUserProfile(req, res);
  });

  // Route pour supprimer un utilisateur
  router.delete("/:id", (req, res) => {
    userController.deleteUser(req, res);
  });

  // Route pour obtenir un utilisateur par matricule
  router.get("/matricule/:matricule", (req, res) => {
    userController.getUserByMatricule(req, res);
  });

  // Route pour obtenir un utilisateur par son ID
  router.get("/:id", (req, res) => {
    userController.getUserById(req, res);
  });

  return router;
};

module.exports = createUserRoutes;
