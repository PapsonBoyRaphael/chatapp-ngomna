const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

class AuthMiddleware {
  // Middleware pour valider le token JWT
  static authenticate = async (req, res, next) => {
    next();
    // try {
    //   const authHeader = req.headers.authorization;
    //   const userIdHeader = req.headers["user-id"];

    //   // 1. Vérifier la présence du token
    //   if (!authHeader || !authHeader.startsWith("Bearer ")) {
    //     // ✅ RETURN après la réponse
    //     return res.status(401).json({
    //       success: false,
    //       message: "Token d'authentification requis",
    //       code: "MISSING_TOKEN",
    //     });
    //   }

    //   const token = authHeader.substring(7);

    //   // 2. Valider le token JWT
    //   try {
    //     const decoded = jwt.verify(token, process.env.JWT_SECRET);
    //     req.user = decoded;

    //     // ✅ APPELER next() seulement si authentification réussie
    //     return next();
    //   } catch (jwtError) {
    //     console.warn("⚠️ Token JWT invalide:", jwtError.message);

    //     // ✅ RETURN après la réponse d'erreur JWT
    //     return res.status(401).json({
    //       success: false,
    //       message: "Token invalide ou expiré",
    //       code: "INVALID_TOKEN",
    //       error:
    //         process.env.NODE_ENV === "development"
    //           ? jwtError.message
    //           : undefined,
    //     });
    //   }
    // } catch (error) {
    //   console.error("❌ Erreur validation token:", error);

    //   // ✅ VÉRIFIER si la réponse n'a pas déjà été envoyée
    //   if (!res.headersSent) {
    //     return res.status(500).json({
    //       success: false,
    //       message: "Erreur serveur lors de l'authentification",
    //       code: "AUTH_SERVER_ERROR",
    //     });
    //   }

    //   // Si headers déjà envoyés, ne pas essayer d'envoyer une réponse
    //   return;
    // }
  };

  // ✅ ALIAS EXPLICITE POUR COMPATIBILITÉ
  static validateToken = AuthMiddleware.authenticate;

  // Middleware pour vérifier les rôles
  static requireRole = (roles) => {
    next();
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
    next();
    try {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7);

        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          req.user = {
            id: decoded.id,
            userId: decoded.id, // Compatibilité
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

      // next();
    } catch (error) {
      console.error("❌ Erreur auth optionnelle:", error);
      req.user = null;
      next();
    }
  };
}

module.exports = AuthMiddleware;
