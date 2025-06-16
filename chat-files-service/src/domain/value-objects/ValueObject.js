/**
 * Classe de base pour tous les Value Objects
 * CENADI Chat-Files-Service
 */

class ValueObject {
  constructor(value) {
    this.value = value;
    this.validate();
    Object.freeze(this);
  }

  validate() {
    // À implémenter dans les classes dérivées
  }

  equals(other) {
    if (!other || !(other instanceof this.constructor)) {
      return false;
    }
    return JSON.stringify(this.value) === JSON.stringify(other.value);
  }

  toString() {
    return JSON.stringify(this.value);
  }

  toJSON() {
    return this.value;
  }

  getValue() {
    return this.value;
  }
}

module.exports = ValueObject;
