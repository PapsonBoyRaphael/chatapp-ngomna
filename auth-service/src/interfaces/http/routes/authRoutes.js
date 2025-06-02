const express = require("express");
const jwt = require("jsonwebtoken");

const createAuthRoutes = (authController) => {
  const router = express.Router();

  router.post("/login", (req, res) => {
    authController.login(req, res);
  });

  router.post("/validate", async (req, res) => {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Token manquant" });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET); // Vérifier et décoder le token
      res.status(200).json({ id: decoded.id, matricule: decoded.matricule }); // Retourner les données utilisateur
    } catch (error) {
      res.status(401).json({ message: "Token invalide" });
    }
  });

  return router;
};

module.exports = createAuthRoutes;
