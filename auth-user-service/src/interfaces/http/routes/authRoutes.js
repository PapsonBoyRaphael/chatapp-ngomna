const express = require("express");

const createAuthRoutes = (authController, jwtService) => {
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
      const decoded = jwtService.verifyToken(token);
      res.status(200).json({
        matricule: decoded.matricule,
        id: decoded.id, // optionnel si présent dans le token
      });
    } catch (error) {
      res.status(401).json({ message: "Token invalide" });
    }
  });

  // Rafraîchir l'access token à partir du refresh token (httpOnly cookie ou body fallback)
  router.post("/refresh", async (req, res) => {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token manquant" });
    }

    try {
      const payload = jwtService.verifyToken(refreshToken);

      const accessToken = jwtService.generateToken(
        { matricule: payload.matricule },
        "15m"
      );

      res
        .cookie("accessToken", accessToken, {
          httpOnly: true,
          secure: true,
          sameSite: "Strict",
          maxAge: 15 * 60 * 1000,
        })
        .json({ accessToken });
    } catch (error) {
      res.status(401).json({ error: "Refresh token invalide ou expiré" });
    }
  });

  return router;
};

module.exports = createAuthRoutes;
