const jwt = require("jsonwebtoken");

const authMiddleware = {
  /**
   * Middleware d'authentification obligatoire avec validation JWT locale
   */
  authenticate: async (req, res, next) => {
    try {
      // Récupérer le token depuis les headers
      const authHeader = req.headers.authorization;
      let token = null;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }

      // Si pas de token dans Authorization, essayer les cookies
      if (!token && req.headers.cookie) {
        const cookies = req.headers.cookie.split(";");
        const tokenCookie = cookies.find((cookie) =>
          cookie.trim().startsWith("token=")
        );
        if (tokenCookie) {
          token = tokenCookie.split("=")[1];
        }
      }

      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Token d'authentification requis",
          code: "TOKEN_REQUIRED",
        });
      }

      // **VALIDATION LOCALE DU TOKEN JWT**
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "votre_secret_jwt_dev"
      );

      // Ajouter les infos utilisateur à la requête
      req.user = {
        id: decoded.id || decoded.userId,
        nom: decoded.nom || decoded.name,
        matricule: decoded.matricule,
      };

      console.log(
        `🔑 Utilisateur authentifié: ${req.user.nom} (${req.user.id})`
      );
      next();
    } catch (error) {
      console.error("❌ Erreur authentification HTTP:", error.message);

      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          message: "Token invalide",
          code: "INVALID_TOKEN",
        });
      }

      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Token expiré",
          code: "TOKEN_EXPIRED",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Erreur lors de la vérification du token",
        code: "AUTH_ERROR",
      });
    }
  },

  /**
   * Middleware d'authentification optionnelle
   */
  optionalAuth: async (req, res, next) => {
    try {
      // Même logique que authenticate mais sans retourner d'erreur
      const authHeader = req.headers.authorization;
      let token = null;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }

      if (!token && req.headers.cookie) {
        const cookies = req.headers.cookie.split(";");
        const tokenCookie = cookies.find((cookie) =>
          cookie.trim().startsWith("token=")
        );
        if (tokenCookie) {
          token = tokenCookie.split("=")[1];
        }
      }

      if (token) {
        try {
          const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || "votre_secret_jwt_dev"
          );
          req.user = {
            id: decoded.id || decoded.userId,
            nom: decoded.nom || decoded.name,
            matricule: decoded.matricule,
            role: decoded.role || "user",
          };
        } catch (err) {
          // Token invalide mais on continue sans utilisateur
          req.user = null;
        }
      }

      next();
    } catch (error) {
      console.error("❌ Erreur auth optionnelle:", error.message);
      req.user = null;
      next();
    }
  },
};

module.exports = authMiddleware;
