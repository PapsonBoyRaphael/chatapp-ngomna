/**
 * Input Validator - Chat Files Service
 * CENADI Chat-Files-Service
 * Validateur unifié pour les entrées générales
 */

const { ValidationException } = require("../exceptions");
const { createLogger } = require("../utils/logger");

const logger = createLogger("InputValidator");

class InputValidator {
  constructor() {
    // Patterns de validation
    this.patterns = {
      objectId: /^[0-9a-fA-F]{24}$/,
      uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      url: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
    };
  }

  /**
   * Validation d'ID (ObjectId MongoDB ou UUID)
   */
  validateId(id, fieldName = "id") {
    if (!id) {
      throw new ValidationException(`${fieldName} est requis`);
    }

    if (typeof id !== "string") {
      throw new ValidationException(`${fieldName} doit être une chaîne`);
    }

    if (!this.patterns.objectId.test(id) && !this.patterns.uuid.test(id)) {
      throw new ValidationException(
        `${fieldName} n'est pas un identifiant valide`
      );
    }

    return id;
  }

  /**
   * Validation d'email
   */
  validateEmail(email, fieldName = "email") {
    if (!email) {
      throw new ValidationException(`${fieldName} est requis`);
    }

    if (!this.patterns.email.test(email)) {
      throw new ValidationException(`${fieldName} invalide`);
    }

    return email.toLowerCase().trim();
  }

  /**
   * Validation d'URL
   */
  validateUrl(url, fieldName = "url") {
    if (!url) {
      throw new ValidationException(`${fieldName} est requis`);
    }

    if (!this.patterns.url.test(url)) {
      throw new ValidationException(`${fieldName} invalide`);
    }

    return url;
  }

  /**
   * Validation de pagination
   */
  validatePagination(pagination = {}) {
    const normalized = {
      page: Math.max(1, parseInt(pagination.page) || 1),
      limit: Math.min(100, Math.max(1, parseInt(pagination.limit) || 20)),
    };

    if (normalized.page > 1000) {
      throw new ValidationException("Numéro de page trop élevé (max: 1000)");
    }

    return normalized;
  }

  /**
   * Validation de données avec schéma
   */
  validateWithSchema(data, schema) {
    if (!data) {
      throw new ValidationException("Données requises");
    }

    if (schema && typeof schema.validate === "function") {
      const { error, value } = schema.validate(data);
      if (error) {
        throw new ValidationException(`Validation échouée: ${error.message}`);
      }
      return value;
    }

    return data;
  }

  /**
   * Validation de chaîne de caractères
   */
  validateString(value, fieldName, options = {}) {
    const {
      required = true,
      minLength = 0,
      maxLength = 1000,
      pattern = null,
      trim = true,
    } = options;

    if (required && (!value || typeof value !== "string")) {
      throw new ValidationException(`${fieldName} est requis`);
    }

    if (!value) return trim ? "" : value;

    let processedValue = trim ? value.trim() : value;

    if (processedValue.length < minLength) {
      throw new ValidationException(
        `${fieldName} trop court (min: ${minLength})`
      );
    }

    if (processedValue.length > maxLength) {
      throw new ValidationException(
        `${fieldName} trop long (max: ${maxLength})`
      );
    }

    if (pattern && !pattern.test(processedValue)) {
      throw new ValidationException(`Format de ${fieldName} invalide`);
    }

    return processedValue;
  }

  /**
   * Validation de nombre
   */
  validateNumber(value, fieldName, options = {}) {
    const {
      required = true,
      min = Number.MIN_SAFE_INTEGER,
      max = Number.MAX_SAFE_INTEGER,
      integer = false,
    } = options;

    if (required && (value === undefined || value === null)) {
      throw new ValidationException(`${fieldName} est requis`);
    }

    if (value === undefined || value === null) return value;

    const numValue = Number(value);

    if (isNaN(numValue)) {
      throw new ValidationException(`${fieldName} doit être un nombre`);
    }

    if (integer && !Number.isInteger(numValue)) {
      throw new ValidationException(`${fieldName} doit être un entier`);
    }

    if (numValue < min || numValue > max) {
      throw new ValidationException(
        `${fieldName} doit être entre ${min} et ${max}`
      );
    }

    return numValue;
  }

  /**
   * Validation de date
   */
  validateDate(value, fieldName, options = {}) {
    const { required = true, minDate = null, maxDate = null } = options;

    if (required && !value) {
      throw new ValidationException(`${fieldName} est requis`);
    }

    if (!value) return value;

    const date = new Date(value);

    if (isNaN(date.getTime())) {
      throw new ValidationException(`${fieldName} invalide`);
    }

    if (minDate && date < new Date(minDate)) {
      throw new ValidationException(`${fieldName} trop ancienne`);
    }

    if (maxDate && date > new Date(maxDate)) {
      throw new ValidationException(`${fieldName} trop récente`);
    }

    return date;
  }

  /**
   * Validation de tableau
   */
  validateArray(value, fieldName, options = {}) {
    const {
      required = true,
      minLength = 0,
      maxLength = 100,
      itemValidator = null,
    } = options;

    if (required && (!value || !Array.isArray(value))) {
      throw new ValidationException(
        `${fieldName} est requis et doit être un tableau`
      );
    }

    if (!value) return value;

    if (!Array.isArray(value)) {
      throw new ValidationException(`${fieldName} doit être un tableau`);
    }

    if (value.length < minLength) {
      throw new ValidationException(
        `${fieldName} doit contenir au moins ${minLength} éléments`
      );
    }

    if (value.length > maxLength) {
      throw new ValidationException(
        `${fieldName} ne peut pas contenir plus de ${maxLength} éléments`
      );
    }

    if (itemValidator) {
      return value.map((item, index) => {
        try {
          return itemValidator(item);
        } catch (error) {
          throw new ValidationException(
            `${fieldName}[${index}]: ${error.message}`
          );
        }
      });
    }

    return value;
  }

  /**
   * Validation d'objet avec champs requis
   */
  validateObject(value, fieldName, requiredFields = []) {
    if (!value || typeof value !== "object") {
      throw new ValidationException(
        `${fieldName} est requis et doit être un objet`
      );
    }

    for (const field of requiredFields) {
      if (
        value[field] === undefined ||
        value[field] === null ||
        value[field] === ""
      ) {
        throw new ValidationException(`${fieldName}.${field} est requis`);
      }
    }

    return value;
  }

  /**
   * Sanitisation des données d'entrée
   */
  sanitizeInput(input, options = {}) {
    const {
      trimStrings = true,
      removeEmptyFields = false,
      maxDepth = 10,
    } = options;

    return this._sanitizeRecursive(
      input,
      trimStrings,
      removeEmptyFields,
      0,
      maxDepth
    );
  }

  _sanitizeRecursive(obj, trimStrings, removeEmptyFields, depth, maxDepth) {
    if (depth > maxDepth) return obj;

    if (typeof obj === "string" && trimStrings) {
      return obj.trim();
    }

    if (Array.isArray(obj)) {
      return obj
        .map((item) =>
          this._sanitizeRecursive(
            item,
            trimStrings,
            removeEmptyFields,
            depth + 1,
            maxDepth
          )
        )
        .filter((item) => !removeEmptyFields || (item !== "" && item != null));
    }

    if (obj && typeof obj === "object") {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        const sanitizedValue = this._sanitizeRecursive(
          value,
          trimStrings,
          removeEmptyFields,
          depth + 1,
          maxDepth
        );

        if (
          !removeEmptyFields ||
          (sanitizedValue !== "" && sanitizedValue != null)
        ) {
          sanitized[key] = sanitizedValue;
        }
      }
      return sanitized;
    }

    return obj;
  }

  /**
   * Validation rapide d'ID
   */
  isValidId(id) {
    return this.patterns.objectId.test(id) || this.patterns.uuid.test(id);
  }

  /**
   * Validation rapide d'email
   */
  isValidEmail(email) {
    return this.patterns.email.test(email);
  }
}

module.exports = InputValidator;
