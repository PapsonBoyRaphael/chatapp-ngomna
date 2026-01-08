const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

class AuthMiddleware {
  // Middleware pour valider le token JWT
  static authenticate = (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      const bearerToken =
        authHeader && authHeader.startsWith("Bearer ")
          ? authHeader.substring(7)
          : null;

      const cookieToken = req.cookies?.accessToken;

      const token = bearerToken || cookieToken;

      console.log("[AuthMiddleware] Incoming auth check", {
        hasAuthHeader: !!authHeader,
        hasBearer: !!bearerToken,
        hasCookieToken: !!cookieToken,
        path: req.path,
        method: req.method,
      });

      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Token d'authentification requis",
          code: "MISSING_TOKEN",
        });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log("[AuthMiddleware] JWT décodé", {
        userId: decoded.id || decoded.matricule,
        matricule: decoded.matricule,
        hasNom: !!decoded.nom,
        hasPrenom: !!decoded.prenom,
      });
      req.user = {
        id: decoded.id || decoded.matricule,
        userId: decoded.id || decoded.matricule,
        matricule: decoded.matricule,
      };

      return next();
    } catch (error) {
      console.warn("⚠️ Token JWT invalide", {
        message: error.message,
        path: req.path,
        method: req.method,
      });

      if (!res.headersSent) {
        return res.status(401).json({
          success: false,
          message: "Token invalide ou expiré",
          code: "INVALID_TOKEN",
        });
      }

      return;
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
      const bearerToken =
        authHeader && authHeader.startsWith("Bearer ")
          ? authHeader.substring(7)
          : null;
      const cookieToken = req.cookies?.accessToken;
      const token = bearerToken || cookieToken;

      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          req.user = {
            id: decoded.id || decoded.matricule,
            userId: decoded.id || decoded.matricule,
            matricule: decoded.matricule,
            nom: decoded.nom,
            prenom: decoded.prenom,
            ministere: decoded.ministere,
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
