/**
 * Cypher Sanitizer Service
 * 
 * Purpose: Safely handle French text and special characters in Cypher queries
 */
class CypherSanitizer {
  static sanitizeProperty(value) {
    if (typeof value !== 'string') {
      return value;
    }

    // Escape quotes and backslashes for Cypher
    return value
      .replace(/\\/g, '\\\\')  // Escape backslashes
      .replace(/"/g, '\\"')    // Escape double quotes
      .replace(/'/g, "\\'");   // Escape single quotes
  }

  static sanitizeForRelationshipProperty(rank) {
    // This preserves the original rank with proper escaping
    return CypherSanitizer.sanitizeProperty(rank);
  }

  static createSafeParameter(value) {
    // For use with parameterized queries - much safer
    return value;
  }

  static sanitizeUnitName(unitName) {
    if (!unitName || typeof unitName !== 'string') {
      return '';
    }
    return CypherSanitizer.sanitizeProperty(unitName.trim());
  }
}

module.exports = CypherSanitizer;