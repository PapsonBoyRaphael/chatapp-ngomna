/**
 * Matricule Value Object
 * 
 * Why use a value object?
 * - Encapsulates validation logic
 * - Prevents invalid matricules from being created
 * - Makes the domain model more expressive
 * - Ensures consistency across the application
 */
class Matricule {
  constructor(value) {
    this.validateFormat(value);
    this.value = value.toUpperCase();
  }

  validateFormat(value) {
    if (!value || typeof value !== 'string') {
      throw new Error('Matricule must be a non-empty string');
    }

    const trimmedValue = value.trim().toUpperCase();
    
    // Format: 6 digits followed by 1 letter (e.g., 010204B)
    const matriculePattern = /^[0-9]{6}[A-Z]$/;
    
    if (!matriculePattern.test(trimmedValue)) {
      throw new Error('Matricule must be 6 digits followed by 1 letter (e.g., 010204B)');
    }
  }

  toString() {
    return this.value;
  }

  equals(other) {
    if (!(other instanceof Matricule)) {
      return false;
    }
    return this.value === other.value;
  }

  static fromString(value) {
    return new Matricule(value);
  }
}

module.exports = Matricule;