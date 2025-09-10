const Matricule = require('../value-objects/Matricule');
const RangSanitizer = require('../services/RangSanitizer');

/**
 * Agent Entity
 * 
 * Why use an entity?
 * - Represents a core business concept
 * - Encapsulates agent-related business logic
 * - Ensures data integrity and validation
 * - Provides a clear interface for working with agents
 */
class Agent {
  constructor({
    matricule,
    nom,
    prenom,
    sexe,
    mmnaissance,
    aanaissance,
    rang,
    ministere
  }) {
    this.matricule = matricule instanceof Matricule ? matricule : new Matricule(matricule);
    this.nom = this.validateAndFormatName(nom, 'nom');
    this.prenom = this.validateAndFormatName(prenom, 'prenom');
    this.sexe = this.validateSexe(sexe);
    this.mmnaissance = this.validateMonth(mmnaissance);
    this.aanaissance = this.validateYear(aanaissance);
    this.rang = this.validateRang(rang);
    this.ministere = this.validateMinistere(ministere);
    this.sanitizedRang = RangSanitizer.sanitizeRang(rang);
  }

  validateAndFormatName(name, fieldName) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error(`${fieldName} must be a non-empty string`);
    }
    return name.trim();
  }

  validateSexe(sexe) {
    if (!sexe || typeof sexe !== 'string') {
      throw new Error('Sexe must be specified');
    }
    const validSexes = ['M', 'F', 'MASCULIN', 'FEMININ'];
    const normalizedSexe = sexe.toUpperCase().trim();
    if (!validSexes.includes(normalizedSexe)) {
      throw new Error('Sexe must be M, F, MASCULIN, or FEMININ');
    }
    return normalizedSexe;
  }

  validateMonth(month) {
    const monthNum = parseInt(month);
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      throw new Error('Month of birth must be between 1 and 12');
    }
    return monthNum;
  }

  validateYear(year) {
    const yearNum = parseInt(year);
    const currentYear = new Date().getFullYear();
    if (isNaN(yearNum) || yearNum < 1940 || yearNum > currentYear - 18) {
      throw new Error(`Year of birth must be between 1940 and ${currentYear - 18}`);
    }
    return yearNum;
  }

  validateRang(rang) {
    if (!rang || typeof rang !== 'string' || rang.trim().length === 0) {
      throw new Error('Rang must be a non-empty string');
    }
    return rang.trim();
  }

  validateMinistere(ministere) {
    if (!ministere || typeof ministere !== 'string' || ministere.trim().length === 0) {
      throw new Error('Ministere must be a non-empty string');
    }
    return ministere.trim();
  }

  toJSON() {
    return {
      matricule: this.matricule.toString(),
      nom: this.nom,
      prenom: this.prenom,
      sexe: this.sexe,
      mmnaissance: this.mmnaissance,
      aanaissance: this.aanaissance,
      rang: this.rang,
      sanitizedRang: this.sanitizedRang,
      ministere: this.ministere
    };
  }

  getFullName() {
    return `${this.prenom} ${this.nom}`;
  }

  getAge() {
    const currentYear = new Date().getFullYear();
    return currentYear - this.aanaissance;
  }
}

module.exports = Agent;