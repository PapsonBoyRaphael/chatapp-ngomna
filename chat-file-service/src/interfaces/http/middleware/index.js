// Index principal pour exporter tous les middlewares
const rateLimitMiddleware = require("./rateLimitMiddleware");

// Middlewares optionnels (créés si manquants)
let authMiddleware, validationMiddleware;

try {
  authMiddleware = require("./authMiddleware");
  console.log("✅ authMiddleware chargé");
} catch (error) {
  console.warn("⚠️ authMiddleware non trouvé, utilisation du fallback");
  authMiddleware = {
    authenticate: (req, res, next) => {
      next();
    },
    validateToken: (req, res, next) => {
      next();
    },
  };
}

try {
  const ValidationMiddleware = require("./validationMiddleware");
  validationMiddleware = ValidationMiddleware; // ✅ DIRECTEMENT LA CLASSE
  console.log("✅ validationMiddleware chargé");
} catch (error) {
  console.warn("⚠️ validationMiddleware non trouvé, utilisation du fallback");
  validationMiddleware = {
    sanitizeInput: (req, res, next) => {
      // Nettoyage basique
      if (req.body) {
        Object.keys(req.body).forEach((key) => {
          if (typeof req.body[key] === "string") {
            req.body[key] = req.body[key].trim();
          }
        });
      }
      next();
    },
    validateMongoId: (paramName) => (req, res, next) => {
      const { ObjectId } = require("mongodb");
      const id = req.params[paramName];

      if (!id || !ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: `ID ${paramName} invalide`,
        });
      }
      next();
    },
    validateMessageSend: (req, res, next) => {
      const { content, conversationId } = req.body;

      if (!content?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Contenu du message requis",
        });
      }

      if (!conversationId) {
        return res.status(400).json({
          success: false,
          message: "ID de conversation requis",
        });
      }

      next();
    },
    validateConversationCreation: (req, res, next) => {
      const { participantId } = req.body;

      if (!participantId) {
        return res.status(400).json({
          success: false,
          message: "ID du participant requis",
          code: "MISSING_PARTICIPANT_ID",
        });
      }

      next();
    },
    validateMessageStatus: (req, res, next) => {
      const { status } = req.body;
      const validStatuses = ["SENT", "DELIVERED", "READ"];

      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Statut invalide",
          code: "INVALID_STATUS",
        });
      }

      next();
    },
  };
}

console.log("🔧 Middlewares initialisés:", {
  authMiddleware: !!authMiddleware?.authenticate,
  rateLimitMiddleware: !!rateLimitMiddleware?.apiLimit,
  validationMiddleware: !!validationMiddleware?.sanitizeInput,
});

module.exports = {
  authMiddleware,
  rateLimitMiddleware,
  validationMiddleware,
};
