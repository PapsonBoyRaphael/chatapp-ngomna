/**
 * Validators Index - Chat Files Service
 * CENADI Chat-Files-Service
 * Export centralisé des validateurs (sans PermissionValidator)
 */

const FileValidator = require("./FileValidator");
const InputValidator = require("./InputValidator");

// Instances singleton pour performance
let fileValidator = null;
let inputValidator = null;

/**
 * Factory pour créer les validateurs avec configuration
 */
function createValidators(config = {}) {
  const fileValidatorConfig = {
    maxFileSize: config.maxFileSize || 100 * 1024 * 1024,
    allowedMimeTypes: config.allowedMimeTypes || [
      "image/*",
      "video/*",
      "audio/*",
      "application/pdf",
      "text/*",
    ],
    blockedExtensions: config.blockedExtensions || [
      "exe",
      "bat",
      "cmd",
      "com",
      "scr",
    ],
    ...config.fileValidator,
  };

  return {
    fileValidator: new FileValidator(fileValidatorConfig),
    inputValidator: new InputValidator(),
  };
}

/**
 * Obtenir les instances singleton
 */
function getValidators() {
  if (!fileValidator) {
    fileValidator = new FileValidator();
  }

  if (!inputValidator) {
    inputValidator = new InputValidator();
  }

  return {
    fileValidator,
    inputValidator,
  };
}

/**
 * Validation complète d'une requête de fichier (simplifiée)
 */
async function validateFileRequest(req, options = {}) {
  const { fileValidator, inputValidator } = getValidators();

  const errors = [];
  const warnings = [];

  try {
    // 1. Validation des paramètres d'entrée
    if (req.params?.fileId) {
      inputValidator.validateId(req.params.fileId, "fileId");
    }

    if (req.params?.chatId) {
      inputValidator.validateId(req.params.chatId, "chatId");
    }

    // 2. Validation du fichier si présent
    if (req.file || req.files) {
      const files = req.files || [req.file];

      for (const file of files) {
        const fileValidation = fileValidator.validateFile(
          file.buffer,
          file.originalname,
          options
        );

        if (!fileValidation.isValid) {
          errors.push(...fileValidation.errors);
        }
        warnings.push(...fileValidation.warnings);
      }
    }

    // 3. Validation d'authentification simple (pas de rôles complexes)
    if (options.requireAuth && !req.user) {
      errors.push("Authentification requise");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  } catch (error) {
    return {
      isValid: false,
      errors: [error.message],
      warnings,
    };
  }
}

/**
 * Middleware de validation express (simplifié)
 */
function createValidationMiddleware(options = {}) {
  return async (req, res, next) => {
    try {
      const validation = await validateFileRequest(req, options);

      if (!validation.isValid) {
        return res.status(400).json({
          error: "Validation échouée",
          details: validation.errors,
          warnings: validation.warnings,
        });
      }

      // Ajouter les warnings aux headers pour information
      if (validation.warnings.length > 0) {
        res.set("X-Validation-Warnings", JSON.stringify(validation.warnings));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Validation rapide pour les API (sans permissions complexes)
 */
const quickValidators = {
  isValidFileId: (id) => getValidators().inputValidator.isValidId(id),
  isValidEmail: (email) => getValidators().inputValidator.isValidEmail(email),
  isValidFilename: (filename) =>
    getValidators().fileValidator.isValidFilename(filename),
  isAuthenticated: (user) => !!user && !!user.id,
};

/**
 * Validation d'accès simplifiée (même rôle pour tous)
 */
function validateSimpleAccess(user, resource = null) {
  if (!user || !user.id) {
    throw new Error("Utilisateur non authentifié");
  }

  // Optionnel : vérifier que l'utilisateur peut accéder à ses propres fichiers
  if (resource && resource.uploadedBy && resource.uploadedBy !== user.id) {
    // Dans CENADI, peut-être que tous peuvent voir tous les fichiers ?
    // Ou seulement ses propres fichiers ? À adapter selon les besoins.
    return true; // Autoriser l'accès pour tous les utilisateurs authentifiés
  }

  return true;
}

module.exports = {
  // Classes principales
  FileValidator,
  InputValidator,

  // Factory et singletons
  createValidators,
  getValidators,

  // Fonctions de validation
  validateFileRequest,
  createValidationMiddleware,
  validateSimpleAccess,

  // Validateurs rapides
  quickValidators,

  // Pour compatibilité avec l'ancien code
  fileValidator: () => getValidators().fileValidator,
  inputValidator: () => getValidators().inputValidator,
};
