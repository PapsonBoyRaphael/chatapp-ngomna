/**
 * Rank Value Object
 * 
 * Why use a value object for rank?
 * - Encapsulates rank validation and hierarchy logic
 * - Provides methods for rank comparison
 * - Ensures consistent rank handling across the application
 */
class Rank {
  constructor(rankName) {
    this.validateRank(rankName);
    this.name = rankName.trim().toUpperCase();
    this.hierarchy = this.getHierarchy();
    this.sanitized = this.sanitizeForNeo4j(this.name);
  }

  static ROLE_HIERARCHY = {
    PRESIDENT: 9,
    MINISTRE: 8,
    MINISTRE_DELEGUE: 8,
    MINISTRE_DETAT: 8,
    SECRETAIRE_GENERAL: 7,
    DIRECTEUR_GENERAL: 6,
    DIRECTEUR: 5,
    SOUS_DIRECTEUR: 4,
    CHEF_DE_DIVISION: 4,
    CHEF_DE_SERVICE: 3,
    CHEF_DE_BUREAU: 2,
    CADRE: 1
  };

  static ROLE_EQUIVALENCIES = {
    SOUS_DIRECTEUR: ['CHEF_DE_DIVISION'],
    MINISTRE: ['MINISTRE_DELEGUE', 'MINISTRE_DETAT']
  };

  validateRank(rankName) {
    if (!rankName || typeof rankName !== 'string' || rankName.trim().length === 0) {
      throw new Error('Rank must be a non-empty string');
    }
  }

  getHierarchy() {
    // Try direct match first
    const sanitizedName = this.sanitizeForNeo4j(this.name);
    if (Rank.ROLE_HIERARCHY[sanitizedName]) {
      return Rank.ROLE_HIERARCHY[sanitizedName];
    }

    // Check equivalencies
    for (const [mainRole, equivalents] of Object.entries(Rank.ROLE_EQUIVALENCIES)) {
      if (equivalents.includes(sanitizedName)) {
        return Rank.ROLE_HIERARCHY[mainRole];
      }
    }

    // Default to lowest hierarchy if not found
    return 1;
  }

  sanitizeForNeo4j(rankName) {
    return rankName
      .replace(/'/g, '_')
      .replace(/'/g, '_')
      .replace(/'/g, '_')
      .replace(/\s+/g, '_')
      .replace(/-/g, '_')
      .replace(/[ÀÁÂÃÄÅ]/g, 'A')
      .replace(/[ÈÉÊË]/g, 'E')
      .replace(/[ÌÍÎÏ]/g, 'I')
      .replace(/[ÒÓÔÕÖ]/g, 'O')
      .replace(/[ÙÚÛÜ]/g, 'U')
      .replace(/Ç/g, 'C')
      .replace(/[^A-Z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  isHigherThan(otherRank) {
    if (!(otherRank instanceof Rank)) {
      otherRank = new Rank(otherRank);
    }
    return this.hierarchy > otherRank.hierarchy;
  }

  isEqualTo(otherRank) {
    if (!(otherRank instanceof Rank)) {
      otherRank = new Rank(otherRank);
    }
    return this.hierarchy === otherRank.hierarchy;
  }

  isHigherOrEqualTo(otherRank) {
    return this.isHigherThan(otherRank) || this.isEqualTo(otherRank);
  }

  toString() {
    return this.name;
  }

  toJSON() {
    return {
      name: this.name,
      sanitized: this.sanitized,
      hierarchy: this.hierarchy
    };
  }
}

module.exports = Rank;