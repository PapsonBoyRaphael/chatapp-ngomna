/**
 * File Validator - Chat Files Service
 * CENADI Chat-Files-Service
 * Validateur unifié pour tous les aspects des fichiers
 */

const path = require("path");
const mime = require("mime-types");
const { ValidationException } = require("../exceptions");
const { createLogger } = require("../utils/logger");

const logger = createLogger("FileValidator");

class FileValidator {
  constructor(config = {}) {
    this.config = {
      maxFileSize: config.maxFileSize || 100 * 1024 * 1024, // 100MB
      allowedMimeTypes: config.allowedMimeTypes || [
        "image/*",
        "video/*",
        "audio/*",
        "application/pdf",
        "text/*",
        "application/msword",
        "application/vnd.ms-excel",
        "application/zip",
        "application/x-zip-compressed",
      ],
      blockedExtensions: config.blockedExtensions || [
        "exe",
        "bat",
        "cmd",
        "com",
        "pif",
        "scr",
        "vbs",
        "js",
      ],
      maxFilenameLength: config.maxFilenameLength || 255,
      allowUnicode: config.allowUnicode !== false,
      ...config,
    };

    // Pattern pour caractères interdits dans les noms de fichiers
    this.forbiddenCharsPattern = /[<>:"|?*\x00-\x1f]/;
    this.windowsReservedNames = [
      "CON",
      "PRN",
      "AUX",
      "NUL",
      "COM1",
      "COM2",
      "COM3",
      "COM4",
      "COM5",
      "COM6",
      "COM7",
      "COM8",
      "COM9",
      "LPT1",
      "LPT2",
      "LPT3",
      "LPT4",
      "LPT5",
      "LPT6",
      "LPT7",
      "LPT8",
      "LPT9",
    ];

    logger.debug("🔍 FileValidator initialisé", {
      maxFileSize: this.formatFileSize(this.config.maxFileSize),
      allowedTypes: this.config.allowedMimeTypes.length,
      blockedExtensions: this.config.blockedExtensions.length,
    });
  }

  /**
   * Validation complète d'un fichier
   */
  validateFile(fileBuffer, fileName, options = {}) {
    const validationResults = {
      isValid: true,
      errors: [],
      warnings: [],
      metadata: {},
    };

    try {
      // 1. Validation du nom de fichier
      const filenameValidation = this.validateFilename(fileName);
      if (!filenameValidation.isValid) {
        validationResults.errors.push(...filenameValidation.errors);
        validationResults.isValid = false;
      }

      // 2. Validation de la taille
      const sizeValidation = this.validateFileSize(fileBuffer, options.maxSize);
      if (!sizeValidation.isValid) {
        validationResults.errors.push(...sizeValidation.errors);
        validationResults.isValid = false;
      }

      // 3. Validation du type MIME
      const mimeValidation = this.validateMimeType(
        fileName,
        fileBuffer,
        options.allowedTypes
      );
      if (!mimeValidation.isValid) {
        validationResults.errors.push(...mimeValidation.errors);
        validationResults.isValid = false;
      }

      // 4. Validation de sécurité
      const securityValidation = this.validateFileSecurity(
        fileBuffer,
        fileName
      );
      if (!securityValidation.isValid) {
        validationResults.errors.push(...securityValidation.errors);
        validationResults.isValid = false;
      }
      validationResults.warnings.push(...securityValidation.warnings);

      // 5. Métadonnées extraites
      validationResults.metadata = {
        originalName: fileName,
        sanitizedName: this.sanitizeFileName(fileName),
        size: fileBuffer.length,
        extension: this.getFileExtension(fileName),
        mimeType: this.getMimeType(fileName),
        category: this.getFileCategory(fileName),
        isSecure: securityValidation.isValid,
      };

      if (!validationResults.isValid) {
        logger.warn("❌ Validation fichier échouée:", {
          fileName,
          errors: validationResults.errors,
          size: fileBuffer.length,
        });
      }

      return validationResults;
    } catch (error) {
      logger.error("❌ Erreur validation fichier:", {
        error: error.message,
        fileName,
      });
      throw new ValidationException(
        `Erreur validation fichier: ${error.message}`
      );
    }
  }

  /**
   * Validation du nom de fichier
   */
  validateFilename(fileName) {
    const result = { isValid: true, errors: [] };

    if (!fileName || typeof fileName !== "string") {
      result.errors.push("Nom de fichier requis");
      result.isValid = false;
      return result;
    }

    // Longueur
    if (fileName.length > this.config.maxFilenameLength) {
      result.errors.push(
        `Nom de fichier trop long (max: ${this.config.maxFilenameLength})`
      );
      result.isValid = false;
    }

    // Caractères interdits
    if (this.forbiddenCharsPattern.test(fileName)) {
      result.errors.push("Caractères interdits dans le nom de fichier");
      result.isValid = false;
    }

    // Noms réservés Windows
    const baseName = path.parse(fileName).name.toUpperCase();
    if (this.windowsReservedNames.includes(baseName)) {
      result.errors.push("Nom de fichier réservé par le système");
      result.isValid = false;
    }

    // Début/fin par point ou espace
    if (
      fileName.startsWith(".") ||
      fileName.endsWith(".") ||
      fileName.startsWith(" ") ||
      fileName.endsWith(" ")
    ) {
      result.errors.push(
        "Le nom ne peut pas commencer/finir par un point ou un espace"
      );
      result.isValid = false;
    }

    // Extension obligatoire
    if (!path.extname(fileName)) {
      result.errors.push("Extension de fichier requise");
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validation de la taille de fichier
   */
  validateFileSize(fileBuffer, customMaxSize = null) {
    const result = { isValid: true, errors: [] };
    const maxSize = customMaxSize || this.config.maxFileSize;

    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      result.errors.push("Contenu de fichier invalide");
      result.isValid = false;
      return result;
    }

    if (fileBuffer.length === 0) {
      result.errors.push("Fichier vide non autorisé");
      result.isValid = false;
    }

    if (fileBuffer.length > maxSize) {
      result.errors.push(
        `Fichier trop volumineux: ${this.formatFileSize(
          fileBuffer.length
        )} > ${this.formatFileSize(maxSize)}`
      );
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validation du type MIME
   */
  validateMimeType(fileName, fileBuffer, customAllowedTypes = null) {
    const result = { isValid: true, errors: [] };
    const allowedTypes = customAllowedTypes || this.config.allowedMimeTypes;

    // Détection du type MIME
    const detectedMimeType = this.getMimeType(fileName);
    const magicMimeType = this.detectMimeTypeFromMagicBytes(fileBuffer);

    // Vérifier l'extension bloquée
    const extension = this.getFileExtension(fileName).toLowerCase();
    if (this.config.blockedExtensions.includes(extension)) {
      result.errors.push(`Type de fichier non autorisé: .${extension}`);
      result.isValid = false;
    }

    // Vérifier que le type est autorisé
    const isAllowed = allowedTypes.some((allowedType) => {
      if (allowedType.endsWith("/*")) {
        const category = allowedType.slice(0, -2);
        return detectedMimeType.startsWith(category);
      }
      return detectedMimeType === allowedType;
    });

    if (!isAllowed) {
      result.errors.push(`Type de fichier non autorisé: ${detectedMimeType}`);
      result.isValid = false;
    }

    // Vérifier la cohérence extension/type MIME
    if (magicMimeType && magicMimeType !== detectedMimeType) {
      result.errors.push("Incohérence entre extension et contenu du fichier");
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validation de sécurité basique
   */
  validateFileSecurity(fileBuffer, fileName) {
    const result = { isValid: true, errors: [], warnings: [] };

    try {
      // Vérifier les magic bytes suspects
      const magicBytes = fileBuffer.slice(0, 16);
      const suspiciousPatterns = this.detectSuspiciousPatterns(
        magicBytes,
        fileName
      );

      if (suspiciousPatterns.length > 0) {
        result.warnings.push(
          ...suspiciousPatterns.map(
            (pattern) => `Pattern suspect détecté: ${pattern}`
          )
        );
      }

      // Vérifier la taille vs type déclaré
      const expectedSizeRange = this.getExpectedSizeRange(fileName);
      if (
        expectedSizeRange &&
        (fileBuffer.length < expectedSizeRange.min ||
          fileBuffer.length > expectedSizeRange.max)
      ) {
        result.warnings.push("Taille de fichier inhabituelle pour ce type");
      }

      // Double extension
      if (this.hasDoubleExtension(fileName)) {
        result.warnings.push("Double extension détectée");
      }
    } catch (error) {
      logger.warn("⚠️ Erreur validation sécurité:", { error: error.message });
      result.warnings.push(
        "Impossible de valider complètement la sécurité du fichier"
      );
    }

    return result;
  }

  /**
   * Utilitaires de validation
   */

  sanitizeFileName(fileName) {
    if (!fileName) return "";

    let sanitized = fileName
      // Remplacer les caractères interdits
      .replace(this.forbiddenCharsPattern, "_")
      // Normaliser les espaces
      .replace(/\s+/g, "_")
      // Supprimer les points en début/fin
      .replace(/^\.+|\.+$/g, "")
      // Limiter la longueur
      .substring(0, this.config.maxFilenameLength);

    // S'assurer qu'il y a une extension
    if (!path.extname(sanitized) && path.extname(fileName)) {
      const originalExt = path.extname(fileName);
      const maxNameLength = this.config.maxFilenameLength - originalExt.length;
      sanitized = sanitized.substring(0, maxNameLength) + originalExt;
    }

    return sanitized;
  }

  getFileExtension(fileName) {
    return path.extname(fileName).slice(1).toLowerCase();
  }

  getMimeType(fileName) {
    return mime.lookup(fileName) || "application/octet-stream";
  }

  getFileCategory(fileName) {
    const mimeType = this.getMimeType(fileName);

    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    if (
      mimeType.includes("pdf") ||
      mimeType.includes("document") ||
      mimeType.includes("text")
    )
      return "document";
    if (mimeType.includes("zip") || mimeType.includes("compressed"))
      return "archive";

    return "other";
  }

  detectMimeTypeFromMagicBytes(fileBuffer) {
    if (!fileBuffer || fileBuffer.length < 4) return null;

    const magicBytes = fileBuffer.slice(0, 16);
    const hex = magicBytes.toString("hex").toUpperCase();

    // Signatures courantes
    const signatures = {
      FFD8FF: "image/jpeg",
      "89504E47": "image/png",
      47494638: "image/gif",
      25504446: "application/pdf",
      "504B0304": "application/zip",
      D0CF11E0: "application/msword",
    };

    for (const [signature, mimeType] of Object.entries(signatures)) {
      if (hex.startsWith(signature)) {
        return mimeType;
      }
    }

    return null;
  }

  detectSuspiciousPatterns(magicBytes, fileName) {
    const patterns = [];
    const hex = magicBytes.toString("hex").toUpperCase();

    // Exécutables Windows
    if (hex.startsWith("4D5A")) {
      // MZ header
      patterns.push("Exécutable Windows détecté");
    }

    // Scripts
    if (hex.startsWith("2321")) {
      // Shebang #!
      patterns.push("Script détecté");
    }

    // Archives avec extensions trompeuses
    if (hex.startsWith("504B") && !fileName.match(/\.(zip|docx|xlsx|pptx)$/i)) {
      patterns.push("Archive avec extension trompeuse");
    }

    return patterns;
  }

  hasDoubleExtension(fileName) {
    const parts = fileName.split(".");
    return parts.length > 2 && parts[parts.length - 2].length <= 4;
  }

  getExpectedSizeRange(fileName) {
    const mimeType = this.getMimeType(fileName);

    // Ranges très approximatifs pour détection d'anomalies
    const ranges = {
      "image/jpeg": { min: 100, max: 50 * 1024 * 1024 },
      "image/png": { min: 100, max: 50 * 1024 * 1024 },
      "application/pdf": { min: 1000, max: 100 * 1024 * 1024 },
      "text/plain": { min: 1, max: 10 * 1024 * 1024 },
    };

    return ranges[mimeType] || null;
  }

  formatFileSize(bytes) {
    if (!bytes) return "0 B";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  }

  /**
   * Validation rapide pour middleware
   */
  quickValidate(fileName, fileSize, mimeType) {
    const errors = [];

    if (!this.isValidFilename(fileName)) {
      errors.push("Nom de fichier invalide");
    }

    if (fileSize > this.config.maxFileSize) {
      errors.push("Fichier trop volumineux");
    }

    const extension = this.getFileExtension(fileName);
    if (this.config.blockedExtensions.includes(extension)) {
      errors.push("Type de fichier non autorisé");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  isValidFilename(fileName) {
    return (
      fileName &&
      typeof fileName === "string" &&
      fileName.length <= this.config.maxFilenameLength &&
      !this.forbiddenCharsPattern.test(fileName) &&
      !this.windowsReservedNames.includes(
        path.parse(fileName).name.toUpperCase()
      ) &&
      path.extname(fileName)
    );
  }

  isMimeTypeConsistent(fileName, detectedMimeType) {
    const expectedMimeType = this.getMimeType(fileName);
    return expectedMimeType === detectedMimeType;
  }
}

module.exports = FileValidator;
