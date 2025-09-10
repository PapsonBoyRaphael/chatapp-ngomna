// src/domain/services/RangSanitizer.js
/**
 * Rang Sanitizer Service
 *
 * Why a domain service?
 * - Encapsulates business logic for sanitizing French text
 * - Ensures Neo4j compatibility
 * - Centralizes the sanitization rules
 * - Makes it easy to add new sanitization rules
 */
class RangSanitizer {
  static sanitizeRang(rang) {
    if (!rang || typeof rang !== "string") {
      throw new Error("Rang must be a non-empty string");
    }

    let sanitized = rang.trim().toUpperCase();

    // Handle French apostrophes and special characters
    const sanitizationRules = {
      // Remove apostrophes and replace with underscore
      "'": "_",
      "'": "_",
      "'": "_",

      // Replace spaces with underscores
      " ": "_",

      // Replace hyphens with underscores
      "-": "_",

      // Remove accented characters
      À: "A",
      Á: "A",
      Â: "A",
      Ã: "A",
      Ä: "A",
      Å: "A",
      È: "E",
      É: "E",
      Ê: "E",
      Ë: "E",
      Ì: "I",
      Í: "I",
      Î: "I",
      Ï: "I",
      Ò: "O",
      Ó: "O",
      Ô: "O",
      Õ: "O",
      Ö: "O",
      Ù: "U",
      Ú: "U",
      Û: "U",
      Ü: "U",
      Ç: "C",
      Ñ: "N",
    };

    // Apply sanitization rules
    for (const [search, replace] of Object.entries(sanitizationRules)) {
      sanitized = sanitized.replace(new RegExp(search, "g"), replace);
    }

    // Remove any remaining special characters and multiple underscores
    sanitized = sanitized
      .replace(/[^A-Z0-9_]/g, "")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");

    if (!sanitized) {
      throw new Error("Sanitized rang cannot be empty");
    }

    return sanitized;
  }

  static getSanitizationMapping() {
    return {
      "MINISTRE D'ETAT": "MINISTRE_DETAT",
      "MINISTRE DÉLÉGUÉ": "MINISTRE_DELEGUE",
      "SECRÉTAIRE GÉNÉRAL": "SECRETAIRE_GENERAL",
      "DIRECTEUR GÉNÉRAL": "DIRECTEUR_GENERAL",
      "SOUS-DIRECTEUR": "SOUS_DIRECTEUR",
      "CHEF DE DIVISION": "CHEF_DE_DIVISION",
      "CHEF DE SERVICE": "CHEF_DE_SERVICE",
      "CHEF DE BUREAU": "CHEF_DE_BUREAU",
    };
  }
}

module.exports = RangSanitizer;
