const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "votre-secret-jwt-dev";

class AuthMiddleware {
  // Middleware pour valider le token JWT
  static authenticate = async (req, res, next) => {
    try {
      // Mode développement sans JWT
      if (process.env.NODE_ENV === "development" && !process.env.JWT_SECRET) {
        req.user = {
          id:
            req.headers["user-id"] ||
            req.headers["x-user-id"] ||
            "dev-user-123",
          userId:
            req.headers["user-id"] ||
            req.headers["x-user-id"] ||
            "dev-user-123",
          nom:
            req.headers["user-name"] ||
            req.headers["x-user-name"] ||
            "Dev User",
          // email: "dev@example.com",
          // role: "user",
        };
        return next();
      }

      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          success: false,
          message: "Token d'authentification requis",
          code: "MISSING_TOKEN",
        });
      }

      const token = authHeader.substring(7); // Enlever "Bearer "

      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = {
          id: decoded.id,
          userId: decoded.id, // Compatibilité
          nom: decoded.nom || decoded.name,
          // email: decoded.email,
          // role: decoded.role || "user",
        };
        next();
      } catch (jwtError) {
        console.warn("⚠️ Token JWT invalide:", jwtError.message);
        return res.status(401).json({
          success: false,
          message: "Token invalide ou expiré",
          code: "INVALID_TOKEN",
        });
      }
    } catch (error) {
      console.error("❌ Erreur validation token:", error);
      return res.status(500).json({
        success: false,
        message: "Erreur de validation d'authentification",
        code: "AUTH_ERROR",
      });
    }
  };

  // ✅ ALIAS EXPLICITE POUR COMPATIBILITÉ
  static validateToken = AuthMiddleware.authenticate;

  // Middleware pour vérifier les rôles
  static requireRole = (roles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Authentification requise",
          code: "NOT_AUTHENTICATED",
        });
      }

      const userRole = req.user.role || "user";
      const allowedRoles = Array.isArray(roles) ? roles : [roles];

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: "Permissions insuffisantes",
          code: "INSUFFICIENT_PERMISSIONS",
        });
      }

      next();
    };
  };

  // Middleware optionnel (continue même sans token)
  static optional = async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);

        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          req.user = {
            id: decoded.id,
            userId: decoded.id,
            nom: decoded.nom || decoded.name,
            // email: decoded.email,
            // role: decoded.role || "user",
          };
        } catch (jwtError) {
          // Token invalide mais on continue
          req.user = null;
        }
      } else {
        req.user = null;
      }

      next();
    } catch (error) {
      console.error("❌ Erreur auth optionnelle:", error);
      req.user = null;
      next();
    }
  };
}

module.exports = AuthMiddleware;
